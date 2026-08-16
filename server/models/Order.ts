import mongoose, { type InferSchemaType, type Model } from "mongoose";

const { Schema } = mongoose;

const orderItemSchema = new Schema(
  {
    product: { type: Schema.Types.ObjectId, ref: "Product", required: true },
    name: { type: String, required: true },
    image: { type: String, default: "" },
    price: { type: Number, required: true, min: 0 },
    quantity: { type: Number, required: true, min: 1, max: 20 },
  },
  { _id: false }
);

const shippingAddressSchema = new Schema(
  {
    fullName: { type: String, required: true, maxlength: 100 },
    address: { type: String, required: true, maxlength: 180 },
    city: { type: String, required: true, maxlength: 100 },
    state: { type: String, default: "", maxlength: 100 },
    zipCode: { type: String, required: true, maxlength: 24 },
    country: { type: String, default: "", maxlength: 100 },
    phone: { type: String, required: true, maxlength: 40 },
  },
  { _id: false }
);

const orderSchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    orderItems: { type: [orderItemSchema], required: true },
    shippingAddress: { type: shippingAddressSchema, required: true },
    paymentMethod: { type: String, enum: ["stripe"], required: true, default: "stripe" },
    currency: { type: String, enum: ["gbp"], default: "gbp", required: true },
    itemsPrice: { type: Number, required: true, min: 0 },
    taxPrice: { type: Number, required: true, min: 0, default: 0 },
    shippingPrice: { type: Number, required: true, min: 0, default: 0 },
    totalPrice: { type: Number, required: true, min: 0 },
    status: {
      type: String,
      enum: ["awaiting_payment", "processing", "shipped", "delivered", "cancelled", "expired"],
      default: "awaiting_payment",
      index: true,
    },
    inventoryState: {
      type: String,
      enum: ["reserved", "committed", "released"],
      default: "reserved",
      index: true,
    },
    reservationExpiresAt: { type: Date, index: true },
    isPaid: { type: Boolean, default: false, index: true },
    paidAt: { type: Date },
    paymentIntentId: { type: String, trim: true, index: true, unique: true, sparse: true },
    paymentResult: { type: Schema.Types.Mixed },
    trackingNumber: { type: String, trim: true, default: "" },
    isDelivered: { type: Boolean, default: false },
    deliveredAt: { type: Date },
    cancellationReason: { type: String, trim: true, default: "" },
  },
  { timestamps: true }
);

orderSchema.index({ user: 1, inventoryState: 1 }, { unique: true, partialFilterExpression: { inventoryState: "reserved", isPaid: false } });

export type IOrder = InferSchemaType<typeof orderSchema> & { createdAt: Date; updatedAt: Date };
export const Order = (mongoose.models.Order as Model<IOrder>) || mongoose.model<IOrder>("Order", orderSchema);
