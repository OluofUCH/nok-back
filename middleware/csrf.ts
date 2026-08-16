import crypto from "node:crypto";
import type { NextFunction, Request, Response } from "express";
import { CSRF_COOKIE_NAME, bearerAuthEnabled, parseCookies, readBearerToken } from "../utils/session";
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

  // A bearer token is not an ambient credential. A cross-site page cannot attach an
  // Authorization header without triggering a preflight, and the CORS allowlist refuses
  // that preflight, so such a request cannot have been forged. Nothing to double submit.
  if (bearerAuthEnabled() && readBearerToken(request)) return next();

  const cookieToken =
    parseCookies(request.headers.cookie || "")[CSRF_COOKIE_NAME] || "";
  // Safari blocks third-party cookie storage outright, so whenever this API is not
  // first-party to its frontend the double-submit cookie never reaches us and cannot be
  // demanded. The Origin allowlist in app.ts gates every write and page JavaScript cannot
  // forge an Origin, so that check carries the CSRF protection while the cookie is
  // unavailable. A caller cannot force this path: the browser, not the request, decides
  // whether a cookie it already holds gets attached.
  if (!cookieToken) return next();

  const headerToken = String(request.headers["x-csrf-token"] || "");
  if (!headerToken || !equalTokens(cookieToken, headerToken)) {
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
