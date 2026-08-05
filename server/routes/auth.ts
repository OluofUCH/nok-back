import bcrypt from "bcryptjs";
import { OAuth2Client } from "google-auth-library";
import { Router } from "express";
import { User } from "../models/User";
import { protect } from "../middleware/auth";
import { asyncHandler } from "../utils/async-handler";
import { HttpError } from "../utils/http-error";
import { createRawToken, hashToken, verifyToken } from "../utils/security";
import { clearSessionCookie, readSessionToken, setCsrfCookie, setSessionCookie } from "../utils/session";
import { userView } from "../utils/user-view";
import { sendPasswordResetEmail, sendVerificationEmail } from "../services/email";

const router = Router();
const passwordPattern = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{10,}$/;
const MAX_LOGIN_ATTEMPTS = 5;
const LOCK_TIME_MS = 20 * 60 * 1000;
const DUMMY_PASSWORD_HASH = "$2a$12$8mYCGmM9jC6g0D8xR7d5oe7j9GYcTVa0YlRzC3kTRg2R2fMfK6Z9K";

function validEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function assertPassword(password: string) {
  if (!passwordPattern.test(password)) {
    throw new HttpError(400, "Password must be at least 10 characters and include uppercase, lowercase and a number.");
  }
}

function rememberRequested(value: unknown) {
  return value !== false;
}

async function issueVerification(user: any) {
  if (user.isEmailVerified) return { sent: false };
  const rawToken = createRawToken();
  user.emailVerificationToken = hashToken(rawToken);
  user.emailVerificationExpires = new Date(Date.now() + 24 * 60 * 60 * 1000);
  await user.save({ validateBeforeSave: false });
  return sendVerificationEmail(user.email, user.name, rawToken);
}

router.get("/csrf", (_request, response) => {
  const csrfToken = setCsrfCookie(response, false);
  response.setHeader("Cache-Control", "no-store");
  response.json({ success: true, csrfToken });
});

router.post(
  "/register",
  asyncHandler(async (request, response) => {
    const name = String(request.body?.name || "").trim();
    const email = String(request.body?.email || "").trim().toLowerCase();
    const password = String(request.body?.password || "");

    if (name.length < 2) throw new HttpError(400, "Enter your full name.");
    if (!validEmail(email)) throw new HttpError(400, "Enter a valid email address.");
    assertPassword(password);

    const existing = await User.findOne({ email });
    if (existing) throw new HttpError(409, "An account with this email already exists.");

    const user = await User.create({
      name,
      email,
      password: await bcrypt.hash(password, 12),
      authProvider: "local",
    });

    const emailVerification = await issueVerification(user);
    setSessionCookie(response, user, rememberRequested(request.body?.remember));

    response.status(201).json({
      success: true,
      message: "Account created successfully. Verify your email to enter the store.",
      user: userView(user),
      emailVerification,
    });
  })
);

router.post(
  "/login",
  asyncHandler(async (request, response) => {
    const email = String(request.body?.email || "").trim().toLowerCase();
    const password = String(request.body?.password || "");
    if (!email || !password) throw new HttpError(400, "Enter your email address and password.");

    const user = await User.findOne({ email }).select("+password +tokenVersion +loginAttempts +lockUntil");
    const now = new Date();
    if (user?.lockUntil && user.lockUntil > now) {
      throw new HttpError(429, "Too many unsuccessful attempts. Try again in 20 minutes.");
    }

    const valid = user ? await user.comparePassword(password) : await bcrypt.compare(password, DUMMY_PASSWORD_HASH);
    if (!user || !valid) {
      if (user) {
        const attempts = Number((user as any).loginAttempts || 0) + 1;
        (user as any).loginAttempts = attempts;
        if (attempts >= MAX_LOGIN_ATTEMPTS) (user as any).lockUntil = new Date(Date.now() + LOCK_TIME_MS);
        await user.save({ validateBeforeSave: false });
      }
      throw new HttpError(401, "The email address or password is incorrect.");
    }
    if (!user.isActive) throw new HttpError(403, "This account has been deactivated.");

    (user as any).loginAttempts = 0;
    (user as any).lockUntil = undefined;
    user.lastLoginAt = new Date();
    await user.save({ validateBeforeSave: false });
    setSessionCookie(response, user, rememberRequested(request.body?.remember));

    response.json({
      success: true,
      message: user.isEmailVerified ? "Login successful." : "Login successful. Verify your email to enter the store.",
      user: userView(user),
    });
  })
);

