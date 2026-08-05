import crypto from "node:crypto";
import jwt from "jsonwebtoken";
import { HttpError } from "./http-error";

export type SessionClaims = jwt.JwtPayload & {
  id: string;
  version: number;
};

export function signToken(userId: string, tokenVersion = 0) {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new HttpError(503, "JWT_SECRET is not configured on the API server.");
  return jwt.sign({ id: userId, version: tokenVersion }, secret, {
    expiresIn: (process.env.JWT_EXPIRE || "7d") as jwt.SignOptions["expiresIn"],
    issuer: process.env.JWT_ISSUER || "nokere-api",
    audience: process.env.JWT_AUDIENCE || "nokere-storefront",
    jwtid: crypto.randomUUID(),
  });
}

export function verifyToken(token: string): SessionClaims {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new HttpError(503, "JWT_SECRET is not configured on the API server.");
  return jwt.verify(token, secret, {
    issuer: process.env.JWT_ISSUER || "nokere-api",
    audience: process.env.JWT_AUDIENCE || "nokere-storefront",
  }) as SessionClaims;
}

export function createRawToken() {
  return crypto.randomBytes(32).toString("hex");
}

export function hashToken(token: string) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export function slugify(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
