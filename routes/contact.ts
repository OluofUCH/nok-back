import { Router } from "express";
import { protect, requireVerified } from "../middleware/auth";
import { asyncHandler } from "../utils/async-handler";
import { HttpError } from "../utils/http-error";
import { sendContactEmail } from "../services/email";

const router = Router();
router.use(protect, requireVerified);

router.post("/", asyncHandler(async (request, response) => {
  const name = String(request.body?.name || request.user?.name || "").trim().slice(0, 100);
  const email = String(request.body?.email || request.user?.email || "").trim().toLowerCase().slice(0, 180);
  const topic = String(request.body?.topic || "General enquiry").trim().slice(0, 120);
  const message = String(request.body?.message || "").trim().slice(0, 5000);
  const orderNumber = String(request.body?.orderNumber || "").trim().slice(0, 80);
  if (name.length < 2 || !/^\S+@\S+\.\S+$/.test(email) || message.length < 10) throw new HttpError(400, "Enter your name, a valid email address and a message.");
  const result = await sendContactEmail({ name, email, topic, message, orderNumber });
  if (!result.sent && process.env.NODE_ENV === "production") throw new HttpError(503, "Contact email is not configured.");
  response.json({ success: true, message: "Thank you. Your message has been sent.", sent: result.sent });
}));
export default router;
