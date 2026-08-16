import { Router } from "express";
import Stripe from "stripe";
import { Order } from "../models/Order";
import { finalisePaidOrder, releaseOrderReservation } from "../services/order-inventory";
import { asyncHandler } from "../utils/async-handler";
import { HttpError } from "../utils/http-error";

const router = Router();

router.post(
  "/",
  asyncHandler(async (request, response) => {
    const secretKey = process.env.STRIPE_SECRET_KEY;
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!secretKey || !webhookSecret) throw new HttpError(503, "Stripe webhook configuration is incomplete.");

    const signature = request.headers["stripe-signature"];
    if (!signature || Array.isArray(signature)) throw new HttpError(400, "Stripe signature is missing.");

    const stripe = new Stripe(secretKey);
    let event: Stripe.Event;
    try {
      event = stripe.webhooks.constructEvent(request.body, signature, webhookSecret);
    } catch {
      throw new HttpError(400, "Stripe webhook signature verification failed.");
    }

    if (event.type === "payment_intent.succeeded") {
      const intent = event.data.object as Stripe.PaymentIntent;
      const orderId = intent.metadata.orderId;
      const order = orderId ? await Order.findById(orderId) : null;
      if (!order) throw new HttpError(409, "Stripe payment does not reference an existing order.");
      if (intent.currency !== "gbp" || intent.amount_received !== Math.round(order.totalPrice * 100)) {
        throw new HttpError(409, "Stripe payment amount does not match the order.");
      }

      if (!order.isPaid) {
        try {
          await finalisePaidOrder(String(order._id), {
            id: intent.id,
            status: intent.status,
            amount: intent.amount_received,
            currency: intent.currency,
            eventId: event.id,
          });
        } catch (error) {
          // Re-read the order after a failed commit. A maintenance worker may have released
          // the reservation between the first read and the inventory transaction.
          const latestOrder = await Order.findById(order._id);
          const inventoryConflict = error instanceof HttpError && error.statusCode === 409;
          if (latestOrder && (latestOrder.inventoryState !== "reserved" || inventoryConflict)) {
            if (latestOrder.inventoryState === "reserved") {
              await releaseOrderReservation(String(latestOrder._id), "payment_inventory_conflict");
            }
            const refund = await stripe.refunds.create(
              { payment_intent: intent.id, reason: "requested_by_customer", metadata: { orderId: String(order._id), reason: "inventory_unavailable" } },
              { idempotencyKey: `nokere-auto-refund-${intent.id}` },
            );
            await Order.updateOne({ _id: order._id }, {
              $set: {
                status: "cancelled",
                inventoryState: "released",
                cancellationReason: "payment_refunded_inventory_unavailable",
                paymentResult: { id: intent.id, refundId: refund.id, status: "refunded", eventId: event.id },
              },
            });
          } else {
            throw error;
          }
        }
      }
    }

    if (event.type === "payment_intent.canceled") {
      const intent = event.data.object as Stripe.PaymentIntent;
      const orderId = intent.metadata.orderId;
      if (orderId) {
        const order = await Order.findById(orderId);
        if (order && !order.isPaid && order.inventoryState === "reserved") {
          await releaseOrderReservation(String(order._id), "payment_intent_cancelled");
        }
      }
    }

    response.json({ received: true });
  })
);

export default router;
