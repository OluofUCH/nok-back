import { Router } from "express";
import Stripe from "stripe";
import { Order } from "../models/Order";
import { protect, requireAdmin, requireVerified } from "../middleware/auth";
import { persistentRateLimit } from "../middleware/persistent-rate-limit";
import { asyncHandler } from "../utils/async-handler";
import { HttpError } from "../utils/http-error";
import {
  finalisePaidOrder,
  releaseOrderReservation,
  reserveInventoryAndCreateOrder,
} from "../services/order-inventory";

const router = Router();
router.use(protect, requireVerified);

const checkoutLimiter = persistentRateLimit({
  scope: "checkout-user",
  windowMs: 60 * 60 * 1000,
  limit: 10,
  message: "Too many checkout attempts. Please wait before trying again.",
  identifier: (request) => String(request.user?._id || request.ip),
});

function stripeClient() {
  const secret = process.env.STRIPE_SECRET_KEY;
  if (!secret) throw new HttpError(503, "Stripe is not configured.");
  return new Stripe(secret);
}

function ownsOrder(order: any, user: any) {
  return String(order.user) === String(user._id) || ["admin", "superadmin"].includes(String(user.role));
}

router.post(
  "/",
  checkoutLimiter,
  asyncHandler(async (request, response) => {
    if (request.body?.paymentMethod && request.body.paymentMethod !== "stripe") {
      throw new HttpError(400, "Stripe is the only supported payment method at this stage.");
    }
    const order = await reserveInventoryAndCreateOrder({
      userId: request.user!._id,
      requestedItems: request.body?.orderItems,
      shippingAddress: request.body?.shippingAddress,
    });
    response.status(201).json({ success: true, message: "Order created and stock reserved temporarily.", data: order });
  })
);

router.get(
  "/my-orders",
  asyncHandler(async (request, response) => {
    const page = Math.max(1, Number(request.query.page) || 1);
    const limit = Math.min(50, Math.max(1, Number(request.query.limit) || 10));
    const filter = { user: request.user!._id };
    const [orders, total] = await Promise.all([
      Order.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
      Order.countDocuments(filter),
    ]);
    response.json({ success: true, data: { orders, pagination: { current: page, pages: Math.ceil(total / limit), total } } });
  })
);

router.get(
  "/",
  requireAdmin,
  asyncHandler(async (request, response) => {
    const page = Math.max(1, Number(request.query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(request.query.limit) || 25));
    const filter: Record<string, unknown> = {};
    if (request.query.status) filter.status = String(request.query.status);
    if (request.query.isPaid === "true") filter.isPaid = true;
    if (request.query.isPaid === "false") filter.isPaid = false;

    const [orders, total] = await Promise.all([
      Order.find(filter)
        .populate("user", "name email")
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      Order.countDocuments(filter),
    ]);
    response.json({ success: true, data: { orders, pagination: { current: page, pages: Math.ceil(total / limit), total } } });
  })
);

router.post(
  "/:id/create-payment-intent",
  asyncHandler(async (request, response) => {
    const order = await Order.findById(request.params.id);
    if (!order || !ownsOrder(order, request.user!)) throw new HttpError(404, "Order not found.");
    if (order.isPaid) throw new HttpError(409, "This order is already paid.");
    if (order.inventoryState !== "reserved" || !order.reservationExpiresAt || order.reservationExpiresAt <= new Date()) {
      if (order.inventoryState === "reserved") await releaseOrderReservation(String(order._id), "reservation_expired");
      throw new HttpError(409, "This order reservation has expired. Return to your bag and create a new order.");
    }

    const stripe = stripeClient();
    if (order.paymentIntentId) {
      const existing = await stripe.paymentIntents.retrieve(order.paymentIntentId);
      if (!["canceled", "succeeded"].includes(existing.status)) {
        return response.json({ success: true, data: { clientSecret: existing.client_secret, paymentIntentId: existing.id } });
      }
    }

    const intent = await stripe.paymentIntents.create({
      amount: Math.round(order.totalPrice * 100),
      currency: "gbp",
      automatic_payment_methods: { enabled: true },
      metadata: { orderId: String(order._id), userId: String(order.user) },
      description: `Nōkerè order ${String(order._id)}`,
    }, { idempotencyKey: `nokere-order-${String(order._id)}` });

    order.paymentIntentId = intent.id;
    await order.save({ validateBeforeSave: false });
    response.json({ success: true, data: { clientSecret: intent.client_secret, paymentIntentId: intent.id } });
  })
);

