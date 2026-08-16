import crypto from "node:crypto";
import type { NextFunction, Request, Response } from "express";
import { RateLimitBucket } from "../models/RateLimitBucket";
import { HttpError } from "../utils/http-error";

type PersistentRateLimitOptions = {
  scope: string;
  windowMs: number;
  limit: number;
  message: string;
  identifier?: (request: Request) => string;
};

function fingerprint(value: string) {
  return crypto.createHash("sha256").update(value).digest("hex").slice(0, 48);
}

function defaultIdentifier(request: Request) {
  return request.ip || request.socket.remoteAddress || "unknown";
}

export function persistentRateLimit(options: PersistentRateLimitOptions) {
  return async function persistentRateLimitMiddleware(request: Request, response: Response, next: NextFunction) {
    try {
      const rawIdentifier = (options.identifier || defaultIdentifier)(request).trim().toLowerCase() || "unknown";
      const key = `${options.scope}:${fingerprint(rawIdentifier)}`;
      const now = new Date();
      const resetAt = new Date(now.getTime() + options.windowMs);
      const expiresAt = new Date(resetAt.getTime() + options.windowMs);

      let bucket = await RateLimitBucket.findOneAndUpdate(
        { key, $or: [{ resetAt: { $lte: now } }, { resetAt: { $exists: false } }] },
        { $set: { count: 1, resetAt, expiresAt } },
        { new: true },
      );

      if (!bucket) {
        bucket = await RateLimitBucket.findOneAndUpdate(
          { key, resetAt: { $gt: now }, count: { $lt: options.limit } },
          { $inc: { count: 1 }, $set: { expiresAt } },
          { new: true },
        );
      }

      if (!bucket) {
        try {
          bucket = await RateLimitBucket.create({ key, count: 1, resetAt, expiresAt });
        } catch (error) {
          if ((error as { code?: number }).code !== 11000) throw error;
        }
      }

      if (!bucket) {
        const active = await RateLimitBucket.findOne({ key }).lean();
        const retrySeconds = Math.max(1, Math.ceil(((active?.resetAt?.getTime() || resetAt.getTime()) - Date.now()) / 1000));
        response.setHeader("Retry-After", String(retrySeconds));
        throw new HttpError(429, options.message);
      }

      response.setHeader("RateLimit-Limit", String(options.limit));
      response.setHeader("RateLimit-Remaining", String(Math.max(0, options.limit - bucket.count)));
      response.setHeader("RateLimit-Reset", String(Math.ceil(bucket.resetAt.getTime() / 1000)));
      next();
    } catch (error) {
      next(error);
    }
  };
}
