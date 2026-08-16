import type { HydratedDocument } from "mongoose";
import type { IUser } from "../models/User";

export function userView(user: HydratedDocument<IUser>) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    phone: user.phone || "",
    avatar: user.avatar || "",
    address: user.address || {},
    isActive: user.isActive,
    isEmailVerified: user.isEmailVerified,
    authProvider: user.authProvider,
    createdAt: user.createdAt,
  };
}
