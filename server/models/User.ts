import bcrypt from "bcryptjs";
import mongoose, { type InferSchemaType, type Model } from "mongoose";

const { Schema } = mongoose;

const addressSchema = new Schema(
  {
    street: { type: String, trim: true, default: "", maxlength: 180 },
    city: { type: String, trim: true, default: "", maxlength: 100 },
    state: { type: String, trim: true, default: "", maxlength: 100 },
    zipCode: { type: String, trim: true, default: "", maxlength: 24 },
    country: { type: String, trim: true, default: "", maxlength: 100 },
  },
  { _id: false }
);

const userSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, minlength: 2, maxlength: 80 },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true, index: true },
    password: { type: String, select: false, minlength: 10 },
    role: { type: String, enum: ["user", "admin", "superadmin"], default: "user", index: true },
    phone: { type: String, trim: true, default: "", maxlength: 40 },
    avatar: { type: String, trim: true, default: "", maxlength: 1200 },
    address: { type: addressSchema, default: () => ({}) },
    wishlist: [{ type: Schema.Types.ObjectId, ref: "Product" }],
    isActive: { type: Boolean, default: true, index: true },
    isEmailVerified: { type: Boolean, default: false, index: true },
    authProvider: { type: String, enum: ["local", "google"], default: "local" },
    googleId: { type: String, sparse: true, index: true },
    emailVerificationToken: { type: String, select: false },
    emailVerificationExpires: { type: Date, select: false },
    passwordResetToken: { type: String, select: false },
    passwordResetExpires: { type: Date, select: false },
    tokenVersion: { type: Number, default: 0, select: false },
    loginAttempts: { type: Number, default: 0, select: false },
    lockUntil: { type: Date, select: false },
    lastLoginAt: { type: Date },
  },
  { timestamps: true }
);

userSchema.methods.comparePassword = async function comparePassword(candidate: string) {
  if (!this.password) return false;
  return bcrypt.compare(candidate, this.password);
};

export type IUser = InferSchemaType<typeof userSchema> & {
  comparePassword(candidate: string): Promise<boolean>;
  createdAt: Date;
  updatedAt: Date;
};

export const User = (mongoose.models.User as Model<IUser>) || mongoose.model<IUser>("User", userSchema);
