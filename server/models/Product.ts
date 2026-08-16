import mongoose, { type InferSchemaType, type Model } from "mongoose";

const { Schema } = mongoose;

const imageSchema = new Schema(
  {
    url: { type: String, required: true, trim: true, maxlength: 1600 },
    alt: { type: String, trim: true, default: "", maxlength: 180 },
  },
  { _id: false }
);

const reviewSchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: "User", required: true },
    name: { type: String, required: true, trim: true },
    rating: { type: Number, required: true, min: 1, max: 5 },
    comment: { type: String, required: true, minlength: 10, maxlength: 500 },
    verifiedPurchase: { type: Boolean, default: false },
  },
  { timestamps: true }
);

const productSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 140 },
    slug: { type: String, required: true, unique: true, trim: true, index: true },
    description: { type: String, required: true, trim: true, minlength: 10, maxlength: 8000 },
    price: { type: Number, required: true, min: 0 },
    compareAtPrice: { type: Number, min: 0 },
    category: { type: String, required: true, trim: true, index: true },
    brand: { type: String, trim: true, default: "Nōkerè" },
    stock: { type: Number, required: true, min: 0, default: 0 },
    reservedStock: { type: Number, required: true, min: 0, default: 0, select: true },
    images: { type: [imageSchema], default: [] },
    rating: { type: Number, default: 0, min: 0, max: 5 },
    numReviews: { type: Number, default: 0 },
    reviews: { type: [reviewSchema], default: [] },
    soldCount: { type: Number, default: 0, min: 0 },
    isFeatured: { type: Boolean, default: false },
    isActive: { type: Boolean, default: true, index: true },
  },
  { timestamps: true }
);

export type IProduct = InferSchemaType<typeof productSchema> & { createdAt: Date; updatedAt: Date };
export const Product = (mongoose.models.Product as Model<IProduct>) || mongoose.model<IProduct>("Product", productSchema);
