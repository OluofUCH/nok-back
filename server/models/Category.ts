import mongoose, { type InferSchemaType, type Model } from "mongoose";

const { Schema } = mongoose;

const categorySchema = new Schema(
  {
    name: { type: String, required: true, unique: true, trim: true, maxlength: 80 },
    slug: { type: String, required: true, unique: true, trim: true, index: true },
    description: { type: String, trim: true, default: "" },
    image: { type: String, trim: true, default: "" },
    isActive: { type: Boolean, default: true, index: true },
    sortOrder: { type: Number, default: 0 },
  },
  { timestamps: true }
);

export type ICategory = InferSchemaType<typeof categorySchema> & { createdAt: Date; updatedAt: Date };
export const Category =
  (mongoose.models.Category as Model<ICategory>) || mongoose.model<ICategory>("Category", categorySchema);
