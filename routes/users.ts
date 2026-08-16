import { Router } from "express";
import { Product } from "../models/Product";
import { User } from "../models/User";
import { protect, requireVerified } from "../middleware/auth";
import { asyncHandler } from "../utils/async-handler";
import { HttpError } from "../utils/http-error";
import { userView } from "../utils/user-view";
import { clearSessionCookie } from "../utils/session";

const router = Router();
router.use(protect, requireVerified);

router.get("/wishlist", asyncHandler(async (request, response) => {
  const user = await User.findById(request.user!._id).populate("wishlist");
  response.json({ success: true, data: user?.wishlist || [] });
}));

router.post("/wishlist/:productId", asyncHandler(async (request, response) => {
  const product = await Product.findOne({ _id: request.params.productId, isActive: true });
  if (!product) throw new HttpError(404, "Product not found.");
  await User.updateOne({ _id: request.user!._id }, { $addToSet: { wishlist: product._id } });
  response.json({ success: true, message: "Product added to wishlist successfully" });
}));

router.delete("/wishlist/:productId", asyncHandler(async (request, response) => {
  await User.updateOne({ _id: request.user!._id }, { $pull: { wishlist: request.params.productId } });
  response.json({ success: true, message: "Product removed from wishlist successfully" });
}));

router.delete("/wishlist", asyncHandler(async (request, response) => {
  await User.updateOne({ _id: request.user!._id }, { $set: { wishlist: [] } });
  response.json({ success: true, message: "Wishlist cleared successfully" });
}));

router.get("/wishlist/:productId", asyncHandler(async (request, response) => {
  const user = await User.findById(request.user!._id).select("wishlist").lean();
  const isInWishlist = Boolean(user?.wishlist?.some((id: any) => String(id) === request.params.productId));
  response.json({ success: true, data: { isInWishlist } });
}));

router.put("/address", asyncHandler(async (request, response) => {
  const source = request.body && typeof request.body === "object" ? request.body : {};
  const address = {
    street: String(source.street || "").trim().slice(0, 180),
    city: String(source.city || "").trim().slice(0, 100),
    state: String(source.state || "").trim().slice(0, 100),
    zipCode: String(source.zipCode || "").trim().slice(0, 24),
    country: String(source.country || "").trim().slice(0, 100),
  };
  if (!address.street || !address.city || !address.zipCode || !address.country) throw new HttpError(400, "Complete the required address fields.");
  const user = await User.findByIdAndUpdate(request.user!._id, { $set: { address } }, { new: true, runValidators: true });
  if (!user) throw new HttpError(404, "User not found.");
  response.json({ success: true, message: "Address updated successfully", data: userView(user) });
}));

router.get("/profile", asyncHandler(async (request, response) => {
  const user = await User.findById(request.user!._id).populate("wishlist");
  if (!user) throw new HttpError(404, "User not found.");
  response.json({ success: true, data: { ...userView(user), wishlist: user.wishlist } });
}));

router.put("/avatar", asyncHandler(async (request, response) => {
  const avatar = String(request.body?.avatar || "").trim().slice(0, 1200);
  if (avatar && !/^https:\/\//i.test(avatar)) throw new HttpError(400, "Avatar must use a secure HTTPS URL.");
  const user = await User.findByIdAndUpdate(request.user!._id, { avatar }, { new: true });
  if (!user) throw new HttpError(404, "User not found.");
  response.json({ success: true, message: "Avatar updated successfully", data: userView(user) });
}));

router.delete("/account", asyncHandler(async (request, response) => {
  if (["admin", "superadmin"].includes(String(request.user!.role))) {
    throw new HttpError(409, "Administrator accounts cannot be self-deactivated. Another super administrator must manage this account.");
  }
  await User.updateOne({ _id: request.user!._id }, { $set: { isActive: false }, $inc: { tokenVersion: 1 } });
  clearSessionCookie(response);
  response.json({ success: true, message: "Account deactivated successfully" });
}));

export default router;
