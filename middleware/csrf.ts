import crypto from "node:crypto";
import type { NextFunction, Request, Response } from "express";
import { CSRF_COOKIE_NAME, parseCookies } from "../utils/session";
import { HttpError } from "../utils/http-error";

function equalTokens(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return (
    leftBuffer.length === rightBuffer.length &&
    crypto.timingSafeEqual(leftBuffer, rightBuffer)
  );
}

export function csrfProtection(
  request: Request,
  _response: Response,
  next: NextFunction,
) {
  if (!["POST", "PUT", "PATCH", "DELETE"].includes(request.method))
    return next();
  if (request.path.startsWith("/api/stripe/webhook")) return next();
  if (request.path.startsWith("/api/maintenance/")) return next();
  if (request.path === "/api/auth/csrf") return next();

  const cookieToken =
    parseCookies(request.headers.cookie || "")[CSRF_COOKIE_NAME] || "";
  const headerToken = String(request.headers["x-csrf-token"] || "");
  if (!cookieToken || !headerToken || !equalTokens(cookieToken, headerToken)) {
    return next(
      new HttpError(
        403,
        "This request could not be verified. Refresh the page and try again.",
        "CSRF_VALIDATION_FAILED",
      ),
    );
  }
  next();
}
