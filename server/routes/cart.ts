import { Router } from "express";
import { Cart } from "../models/Cart";
import { Product } from "../models/Product";
import { protect, requireVerified } from "../middleware/auth";
import { asyncHandler } from "../utils/async-handler";
import { HttpError } from "../utils/http-error";

const router = Router();
router.use(protect, requireVerified);

function availableStock(product: any) {
  return Math.max(0, Number(product.stock || 0) - Number(product.reservedStock || 0));
}

async function cartView(userId: string) {
  const cart = await Cart.findOne({ user: userId }).populate("items.product").lean();
  const items = (cart?.items || [])
    .filter((item: any) => item.product && item.product.isActive !== false)
    .map((item: any) => ({
      ...item,
      product: { ...item.product, stock: availableStock(item.product) },
      price: Number(item.product.price),
    }));
  const totalItems = items.reduce((sum: number, item: any) => sum + Number(item.quantity || 0), 0);
  const totalPrice = items.reduce((sum: number, item: any) => sum + Number(item.price || 0) * Number(item.quantity || 0), 0);
  return { user: userId, items, totalItems, totalPrice: Number(totalPrice.toFixed(2)) };
}

router.get("/", asyncHandler(async (request, response) => {
  response.json({ success: true, data: await cartView(String(request.user!._id)) });
}));

router.get("/count", asyncHandler(async (request, response) => {
  const cart = await Cart.findOne({ user: request.user!._id }).lean();
  const count = (cart?.items || []).reduce((sum, item) => sum + Number(item.quantity || 0), 0);
  response.json({ success: true, data: { count } });
}));

router.post("/add", asyncHandler(async (request, response) => {
  const productId = String(request.body?.productId || "");
  const quantity = Number(request.body?.quantity);
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 20) throw new HttpError(400, "Select a quantity between 1 and 20.");
  const product = await Product.findOne({ _id: productId, isActive: true });
  if (!product) throw new HttpError(404, "Product not found.");

  const cart = await Cart.findOneAndUpdate(
    { user: request.user!._id },
    { $setOnInsert: { user: request.user!._id } },
    { upsert: true, new: true },
  );
  const existing = cart.items.find((item: any) => String(item.product) === productId);
  const next = existing ? Number(existing.quantity) + quantity : quantity;
  if (availableStock(product) < next) throw new HttpError(409, "There is not enough available stock for this quantity.");
  if (existing) {
    existing.quantity = next;
    existing.price = product.price;
  } else {
    cart.items.push({ product: product._id, quantity, price: product.price } as any);
  }
  await cart.save();
  response.json({ success: true, message: "Item added to cart.", data: await cartView(String(request.user!._id)) });
}));

router.put("/update", asyncHandler(async (request, response) => {
  const productId = String(request.body?.productId || "");
  const quantity = Number(request.body?.quantity);
  if (!Number.isInteger(quantity) || quantity < 0 || quantity > 20) throw new HttpError(400, "Select a quantity between 0 and 20.");
  const cart = await Cart.findOne({ user: request.user!._id });
  if (!cart) throw new HttpError(404, "Cart not found.");
  const item = cart.items.find((entry: any) => String(entry.product) === productId);
  if (!item) throw new HttpError(404, "Cart item not found.");
  if (quantity === 0) cart.items = cart.items.filter((entry: any) => String(entry.product) !== productId) as any;
  else {
    const product = await Product.findOne({ _id: productId, isActive: true });
    if (!product || availableStock(product) < quantity) throw new HttpError(409, "There is not enough available stock for this quantity.");
    item.quantity = quantity;
    item.price = product.price;
  }
  await cart.save();
  response.json({ success: true, data: await cartView(String(request.user!._id)) });
}));

router.delete("/remove/:productId", asyncHandler(async (request, response) => {
  await Cart.updateOne({ user: request.user!._id }, { $pull: { items: { product: request.params.productId } } });
  response.json({ success: true, message: "Item removed from cart successfully", data: await cartView(String(request.user!._id)) });
}));

router.delete("/clear", asyncHandler(async (request, response) => {
  await Cart.findOneAndUpdate({ user: request.user!._id }, { $set: { items: [] } }, { upsert: true });
  response.json({ success: true, message: "Cart cleared.", data: await cartView(String(request.user!._id)) });
}));

export default router;
