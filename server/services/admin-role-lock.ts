import crypto from "node:crypto";
import { AdminGuard } from "../models/AdminGuard";
import { HttpError } from "../utils/http-error";

export async function withAdminRoleLock<T>(operation: () => Promise<T>): Promise<T> {
  const holder = crypto.randomUUID();
  const now = new Date();
  const lockUntil = new Date(now.getTime() + 30_000);
  let acquired = false;

  try {
    try {
      const guard = await AdminGuard.findOneAndUpdate(
        { _id: "role-management", $or: [{ lockUntil: { $lte: now } }, { lockUntil: { $exists: false } }] },
        { $set: { holder, lockUntil } },
        { new: true, upsert: true },
      );
      acquired = guard?.holder === holder;
    } catch (error) {
      if ((error as { code?: number }).code !== 11000) throw error;
    }

    if (!acquired) throw new HttpError(409, "Another administrator access change is in progress. Try again.");
    return await operation();
  } finally {
    if (acquired) {
      await AdminGuard.updateOne(
        { _id: "role-management", holder },
        { $set: { holder: "", lockUntil: new Date(0) } },
      ).catch(() => undefined);
    }
  }
}