router.put(
  "/:id/pay",
  asyncHandler(async (request, response) => {
    const order = await Order.findById(request.params.id);
    if (!order || !ownsOrder(order, request.user!)) throw new HttpError(404, "Order not found.");
    if (order.isPaid) return response.json({ success: true, message: "Order is already paid.", data: order });

    const paymentIntentId = String(request.body?.paymentIntentId || order.paymentIntentId || "");
    if (!paymentIntentId || paymentIntentId !== order.paymentIntentId) throw new HttpError(400, "A valid payment reference is required.");

    const intent = await stripeClient().paymentIntents.retrieve(paymentIntentId);
    if (intent.status !== "succeeded") throw new HttpError(409, "Stripe has not confirmed this payment as successful.");
    if (intent.currency !== "gbp" || intent.amount_received !== Math.round(order.totalPrice * 100)) {
      throw new HttpError(409, "The payment amount does not match this order.");
    }
    if (intent.metadata.orderId !== String(order._id) || intent.metadata.userId !== String(order.user)) {
      throw new HttpError(409, "The payment reference does not belong to this order.");
    }

    try {
      const paid = await finalisePaidOrder(String(order._id), {
        id: intent.id,
        status: intent.status,
        amount: intent.amount_received,
        currency: intent.currency,
        latestCharge: intent.latest_charge || "",
      });
      response.json({ success: true, message: "Payment verified and inventory committed.", data: paid });
    } catch (error) {
      if (!(error instanceof HttpError) || error.statusCode !== 409) throw error;
      const latest = await Order.findById(order._id);
      if (latest?.inventoryState === "reserved") await releaseOrderReservation(String(latest._id), "payment_inventory_conflict");
      const refund = await stripeClient().refunds.create(
        { payment_intent: intent.id, reason: "requested_by_customer", metadata: { orderId: String(order._id), reason: "inventory_unavailable" } },
        { idempotencyKey: `nokere-auto-refund-${intent.id}` },
      );
      await Order.updateOne({ _id: order._id }, {
        $set: {
          status: "cancelled",
          inventoryState: "released",
          cancellationReason: "payment_refunded_inventory_unavailable",
          paymentResult: { id: intent.id, refundId: refund.id, status: "refunded" },
        },
      });
      throw new HttpError(409, "Payment was received after the stock reservation ended, so it has been refunded automatically.");
    }
  })
);

router.put(
  "/:id/status",
  requireAdmin,
  asyncHandler(async (request, response) => {
    const order = await Order.findById(request.params.id);
    if (!order) throw new HttpError(404, "Order not found.");
    const status = String(request.body?.status || "");
    if (!["awaiting_payment", "processing", "shipped", "delivered", "cancelled", "expired"].includes(status)) {
      throw new HttpError(400, "Select a valid order status.");
    }
    if (["cancelled", "expired"].includes(status) && order.inventoryState === "reserved") {
      const released = await releaseOrderReservation(String(order._id), status === "expired" ? "reservation_expired" : "admin_cancelled");
      return response.json({ success: true, message: "Order status updated and reservation released.", data: released });
    }
    if (!order.isPaid && ["processing", "shipped", "delivered"].includes(status)) {
      throw new HttpError(409, "An unpaid order cannot be moved into fulfilment.");
    }
    order.status = status as any;
    if (request.body?.trackingNumber !== undefined) order.trackingNumber = String(request.body.trackingNumber).trim().slice(0, 120);
    if (status === "delivered") {
      order.isDelivered = true;
      order.deliveredAt = new Date();
    }
    await order.save();
    response.json({ success: true, message: "Order status updated.", data: order });
  })
);

router.put(
  "/:id/cancel",
  asyncHandler(async (request, response) => {
    const order = await Order.findById(request.params.id);
    if (!order || !ownsOrder(order, request.user!)) throw new HttpError(404, "Order not found.");
    if (order.isPaid || ["shipped", "delivered", "cancelled", "expired"].includes(order.status)) {
      throw new HttpError(409, "This order can no longer be cancelled online.");
    }
    const cancelled = await releaseOrderReservation(String(order._id), "customer_cancelled");
    response.json({ success: true, message: "Order cancelled and reserved stock released.", data: cancelled });
  })
);

export default router;
