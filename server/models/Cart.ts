import mongoose, { type InferSchemaType, type Model } from "mongoose";

const { Schema } = mongoose;

const cartItemSchema = new Schema(
  {
    product: { type: Schema.Types.ObjectId, ref: "Product", required: true },
    quantity: { type: Number, min: 1, default: 1 },
    price: { type: Number, min: 0, required: true },
  },
  { _id: false },
);

const cartSchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: "User", required: true, unique: true, index: true },
    items: { type: [cartItemSchema], default: [] },
  },
  { timestamps: true },
);

export type ICart = InferSchemaType<typeof cartSchema>;
export const Cart = (mongoose.models.Cart as Model<ICart>) || mongoose.model<ICart>("Cart", cartSchema);