router.get(
  "/me",
  protect,
  asyncHandler(async (request, response) => {
    response.json({ success: true, user: userView(request.user!) });
  })
);

router.put(
  "/profile",
  protect,
  asyncHandler(async (request, response) => {
    const user = request.user!;
    const nextEmail = request.body?.email ? String(request.body.email).trim().toLowerCase() : user.email;
    if (!validEmail(nextEmail)) throw new HttpError(400, "Enter a valid email address.");

    if (nextEmail !== user.email) {
      const exists = await User.exists({ email: nextEmail, _id: { $ne: user._id } });
      if (exists) throw new HttpError(409, "That email address is already in use.");
      user.email = nextEmail;
      user.isEmailVerified = false;
    }

    if (request.body?.name !== undefined) {
      const name = String(request.body.name).trim();
      if (name.length < 2 || name.length > 80) throw new HttpError(400, "Enter a valid full name.");
      user.name = name;
    }
    if (request.body?.phone !== undefined) user.phone = String(request.body.phone).trim().slice(0, 40);
    if (request.body?.avatar !== undefined) user.avatar = String(request.body.avatar).trim().slice(0, 1200);
    if (request.body?.address && typeof request.body.address === "object") user.address = request.body.address;
    await user.save();

    let emailVerification;
    if (!user.isEmailVerified) emailVerification = await issueVerification(user);
    response.json({ success: true, message: "Profile updated.", user: userView(user), emailVerification });
  })
);

router.put(
  "/change-password",
  protect,
  asyncHandler(async (request, response) => {
    const currentPassword = String(request.body?.currentPassword || "");
    const newPassword = String(request.body?.newPassword || "");
    assertPassword(newPassword);

    const user = await User.findById(request.user!._id).select("+password +tokenVersion");
    if (!user || !(await user.comparePassword(currentPassword))) {
      throw new HttpError(401, "Your current password is incorrect.");
    }

    user.password = await bcrypt.hash(newPassword, 12);
    user.authProvider = "local";
    (user as any).tokenVersion = Number((user as any).tokenVersion || 0) + 1;
    await user.save();
    setSessionCookie(response, user, true);
    response.json({ success: true, message: "Password changed successfully." });
  })
);

router.post(
  "/forgot-password",
  asyncHandler(async (request, response) => {
    const email = String(request.body?.email || "").trim().toLowerCase();
    const user = validEmail(email) ? await User.findOne({ email }) : null;
    let previewUrl: string | undefined;

    if (user && user.isActive) {
      const rawToken = createRawToken();
      user.passwordResetToken = hashToken(rawToken);
      user.passwordResetExpires = new Date(Date.now() + 60 * 60 * 1000);
      await user.save({ validateBeforeSave: false });
      const result = await sendPasswordResetEmail(user.email, user.name, rawToken);
      previewUrl = result.previewUrl;
    }

    response.json({
      success: true,
      message: "If an account with that email exists, a reset link has been sent.",
      ...(previewUrl ? { previewUrl } : {}),
    });
  })
);

