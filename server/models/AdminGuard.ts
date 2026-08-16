import mongoose, { type InferSchemaType, type Model } from "mongoose";

const { Schema } = mongoose;

const adminGuardSchema = new Schema(
  {
    _id: { type: String, default: "role-management" },
    holder: { type: String, default: "" },
    lockUntil: { type: Date, default: () => new Date(0), index: true },
  },
  { versionKey: false },
);

export type IAdminGuard = InferSchemaType<typeof adminGuardSchema>;
export const AdminGuard =
  (mongoose.models.AdminGuard as Model<IAdminGuard>) || mongoose.model<IAdminGuard>("AdminGuard", adminGuardSchema);
