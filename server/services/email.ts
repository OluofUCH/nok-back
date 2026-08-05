import nodemailer from "nodemailer";

function frontendUrl() {
  return (process.env.FRONTEND_URL || "http://localhost:5173").replace(/\/$/, "");
}

async function sendMail(subject: string, to: string, html: string) {
  if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASS) {
    if (process.env.NODE_ENV !== "production") {
      console.info(`[email preview] ${subject} to ${to}`);
      console.info(html.replace(/<[^>]+>/g, " "));
    }
    return { sent: false };
  }

  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: String(process.env.SMTP_SECURE).toLowerCase() === "true",
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });

  await transporter.sendMail({
    from: process.env.EMAIL_FROM || "Nokere <no-reply@example.com>",
    to,
    subject,
    html,
  });

  return { sent: true };
}

export async function sendVerificationEmail(email: string, name: string, rawToken: string) {
  const link = `${frontendUrl()}/verify-email?token=${encodeURIComponent(rawToken)}`;
  const result = await sendMail(
    "Verify your Nōkerè email",
    email,
    `<p>Hello ${name},</p><p>Verify your email address to complete your Nōkerè account.</p><p><a href="${link}">Verify email</a></p><p>This link expires in 24 hours.</p>`
  );
  return { ...result, previewUrl: process.env.NODE_ENV === "production" ? undefined : link };
}

export async function sendPasswordResetEmail(email: string, name: string, rawToken: string) {
  const link = `${frontendUrl()}/reset-password?token=${encodeURIComponent(rawToken)}`;
  const result = await sendMail(
    "Reset your Nōkerè password",
    email,
    `<p>Hello ${name},</p><p>Use the link below to set a new password.</p><p><a href="${link}">Reset password</a></p><p>This link expires in one hour. Ignore this message if you did not request it.</p>`
  );
  return { ...result, previewUrl: process.env.NODE_ENV === "production" ? undefined : link };
}

export async function sendContactEmail(input: { name: string; email: string; topic: string; message: string; orderNumber?: string }) {
  const destination = process.env.CONTACT_EMAIL || process.env.SMTP_USER || "";
  if (!destination) return { sent: false };
  const safe = (value: string) => value.replace(/[<>&]/g, (character) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" }[character] || character));
  return sendMail(
    `Nōkerè contact: ${input.topic}`,
    destination,
    `<p><strong>From:</strong> ${safe(input.name)} (${safe(input.email)})</p><p><strong>Topic:</strong> ${safe(input.topic)}</p>${input.orderNumber ? `<p><strong>Order:</strong> ${safe(input.orderNumber)}</p>` : ""}<p>${safe(input.message).replace(/\n/g, "<br>")}</p>`,
  );
}