router.put(
  "/reset-password/:token",
  asyncHandler(async (request, response) => {
    const password = String(request.body?.password || "");
    assertPassword(password);

    const user = await User.findOne({
      passwordResetToken: hashToken(request.params.token),
      passwordResetExpires: { $gt: new Date() },
    }).select("+passwordResetToken +passwordResetExpires +tokenVersion");

    if (!user) throw new HttpError(400, "This password reset link is invalid or has expired.");
    user.password = await bcrypt.hash(password, 12);
    user.authProvider = "local";
    user.passwordResetToken = undefined;
    user.passwordResetExpires = undefined;
    (user as any).tokenVersion = Number((user as any).tokenVersion || 0) + 1;
    await user.save();
    setSessionCookie(response, user, true);

    response.json({ success: true, message: "Password reset successfully.", user: userView(user) });
  })
);

router.post(
  "/oauth/google",
  asyncHandler(async (request, response) => {
    const idToken = String(request.body?.idToken || "");
    const clientId = process.env.GOOGLE_CLIENT_ID;
    if (!clientId) throw new HttpError(503, "Google sign-in is not configured on the server.");
    if (!idToken) throw new HttpError(400, "Google did not return an identity token.");

    const client = new OAuth2Client(clientId);
    const ticket = await client.verifyIdToken({ idToken, audience: clientId });
    const payload = ticket.getPayload();
    const email = payload?.email?.toLowerCase();
    if (!email || !payload?.sub || !payload.email_verified) {
      throw new HttpError(401, "Google could not verify this email address.");
    }

    let user = await User.findOne({ email }).select("+tokenVersion");
    if (!user) {
      user = await User.create({
        name: payload.name || email.split("@")[0],
        email,
        googleId: payload.sub,
        avatar: payload.picture || "",
        authProvider: "google",
        isEmailVerified: true,
      });
    } else {
      if (!user.isActive) throw new HttpError(403, "This account has been deactivated.");
      user.googleId = payload.sub;
      user.avatar = user.avatar || payload.picture || "";
      user.isEmailVerified = true;
      user.lastLoginAt = new Date();
      await user.save({ validateBeforeSave: false });
    }

    setSessionCookie(response, user, rememberRequested(request.body?.remember));
    response.json({ success: true, message: "Google authentication successful.", user: userView(user) });
  })
);

router.post(
  "/verify-email/request",
  protect,
  asyncHandler(async (request, response) => {
    if (request.user!.isEmailVerified) {
      return response.json({ success: true, message: "Your email is already verified.", emailVerification: { sent: false } });
    }
    const emailVerification = await issueVerification(request.user!);
    response.json({ success: true, message: "Verification email requested.", emailVerification });
  })
);

async function verifyEmailToken(rawToken: string) {
  const user = await User.findOne({
    emailVerificationToken: hashToken(rawToken),
    emailVerificationExpires: { $gt: new Date() },
  }).select("+emailVerificationToken +emailVerificationExpires");
  if (!user) throw new HttpError(400, "This verification link is invalid or has expired.");
  user.isEmailVerified = true;
  user.emailVerificationToken = undefined;
  user.emailVerificationExpires = undefined;
  await user.save({ validateBeforeSave: false });
  return user;
}

router.post(
  "/verify-email",
  asyncHandler(async (request, response) => {
    const token = String(request.body?.token || "");
    if (!token) throw new HttpError(400, "Verification token is required.");
    const user = await verifyEmailToken(token);
    setSessionCookie(response, user, true);
    response.json({ success: true, message: "Email verified successfully.", user: userView(user) });
  })
);

router.get(
  "/verify-email/:token",
  asyncHandler(async (request, response) => {
    const user = await verifyEmailToken(request.params.token);
    setSessionCookie(response, user, true);
    response.json({ success: true, message: "Email verified successfully.", user: userView(user) });
  })
);

router.post(
  "/logout",
  asyncHandler(async (request, response) => {
    clearSessionCookie(response);
    const token = readSessionToken(request);
    if (token) {
      try {
        const payload = verifyToken(token);
        await User.updateOne({ _id: payload.id }, { $inc: { tokenVersion: 1 } });
      } catch {
        // The cookie is cleared even when the old token is already invalid or expired.
      }
    }
    response.json({ success: true, message: "Logged out successfully." });
  })
);

export default router;
