import { Router } from "express";
import type { SortOrder } from "mongoose";
import { Category } from "../models/Category";
import { Order } from "../models/Order";
import { Product } from "../models/Product";
import { protect, requireAdmin, requireVerified } from "../middleware/auth";
import { asyncHandler } from "../utils/async-handler";
import { HttpError } from "../utils/http-error";
import { slugify } from "../utils/security";

const router = Router();
router.use(protect, requireVerified);

function productSort(sort: string): Record<string, SortOrder> {
  switch (sort) {
    case "price_asc": return { price: 1 };
    case "price_desc": return { price: -1 };
    case "rating": return { rating: -1, createdAt: -1 };
    case "oldest": return { createdAt: 1 };
    case "newest":
    default: return { createdAt: -1 };
  }
}

function publicProduct<T extends Record<string, any>>(product: T) {
  const reserved = Number(product.reservedStock || 0);
  const { reservedStock: _reservedStock, ...safeProduct } = product;
  const reviews = Array.isArray(product.reviews)
    ? product.reviews.map((review: any) => ({
        name: String(review.name || "Verified customer"),
        rating: Number(review.rating) || 0,
        comment: String(review.comment || ""),
        verifiedPurchase: Boolean(review.verifiedPurchase),
        createdAt: review.createdAt,
      }))
    : [];
  return { ...safeProduct, reviews, stock: Math.max(0, Number(product.stock || 0) - reserved) };
}

router.get("/categories/list", asyncHandler(async (_request, response) => {
  const categories = await Category.find({ isActive: true }).sort({ sortOrder: 1, name: 1 }).lean();
  const counts = await Product.aggregate([
    { $match: { isActive: true } },
    { $group: { _id: "$category", count: { $sum: 1 } } },
  ]);
  const countMap = new Map(counts.map((item) => [item._id, item.count]));
  const known = new Set(categories.map((item) => item.name));
  const legacy = counts
    .filter((item) => !known.has(item._id))
    .map((item) => ({ _id: item._id, name: item._id, slug: slugify(item._id), description: "", image: "", count: item.count }));
  response.json({ success: true, data: [...categories.map((item) => ({ ...item, count: countMap.get(item.name) || 0 })), ...legacy] });
}));

router.get("/featured", asyncHandler(async (_request, response) => {
  const products = await Product.find({ isActive: true }).sort({ isFeatured: -1, rating: -1, createdAt: -1 }).limit(8).lean();
  response.json({ success: true, data: products.map(publicProduct) });
}));

router.get("/", asyncHandler(async (request, response) => {
  const page = Math.max(1, Number(request.query.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(request.query.limit) || 12));
  const filter: Record<string, unknown> = { isActive: true };
  const search = String(request.query.search || "").trim();
  const category = String(request.query.category || "").trim();
  const brand = String(request.query.brand || "").trim();

  if (search) filter.$or = [
    { name: { $regex: search, $options: "i" } },
    { description: { $regex: search, $options: "i" } },
    { category: { $regex: search, $options: "i" } },
  ];
  if (category) filter.category = category;
  if (brand) filter.brand = brand;
  if (request.query.inStock === "true") filter.$expr = { $gt: [{ $subtract: ["$stock", { $ifNull: ["$reservedStock", 0] }] }, 0] };
  if (request.query.minRating) filter.rating = { $gte: Number(request.query.minRating) };
  if (request.query.minPrice || request.query.maxPrice) {
    filter.price = {
      ...(request.query.minPrice ? { $gte: Number(request.query.minPrice) } : {}),
      ...(request.query.maxPrice ? { $lte: Number(request.query.maxPrice) } : {}),
    };
  }

  const [products, total, categories, brands] = await Promise.all([
    Product.find(filter).sort(productSort(String(request.query.sort || "newest"))).skip((page - 1) * limit).limit(limit).lean(),
    Product.countDocuments(filter),
    Product.distinct("category", { isActive: true }),
    Product.distinct("brand", { isActive: true }),
  ]);

  response.json({
    success: true,
    data: {
      products: products.map(publicProduct),
      pagination: { current: page, pages: Math.ceil(total / limit), total, limit },
      filters: { categories, brands },
    },
  });
}));

router.get("/:id", asyncHandler(async (request, response) => {
  const id = request.params.id;
  const identity = /^[a-f\d]{24}$/i.test(id) ? { $or: [{ _id: id }, { slug: id }] } : { slug: id };
  const product = await Product.findOne({ isActive: true, ...identity }).lean();
  if (!product) throw new HttpError(404, "Product not found.");
  const relatedProducts = await Product.find({ _id: { $ne: product._id }, category: product.category, isActive: true }).limit(4).lean();
  response.json({ success: true, data: { product: publicProduct(product), relatedProducts: relatedProducts.map(publicProduct) } });
}));

