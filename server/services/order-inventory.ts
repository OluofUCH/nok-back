import mongoose, { type ClientSession, type Types } from "mongoose";
import { Order } from "../models/Order";
import { Product } from "../models/Product";
import { HttpError } from "../utils/http-error";

const reservationMinutes = Math.min(60, Math.max(5, Number(process.env.INVENTORY_RESERVATION_MINUTES) || 20));
const TRANSACTION_OPTIONS = {
  readConcern: { level: "snapshot" as const },
  writeConcern: { w: "majority" as const },
  readPreference: "primary" as const,
};

export type SafeAddress = {
  fullName: string;
  address: string;
  city: string;
  state: string;
  zipCode: string;
  country: string;
  phone: string;
};

function cleanText(value: unknown, max: number) {
  return String(value || "").trim().replace(/\s+/g, " ").slice(0, max);
}

export function validateShippingAddress(input: unknown): SafeAddress {
  const source = input && typeof input === "object" ? input as Record<string, unknown> : {};
  const address: SafeAddress = {
    fullName: cleanText(source.fullName, 100),
    address: cleanText(source.address, 180),
    city: cleanText(source.city, 100),
    state: cleanText(source.state, 100),
    zipCode: cleanText(source.zipCode, 24),
    country: cleanText(source.country, 100),
    phone: cleanText(source.phone, 40),
  };
  if (!address.fullName || !address.address || !address.city || !address.zipCode || !address.phone) {
    throw new HttpError(400, "Complete the required delivery details.");
  }
  return address;
}

function normaliseRequestedItems(input: unknown) {
  if (!Array.isArray(input) || !input.length) throw new HttpError(400, "Your order has no items.");
  if (input.length > 50) throw new HttpError(400, "An order cannot contain more than 50 separate items.");

  const quantities = new Map<string, number>();
  for (const raw of input) {
    const product = String(raw?.product || "").trim();
    const quantity = Number(raw?.quantity);
    if (!/^[a-f\d]{24}$/i.test(product)) throw new HttpError(400, "One of the selected products is invalid.");
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 20) {
      throw new HttpError(400, "Each product quantity must be between 1 and 20.");
    }
    const combined = (quantities.get(product) || 0) + quantity;
    if (combined > 20) throw new HttpError(400, "A single product quantity cannot exceed 20.");
    quantities.set(product, combined);
  }
  return [...quantities.entries()].map(([product, quantity]) => ({ product, quantity }));
}

async function releaseReservationInsideTransaction(order: any, session: ClientSession, reason: string) {
  if (order.inventoryState !== "reserved") return;
  for (const item of order.orderItems) {
    const result = await Product.updateOne(
      { _id: item.product, reservedStock: { $gte: item.quantity } },
      { $inc: { reservedStock: -item.quantity } },
      { session }
    );
    if (!result.modifiedCount) throw new HttpError(409, `The reservation for ${item.name} is inconsistent.`);
  }
  order.inventoryState = "released";
  order.cancellationReason = reason;
}

export async function releaseOrderReservation(orderId: string, reason = "cancelled") {
  const session = await mongoose.startSession();
  let order: any;
  try {
    await session.withTransaction(async () => {
      order = await Order.findById(orderId).session(session);
      if (!order) throw new HttpError(404, "Order not found.");
      if (order.inventoryState === "reserved") await releaseReservationInsideTransaction(order, session, reason);
      if (!order.isPaid) order.status = reason === "reservation_expired" ? "expired" : "cancelled";
      await order.save({ session });
    }, TRANSACTION_OPTIONS);
    return order;
  } finally {
    await session.endSession();
  }
}

export async function releaseExpiredReservations(limit = 50) {
  const expired = await Order.find({
    isPaid: false,
    inventoryState: "reserved",
    reservationExpiresAt: { $lte: new Date() },
  }).select("_id").limit(Math.min(200, Math.max(1, limit))).lean();

  let released = 0;
  for (const item of expired) {
    try {
      await releaseOrderReservation(String(item._id), "reservation_expired");
      released += 1;
    } catch {
      // Another request or worker may have already released the same reservation.
    }
  }
  return released;
}

