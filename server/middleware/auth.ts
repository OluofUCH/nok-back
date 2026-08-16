import type { NextFunction, Request, Response } from "express";
import { User } from "../models/User";
import { HttpError } from "../utils/http-error";
import { asyncHandler } from "../utils/async-handler";
import { readSessionToken } from "../utils/session";
import { verifyToken } from "../utils/security";

export const protect = asyncHandler(async (request: Request, _response: Response, next: NextFunction) => {
  const token = readSessionToken(request);
  if (!token) throw new HttpError(401, "Please sign in to continue.");

  let payload;
  try {
    payload = verifyToken(token);
  } catch {
    throw new HttpError(401, "Your session is invalid or has expired.");
  }

  const user = await User.findById(payload.id).select("+tokenVersion");
  if (!user || !user.isActive) throw new HttpError(401, "This account is unavailable.");
  if (Number((user as any).tokenVersion || 0) !== Number(payload.version || 0)) {
    throw new HttpError(401, "Your session has been signed out. Please sign in again.");
  }

  request.user = user;
  next();
});

export function requireVerified(request: Request, _response: Response, next: NextFunction) {
  if (!request.user?.isEmailVerified) {
    return next(new HttpError(403, "Verify your email address before continuing.", "EMAIL_VERIFICATION_REQUIRED"));
  }
  next();
}

export function requireAdmin(request: Request, _response: Response, next: NextFunction) {
  if (!request.user || !["admin", "superadmin"].includes(String(request.user.role))) {
    return next(new HttpError(403, "Administrator access is required."));
  }
  next();
}

export function requireSuperAdmin(request: Request, _response: Response, next: NextFunction) {
  if (!request.user || request.user.role !== "superadmin") {
    return next(new HttpError(403, "Super administrator access is required."));
  }
  next();
}
