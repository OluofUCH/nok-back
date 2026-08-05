import { Router } from "express";
import { releaseExpiredReservations } from "../services/order-inventory";
import { asyncHandler } from "../utils/async-handler";
import { HttpError } from "../utils/http-error";

const router = Router();

const releaseHandler = asyncHandler(async (request, response) => {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.authorization !== `Bearer ${secret}`) throw new HttpError(401, "Maintenance authentication failed.");
  const released = await releaseExpiredReservations(200);
  response.json({ success: true, message: "Expired stock reservations released.", data: { released } });
});

router.get("/release-reservations", releaseHandler);
router.post("/release-reservations", releaseHandler);

export default router;
