import crypto from "node:crypto";
import type { Request, Response } from "express";
import type { HydratedDocument } from "mongoose";
import type { IUser } from "../models/User";
import { signToken } from "./security";

const isProduction = process.env.NODE_ENV === "production";
const configuredSameSite = String(
  process.env.COOKIE_SAME_SITE || "lax",
).toLowerCase();
const sameSite = (
  ["lax", "strict", "none"].includes(configuredSameSite)
    ? configuredSameSite
    : "lax"
) as "lax" | "strict" | "none";
const secureCookie = isProduction || sameSite === "none";
const defaultSessionCookieName = isProduction
  ? "__Host-nokere_session"
  : "nokere_session";
const defaultCsrfCookieName = isProduction
  ? "__Host-nokere_csrf"
  : "nokere_csrf";
const configuredSessionCookieName =
  process.env.SESSION_COOKIE_NAME || defaultSessionCookieName;
const configuredCsrfCookieName =
  process.env.CSRF_COOKIE_NAME || defaultCsrfCookieName;
export const SESSION_COOKIE_NAME =
  !isProduction && configuredSessionCookieName.startsWith("__Host-")
    ? "nokere_session"
    : configuredSessionCookieName;
export const CSRF_COOKIE_NAME =
  !isProduction && configuredCsrfCookieName.startsWith("__Host-")
    ? "nokere_csrf"
    : configuredCsrfCookieName;

export function parseCookies(header = "") {
  return header.split(";").reduce<Record<string, string>>((cookies, part) => {
    const index = part.indexOf("=");
    if (index < 0) return cookies;
    const key = part.slice(0, index).trim();
    const value = part.slice(index + 1).trim();
    if (key) cookies[key] = decodeURIComponent(value);
    return cookies;
  }, {});
}

export function bearerAuthEnabled() {
  // Bearer tokens are the primary session transport: Safari blocks third-party cookie
  // storage outright, so a cross-site API cannot rely on cookies at all. Set
  // ALLOW_BEARER_AUTH=false only for a deployment that is first-party to its frontend.
  return process.env.ALLOW_BEARER_AUTH !== "false";
}

export function readBearerToken(request: Request) {
  const header = request.headers.authorization || "";
  if (!header.startsWith("Bearer ")) return "";
  return header.slice(7).trim();
}

export function readSessionToken(request: Request) {
  // An Authorization header is an explicit, non-ambient credential, so it takes precedence
  // over the cookie. Preferring it also stops a stale cookie from shadowing a freshly
  // issued token, which matters because change-password and reset-password both bump
  // tokenVersion and so invalidate whatever the browser still holds.
  if (bearerAuthEnabled()) {
    const bearerToken = readBearerToken(request);
    if (bearerToken) return bearerToken;
  }
  return parseCookies(request.headers.cookie || "")[SESSION_COOKIE_NAME] || "";
}

export function createCsrfToken() {
  return crypto.randomBytes(32).toString("base64url");
}

export function setCsrfCookie(
  response: Response,
  remember = true,
  token = createCsrfToken(),
) {
  response.cookie(CSRF_COOKIE_NAME, token, {
    httpOnly: false,
    secure: secureCookie,
    sameSite,
    path: "/",
    ...(remember ? { maxAge: 7 * 24 * 60 * 60 * 1000 } : {}),
  });
  return token;
}

export function createSessionToken(user: HydratedDocument<IUser>) {
  return signToken(user.id, Number((user as any).tokenVersion || 0));
}

export function setSessionCookie(
  response: Response,
  user: HydratedDocument<IUser>,
  remember = true,
) {
  const token = createSessionToken(user);
  response.cookie(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: secureCookie,
    sameSite,
    path: "/",
    ...(remember ? { maxAge: 7 * 24 * 60 * 60 * 1000 } : {}),
  });
  // Returned so routes can also hand the token to the client in the response body. A
  // cross-site browser (Safari especially) will discard the cookie above, and the bearer
  // token is the only session credential that survives.
  return token;
}

export function clearSessionCookie(response: Response) {
  response.clearCookie(SESSION_COOKIE_NAME, {
    httpOnly: true,
    secure: secureCookie,
    sameSite,
    path: "/",
  });
  response.clearCookie(CSRF_COOKIE_NAME, {
    httpOnly: false,
    secure: secureCookie,
    sameSite,
    path: "/",
  });
}