export async function reserveInventoryAndCreateOrder(input: {
  userId: string | Types.ObjectId;
  requestedItems: unknown;
  shippingAddress: unknown;
}) {
  await releaseExpiredReservations(25);
  const previousReservations = await Order.find({ user: input.userId, isPaid: false, inventoryState: "reserved" }).select("_id").lean();
  for (const previous of previousReservations) {
    await releaseOrderReservation(String(previous._id), "replaced_by_new_checkout");
  }
  const requestedItems = normaliseRequestedItems(input.requestedItems);
  const shippingAddress = validateShippingAddress(input.shippingAddress);
  const session = await mongoose.startSession();
  let createdOrder: any;

  try {
    await session.withTransaction(async () => {
      const products = await Product.find({
        _id: { $in: requestedItems.map((item) => item.product) },
        isActive: true,
      }).session(session);
      const productMap = new Map(products.map((product) => [String(product._id), product]));

      const orderItems = [] as Array<{ product: Types.ObjectId; name: string; image: string; price: number; quantity: number }>;
      for (const item of requestedItems) {
        const product = productMap.get(item.product);
        if (!product) throw new HttpError(400, "One of the selected products is unavailable.");

        const result = await Product.updateOne(
          {
            _id: product._id,
            isActive: true,
            $expr: {
              $gte: [
                { $subtract: ["$stock", { $ifNull: ["$reservedStock", 0] }] },
                item.quantity,
              ],
            },
          },
          { $inc: { reservedStock: item.quantity } },
          { session }
        );
        if (!result.modifiedCount) throw new HttpError(409, `${product.name} no longer has enough available stock.`);

        orderItems.push({
          product: product._id,
          name: product.name,
          image: product.images?.[0]?.url || "",
          price: Number(product.price),
          quantity: item.quantity,
        });
      }

      const itemsPrice = Number(orderItems.reduce((sum, item) => sum + item.price * item.quantity, 0).toFixed(2));
      const shippingPrice = itemsPrice >= 150 ? 0 : 15;
      const taxPrice = 0;
      const totalPrice = Number((itemsPrice + shippingPrice + taxPrice).toFixed(2));
      const reservationExpiresAt = new Date(Date.now() + reservationMinutes * 60 * 1000);

      const [order] = await Order.create([{
        user: input.userId,
        orderItems,
        shippingAddress,
        paymentMethod: "stripe",
        currency: "gbp",
        itemsPrice,
        taxPrice,
        shippingPrice,
        totalPrice,
        status: "awaiting_payment",
        inventoryState: "reserved",
        reservationExpiresAt,
      }], { session });
      createdOrder = order;
    }, TRANSACTION_OPTIONS);
    return createdOrder;
  } finally {
    await session.endSession();
  }
}

export async function finalisePaidOrder(orderId: string, paymentResult: Record<string, unknown>) {
  const session = await mongoose.startSession();
  let paidOrder: any;
  try {
    await session.withTransaction(async () => {
      const order = await Order.findById(orderId).session(session);
      if (!order) throw new HttpError(404, "Order not found.");
      if (order.isPaid && order.inventoryState === "committed") {
        paidOrder = order;
        return;
      }
      if (order.inventoryState !== "reserved") throw new HttpError(409, "This order no longer has an active stock reservation.");
      for (const item of order.orderItems) {
        const result = await Product.updateOne(
          { _id: item.product, stock: { $gte: item.quantity }, reservedStock: { $gte: item.quantity } },
          { $inc: { stock: -item.quantity, reservedStock: -item.quantity, soldCount: item.quantity } },
          { session }
        );
        if (!result.modifiedCount) throw new HttpError(409, `${item.name} inventory could not be committed.`);
      }

      order.isPaid = true;
      order.paidAt = new Date();
      order.paymentResult = paymentResult;
      order.inventoryState = "committed";
      order.status = "processing";
      await order.save({ session });
      paidOrder = order;
    }, TRANSACTION_OPTIONS);
    return paidOrder;
  } finally {
    await session.endSession();
  }
}
