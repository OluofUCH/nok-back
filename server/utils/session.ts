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

export function readSessionToken(request: Request) {
  const cookies = parseCookies(request.headers.cookie || "");
  const cookieToken = cookies[SESSION_COOKIE_NAME];
  if (cookieToken) return cookieToken;

  const allowBearer =
    process.env.ALLOW_BEARER_AUTH === "true" ||
    process.env.NODE_ENV !== "production";
  if (!allowBearer) return "";
  const header = request.headers.authorization || "";
  return header.startsWith("Bearer ") ? header.slice(7) : "";
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

export function setSessionCookie(
  response: Response,
  user: HydratedDocument<IUser>,
  remember = true,
) {
  const token = signToken(user.id, Number((user as any).tokenVersion || 0));
  response.cookie(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: secureCookie,
    sameSite,
    path: "/",
    ...(remember ? { maxAge: 7 * 24 * 60 * 60 * 1000 } : {}),
  });
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