router.post("/", requireAdmin, asyncHandler(async (request, response) => {
  const name = String(request.body?.name || "").trim();
  const description = String(request.body?.description || "").trim();
  if (!name || description.length < 10) throw new HttpError(400, "Product name and a description of at least 10 characters are required.");
  const price = Number(request.body?.price);
  const stock = Number(request.body?.stock);
  if (!Number.isFinite(price) || price < 0 || !Number.isInteger(stock) || stock < 0) throw new HttpError(400, "Price and stock must be valid positive values.");

  let slug = slugify(String(request.body?.slug || name));
  if (await Product.exists({ slug })) slug = `${slug}-${Date.now().toString(36)}`;
  const product = await Product.create({
    name,
    description,
    slug,
    price,
    compareAtPrice: request.body.compareAtPrice ? Number(request.body.compareAtPrice) : undefined,
    category: String(request.body.category || "").trim(),
    brand: String(request.body.brand || "Nōkerè").trim(),
    stock,
    reservedStock: 0,
    images: Array.isArray(request.body.images) ? request.body.images.slice(0, 12) : [],
    isActive: request.body.isActive !== false,
    isFeatured: request.body.isFeatured === true,
  });
  if (!product.category) throw new HttpError(400, "Product category is required.");
  await Category.updateOne({ name: product.category }, { $setOnInsert: { name: product.category, slug: slugify(product.category), isActive: true } }, { upsert: true });
  response.status(201).json({ success: true, message: "Product created successfully.", data: { product } });
}));

router.put("/:id", requireAdmin, asyncHandler(async (request, response) => {
  const product = await Product.findById(request.params.id);
  if (!product) throw new HttpError(404, "Product not found.");
  const previousCategory = product.category;
  const allowed = ["name", "description", "price", "compareAtPrice", "category", "brand", "stock", "images", "isActive", "isFeatured"];
  for (const key of allowed) {
    if (request.body[key] !== undefined) (product as any)[key] = request.body[key];
  }
  if (Number(product.stock) < Number((product as any).reservedStock || 0)) {
    throw new HttpError(409, "Stock cannot be reduced below the quantity currently reserved in unpaid orders.");
  }
  if (request.body.name && !request.body.slug) product.slug = slugify(request.body.name);
  if (request.body.slug) product.slug = slugify(request.body.slug);
  await product.save();
  if (product.category && product.category !== previousCategory) {
    await Category.updateOne({ name: product.category }, { $setOnInsert: { name: product.category, slug: slugify(product.category), isActive: true } }, { upsert: true });
  }
  response.json({ success: true, message: "Product updated successfully.", data: { product } });
}));

router.delete("/:id", requireAdmin, asyncHandler(async (request, response) => {
  const product = await Product.findById(request.params.id);
  if (!product) throw new HttpError(404, "Product not found.");
  product.isActive = false;
  await product.save({ validateBeforeSave: false });
  response.json({ success: true, message: "Product deleted successfully." });
}));

router.post("/:id/reviews", asyncHandler(async (request, response) => {
  const product = await Product.findById(request.params.id);
  if (!product) throw new HttpError(404, "Product not found.");
  const rating = Number(request.body?.rating);
  const comment = String(request.body?.comment || "").trim();
  if (!Number.isInteger(rating) || rating < 1 || rating > 5 || comment.length < 10 || comment.length > 500) {
    throw new HttpError(400, "Rating must be 1 to 5 and the review must be 10 to 500 characters.");
  }
  if (product.reviews.some((review: any) => String(review.user) === String(request.user!._id))) {
    throw new HttpError(409, "You have already reviewed this product.");
  }
  const verifiedPurchase = Boolean(await Order.exists({
    user: request.user!._id,
    isPaid: true,
    "orderItems.product": product._id,
  }));
  if (!verifiedPurchase) throw new HttpError(403, "Reviews are available after a verified purchase.");

  product.reviews.push({ user: request.user!._id, name: request.user!.name, rating, comment, verifiedPurchase: true } as any);
  product.numReviews = product.reviews.length;
  product.rating = product.reviews.reduce((sum: number, review: any) => sum + review.rating, 0) / product.numReviews;
  await product.save();
  response.status(201).json({ success: true, message: "Review added successfully.", data: { rating: product.rating, numReviews: product.numReviews } });
}));

export default router;
