import cors from "cors";
import express from "express";
import rateLimit from "express-rate-limit";
import helmet from "helmet";
import { connectDatabase } from "./config/db";
import { csrfProtection } from "./middleware/csrf";
import { errorHandler, notFound } from "./middleware/error";
import { persistentRateLimit } from "./middleware/persistent-rate-limit";
import adminRoutes from "./routes/admin";
import authRoutes from "./routes/auth";
import cartRoutes from "./routes/cart";
import contactRoutes from "./routes/contact";
import maintenanceRoutes from "./routes/maintenance";
import orderRoutes from "./routes/orders";
import productRoutes from "./routes/products";
import stripeWebhookRoutes from "./routes/stripe-webhook";
import userRoutes from "./routes/users";
import { asyncHandler } from "./utils/async-handler";
import { HttpError } from "./utils/http-error";
import { setCsrfCookie } from "./utils/session";

const app = express();
app.disable("x-powered-by");
app.set("trust proxy", 1);

const normaliseOrigin = (value: string) => {
  const candidate = value.trim();
  if (!candidate || candidate === "*")
    throw new Error("CORS origins must be explicit HTTP or HTTPS origins.");
  const parsed = new URL(candidate);
  if (
    !["http:", "https:"].includes(parsed.protocol) ||
    parsed.username ||
    parsed.password ||
    parsed.pathname !== "/" ||
    parsed.search ||
    parsed.hash
  ) {
    throw new Error(`Invalid CORS origin: ${candidate}`);
  }
  return parsed.origin;
};
const configuredOrigins = [
  process.env.FRONTEND_URL,
  ...(process.env.CORS_ORIGINS || "").split(","),
  process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : undefined,
  process.env.VERCEL_BRANCH_URL
    ? `https://${process.env.VERCEL_BRANCH_URL}`
    : undefined,
  process.env.VERCEL_PROJECT_PRODUCTION_URL
    ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
    : undefined,
  "https://nok-nine.vercel.app",
]
  .filter((value): value is string => Boolean(value?.trim()))
  .flatMap((value) => value.split(","))
  .map((value) => value.trim())
  .filter(Boolean)
  .map((value) => {
    try {
      return normaliseOrigin(value);
    } catch {
      console.warn(`Skipping invalid CORS origin: ${value}`);
      return undefined;
    }
  })
  .filter((value): value is string => Boolean(value));
const allowedOrigins = new Set(configuredOrigins);
if (process.env.NODE_ENV !== "production") {
  allowedOrigins.add("http://localhost:5173");
  allowedOrigins.add("http://127.0.0.1:5173");
}
if (process.env.NODE_ENV === "production" && allowedOrigins.size === 0) {
  console.warn(
    "Production API started without explicit CORS origins; configure FRONTEND_URL or CORS_ORIGINS for browser access.",
  );
}

app.use(
  helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" },
    referrerPolicy: { policy: "strict-origin-when-cross-origin" },
  }),
);
app.use(
  cors({
    origin(origin, callback) {
      // An unrecognised Origin withholds the CORS headers, it never fails the request.
      // Chromium and Firefox omit Origin on a same-origin GET, WebKit sends it (and sends
      // a literal `null` in more cases), so rejecting here would 403 every Safari request
      // to a same-origin route. Same-origin requests are not subject to CORS and must
      // still succeed, while a genuine cross-origin read is blocked by the browser once
      // Access-Control-Allow-Origin is absent. Cross-origin writes are rejected outright
      // by the Origin guard below.
      if (!origin) return callback(null, false);
      let normalised: string;
      try {
        normalised = normaliseOrigin(origin);
      } catch {
        return callback(null, false);
      }
      return callback(null, allowedOrigins.has(normalised));
    },
    credentials: true,
    methods: ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: [
      "Content-Type",
      "Authorization",
      "Stripe-Signature",
      "X-CSRF-Token",
    ],
    maxAge: 600,
  }),
);

// Stripe signature verification requires the exact raw request body.
app.use(
  "/api/stripe/webhook",
  express.raw({ type: "application/json", limit: "1mb" }),
  stripeWebhookRoutes,
);
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true, limit: "1mb" }));

// Establish the browser CSRF cookie even while the database is still being configured.
// This lets the frontend surface a useful 503 configuration message instead of a vague network failure.
app.get("/api/auth/csrf", (_request, response) => {
  const csrfToken = setCsrfCookie(response, false);
  response.setHeader("Cache-Control", "no-store");
  response.json({ success: true, csrfToken });
});

app.use((request, _response, next) => {
  if (!["POST", "PUT", "PATCH", "DELETE"].includes(request.method))
    return next();
  if (request.path.startsWith("/api/stripe/webhook")) return next();
  const origin = request.headers.origin;
  if (!origin) {
    const isMaintenance =
      request.path.startsWith("/api/maintenance/") &&
      request.headers.authorization ===
        `Bearer ${process.env.CRON_SECRET || ""}`;
    if (isMaintenance || process.env.NODE_ENV !== "production") return next();
    return next(
      new HttpError(
        403,
        "Production write requests must include an approved Origin header.",
      ),
    );
  }
  // A malformed Origin (WebKit sends a literal `null`) must fail validation rather than
  // throw, otherwise it surfaces as an opaque 500 instead of an actionable 403.
  let normalisedOrigin: string;
  try {
    normalisedOrigin = normaliseOrigin(origin);
  } catch {
    return next(new HttpError(403, "Request origin validation failed."));
  }
  if (!allowedOrigins.has(normalisedOrigin))
    return next(new HttpError(403, "Request origin validation failed."));
  next();
});

const generalApiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 300,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: {
    success: false,
    message: "Too many requests. Please slow down and try again.",
  },
});
const orderCreationLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 15,
  skip: (request) => request.method !== "POST",
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: {
    success: false,
    message: "Too many checkout attempts. Please try again later.",
  },
});

app.use("/api", generalApiLimiter);
app.use(
  [
    "/api/auth",
    "/api/products",
    "/api/users",
    "/api/cart",
    "/api/orders",
    "/api/admin",
  ],
  (_request, response, next) => {
    response.setHeader("Cache-Control", "no-store");
    next();
  },
);
app.use("/api/orders", orderCreationLimiter);

app.get("/api/health", async (_request, response) => {
  const configuration = {
    mongodb: Boolean(process.env.MONGODB_URI),
    jwt: Boolean(process.env.JWT_SECRET),
    cors: allowedOrigins.size > 0,
    google: Boolean(process.env.GOOGLE_CLIENT_ID),
    email: Boolean(
      process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS,
    ),
    stripe: Boolean(process.env.STRIPE_SECRET_KEY),
    stripeWebhook: Boolean(process.env.STRIPE_WEBHOOK_SECRET),
    contact: Boolean(process.env.CONTACT_EMAIL || process.env.SMTP_USER),
  };

  try {
    await connectDatabase();
    response.json({
      success: true,
      message: "Nōkerè API is healthy",
      timestamp: new Date().toISOString(),
      configuration,
    });
  } catch (error) {
    response.status(503).json({
      success: false,
      message: error instanceof Error ? error.message : "The API is not ready.",
      timestamp: new Date().toISOString(),
      configuration,
    });
  }
});

app.use(
  "/api",
  asyncHandler(async (_request, _response, next) => {
    await connectDatabase();
    next();
  }),
);

const normalisedEmail = (request: express.Request) =>
  String(request.body?.email || "")
    .trim()
    .toLowerCase();
const emailIdentifier = (request: express.Request) =>
  normalisedEmail(request) || String(request.ip || "unknown");
const emailAndNetwork = (request: express.Request) =>
  `${request.ip}:${normalisedEmail(request)}`;
app.use(
  "/api/auth/login",
  persistentRateLimit({
    scope: "auth-login-network",
    windowMs: 15 * 60 * 1000,
    limit: 20,
    message: "Too many sign-in attempts from this network. Try again later.",
  }),
);
app.use(
  "/api/auth/login",
  persistentRateLimit({
    scope: "auth-login-account",
    windowMs: 15 * 60 * 1000,
    limit: 8,
    message: "Too many sign-in attempts for this account. Try again later.",
    identifier: emailIdentifier,
  }),
);
app.use(
  "/api/auth/oauth/google",
  persistentRateLimit({
    scope: "auth-google",
    windowMs: 15 * 60 * 1000,
    limit: 20,
    message: "Too many Google sign-in attempts. Try again later.",
  }),
);
app.use(
  "/api/auth/register",
  persistentRateLimit({
    scope: "auth-register",
    windowMs: 60 * 60 * 1000,
    limit: 8,
    message: "Too many account creation attempts. Try again later.",
    identifier: emailAndNetwork,
  }),
);
app.use(
  "/api/auth/forgot-password",
  persistentRateLimit({
    scope: "auth-recovery",
    windowMs: 60 * 60 * 1000,
    limit: 6,
    message: "Too many password recovery requests. Try again later.",
    identifier: emailAndNetwork,
  }),
);
app.use(
  "/api/auth/verify-email/request",
  persistentRateLimit({
    scope: "auth-verification",
    windowMs: 60 * 60 * 1000,
    limit: 6,
    message: "Too many verification email requests. Try again later.",
  }),
);
app.use(
  "/api/auth/reset-password",
  persistentRateLimit({
    scope: "auth-reset",
    windowMs: 15 * 60 * 1000,
    limit: 10,
    message: "Too many password reset attempts. Try again later.",
  }),
);
app.use(
  "/api/auth/verify-email",
  persistentRateLimit({
    scope: "auth-verify-token",
    windowMs: 15 * 60 * 1000,
    limit: 20,
    message: "Too many email verification attempts. Try again later.",
  }),
);

app.use(csrfProtection);

app.use("/api/auth", authRoutes);
app.use("/api/contact", contactRoutes);
app.use("/api/products", productRoutes);
app.use("/api/cart", cartRoutes);
app.use("/api/users", userRoutes);
app.use("/api/orders", orderRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/maintenance", maintenanceRoutes);

app.use(notFound);
app.use(errorHandler);

export default app;
