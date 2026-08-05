import mongoose, { type InferSchemaType, type Model } from "mongoose";

const { Schema } = mongoose;

const rateLimitBucketSchema = new Schema(
  {
    key: { type: String, required: true, unique: true, index: true, maxlength: 180 },
    count: { type: Number, required: true, min: 0, default: 0 },
    resetAt: { type: Date, required: true, index: true },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: false, versionKey: false },
);

rateLimitBucketSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export type IRateLimitBucket = InferSchemaType<typeof rateLimitBucketSchema>;
export const RateLimitBucket =
  (mongoose.models.RateLimitBucket as Model<IRateLimitBucket>) ||
  mongoose.model<IRateLimitBucket>("RateLimitBucket", rateLimitBucketSchema);
