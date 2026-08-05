import { Router } from "express";
import { Category } from "../models/Category";
import { Order } from "../models/Order";
import { Product } from "../models/Product";
import { User } from "../models/User";
import { protect, requireAdmin, requireSuperAdmin, requireVerified } from "../middleware/auth";
import { withAdminRoleLock } from "../services/admin-role-lock";
import { asyncHandler } from "../utils/async-handler";
import { HttpError } from "../utils/http-error";
import { slugify } from "../utils/security";
import { userView } from "../utils/user-view";

const router = Router();
router.use(protect, requireVerified, requireAdmin);

function startOfDay(date: Date) {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

router.get(
  "/dashboard",
  asyncHandler(async (_request, response) => {
    const now = new Date();
    const currentStart = startOfDay(new Date(now.getTime() - 29 * 24 * 60 * 60 * 1000));
    const previousStart = startOfDay(new Date(now.getTime() - 59 * 24 * 60 * 60 * 1000));

    const [
      totalOrders,
      totalProducts,
      totalCustomers,
      paidTotals,
      currentTotals,
      previousTotals,
      recentOrders,
      lowStock,
      topProducts,
      salesRows,
      pendingOrders,
    ] = await Promise.all([
      Order.countDocuments(),
      Product.countDocuments({ isActive: true }),
      User.countDocuments({ role: "user", isActive: true }),
      Order.aggregate([{ $match: { isPaid: true } }, { $group: { _id: null, revenue: { $sum: "$totalPrice" }, orders: { $sum: 1 } } }]),
      Order.aggregate([{ $match: { isPaid: true, createdAt: { $gte: currentStart } } }, { $group: { _id: null, revenue: { $sum: "$totalPrice" }, orders: { $sum: 1 } } }]),
      Order.aggregate([{ $match: { isPaid: true, createdAt: { $gte: previousStart, $lt: currentStart } } }, { $group: { _id: null, revenue: { $sum: "$totalPrice" }, orders: { $sum: 1 } } }]),
      Order.find().populate("user", "name email").sort({ createdAt: -1 }).limit(8).lean(),
      Product.aggregate([
        { $match: { isActive: true } },
        { $addFields: { availableStock: { $max: [0, { $subtract: ["$stock", { $ifNull: ["$reservedStock", 0] }] }] } } },
        { $match: { availableStock: { $lte: 5 } } },
        { $sort: { availableStock: 1, stock: 1 } },
        { $limit: 8 },
      ]),
      Order.aggregate([
        { $match: { isPaid: true, status: { $ne: "cancelled" } } },
        { $unwind: "$orderItems" },
        { $group: { _id: "$orderItems.product", name: { $first: "$orderItems.name" }, image: { $first: "$orderItems.image" }, units: { $sum: "$orderItems.quantity" }, revenue: { $sum: { $multiply: ["$orderItems.price", "$orderItems.quantity"] } } } },
        { $sort: { units: -1 } },
        { $limit: 6 },
      ]),
      Order.aggregate([
        { $match: { isPaid: true, createdAt: { $gte: currentStart } } },
        { $group: { _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } }, revenue: { $sum: "$totalPrice" }, orders: { $sum: 1 } } },
        { $sort: { _id: 1 } },
      ]),
      Order.countDocuments({ status: { $in: ["awaiting_payment", "processing"] } }),
    ]);

    const paid = paidTotals[0] || { revenue: 0, orders: 0 };
    const current = currentTotals[0] || { revenue: 0, orders: 0 };
    const previous = previousTotals[0] || { revenue: 0, orders: 0 };
    const percentChange = (value: number, old: number) => old ? ((value - old) / old) * 100 : value ? 100 : 0;

    response.json({
      success: true,
      data: {
        stats: {
          revenue: paid.revenue || 0,
          orders: totalOrders,
          products: totalProducts,
          customers: totalCustomers,
          averageOrderValue: paid.orders ? paid.revenue / paid.orders : 0,
          pendingOrders,
          revenueChange: percentChange(current.revenue || 0, previous.revenue || 0),
          orderChange: percentChange(current.orders || 0, previous.orders || 0),
        },
        salesTrend: salesRows,
        recentOrders,
        topProducts,
        lowStock,
      },
    });
  })
);

router.get(
  "/stats",
  asyncHandler(async (_request, response) => {
    const [users, products, orders, revenue] = await Promise.all([
      User.countDocuments(),
      Product.countDocuments(),
      Order.countDocuments(),
      Order.aggregate([{ $match: { isPaid: true } }, { $group: { _id: null, total: { $sum: "$totalPrice" } } }]),
    ]);
    response.json({ success: true, data: { users, products, orders, revenue: revenue[0]?.total || 0 } });
  })
);

router.get(
  "/analytics/sales",
  asyncHandler(async (request, response) => {
    const period = Math.min(365, Math.max(1, Number(request.query.period) || 30));
    const start = startOfDay(new Date(Date.now() - (period - 1) * 24 * 60 * 60 * 1000));
    const [dailySales, categorySales] = await Promise.all([
      Order.aggregate([
        { $match: { isPaid: true, createdAt: { $gte: start } } },
        { $group: { _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } }, revenue: { $sum: "$totalPrice" }, orders: { $sum: 1 } } },
        { $sort: { _id: 1 } },
      ]),
      Order.aggregate([
        { $match: { isPaid: true, createdAt: { $gte: start } } },
        { $unwind: "$orderItems" },
        { $lookup: { from: "products", localField: "orderItems.product", foreignField: "_id", as: "product" } },
        { $unwind: { path: "$product", preserveNullAndEmptyArrays: true } },
        { $group: { _id: { $ifNull: ["$product.category", "Uncategorised"] }, revenue: { $sum: { $multiply: ["$orderItems.price", "$orderItems.quantity"] } }, quantity: { $sum: "$orderItems.quantity" } } },
        { $sort: { revenue: -1 } },
      ]),
    ]);
    response.json({ success: true, data: { dailySales, categorySales } });
  })
);

router.get(
  "/products",
  asyncHandler(async (request, response) => {
    const page = Math.max(1, Number(request.query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(request.query.limit) || 25));
    const filter: Record<string, unknown> = {};
    const search = String(request.query.search || "").trim();
    if (search) filter.$or = [{ name: { $regex: search, $options: "i" } }, { description: { $regex: search, $options: "i" } }];
    if (request.query.category) filter.category = String(request.query.category);
    if (request.query.isActive !== undefined) filter.isActive = request.query.isActive === "true";
    const availableExpression = { $subtract: ["$stock", { $ifNull: ["$reservedStock", 0] }] };
    if (request.query.stockStatus === "low") filter.$expr = { $and: [{ $gt: [availableExpression, 0] }, { $lte: [availableExpression, 5] }] };
    if (request.query.stockStatus === "out") filter.$expr = { $lte: [availableExpression, 0] };

    const [products, total] = await Promise.all([
      Product.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
      Product.countDocuments(filter),
    ]);
    const inventoryProducts = products.map((product: any) => ({
      ...product,
      availableStock: Math.max(0, Number(product.stock || 0) - Number(product.reservedStock || 0)),
    }));
    response.json({ success: true, data: { products: inventoryProducts, pagination: { current: page, pages: Math.ceil(total / limit), total } } });
  })
);

router.get(
  "/users",
  asyncHandler(async (request, response) => {
    const page = Math.max(1, Number(request.query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(request.query.limit) || 25));
    const filter: Record<string, unknown> = {};
    const search = String(request.query.search || "").trim();
    if (search) filter.$or = [{ name: { $regex: search, $options: "i" } }, { email: { $regex: search, $options: "i" } }];
    if (request.query.role) filter.role = String(request.query.role);
    if (request.query.isActive !== undefined) filter.isActive = request.query.isActive === "true";

    const [users, total] = await Promise.all([
      User.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit),
      User.countDocuments(filter),
    ]);
    response.json({ success: true, data: { users: users.map(userView), pagination: { current: page, pages: Math.ceil(total / limit), total } } });
  })
);

router.put(
  "/users/:id/role",
  requireSuperAdmin,
  asyncHandler(async (request, response) => {
    const role = String(request.body?.role || "");
    if (!["user", "admin", "superadmin"].includes(role)) throw new HttpError(400, "Role must be user, admin or superadmin.");
    if (String(request.user!._id) === request.params.id) throw new HttpError(409, "You cannot change your own administrator role.");

    const user = await withAdminRoleLock(async () => {
      const target = await User.findById(request.params.id).select("+tokenVersion");
      if (!target) throw new HttpError(404, "User not found.");
      const currentRole = String(target.role);
      if (["admin", "superadmin"].includes(role) && !target.isActive) {
        throw new HttpError(409, "Activate this account before granting administrator access.");
      }
      if (["admin", "superadmin"].includes(role) && !target.isEmailVerified) {
        throw new HttpError(409, "Verify this user email before granting administrator access.");
      }

      if (currentRole === "superadmin" && role !== "superadmin") {
        const remainingSuperAdmins = await User.countDocuments({ _id: { $ne: target._id }, role: "superadmin", isActive: true });
        if (remainingSuperAdmins < 1) throw new HttpError(409, "The last active super administrator cannot be demoted.");
      }
      if (["admin", "superadmin"].includes(currentRole) && role === "user") {
        const remainingAdmins = await User.countDocuments({ _id: { $ne: target._id }, role: { $in: ["admin", "superadmin"] }, isActive: true });
        if (remainingAdmins < 1) throw new HttpError(409, "The last active administrator cannot be demoted.");
      }

      target.role = role as any;
      (target as any).tokenVersion = Number((target as any).tokenVersion || 0) + 1;
      await target.save({ validateBeforeSave: false });
      return target;
    });

    response.json({ success: true, message: "User role updated. Existing sessions were invalidated.", data: userView(user) });
  })
);

router.put(
  "/users/:id/toggle-status",
  asyncHandler(async (request, response) => {
    if (String(request.user!._id) === request.params.id) throw new HttpError(409, "You cannot deactivate your own account.");

    const user = await withAdminRoleLock(async () => {
      const target = await User.findById(request.params.id).select("+tokenVersion");
      if (!target) throw new HttpError(404, "User not found.");

      const deactivating = target.isActive;
      const privileged = ["admin", "superadmin"].includes(String(target.role));
      if (privileged && request.user!.role !== "superadmin") {
        throw new HttpError(403, "Only a super administrator can change an administrator account status.");
      }
      if (deactivating && target.role === "superadmin") {
        const remainingSuperAdmins = await User.countDocuments({ _id: { $ne: target._id }, role: "superadmin", isActive: true });
        if (remainingSuperAdmins < 1) throw new HttpError(409, "The last active super administrator cannot be deactivated.");
      }
      if (deactivating && privileged) {
        const remainingAdmins = await User.countDocuments({ _id: { $ne: target._id }, role: { $in: ["admin", "superadmin"] }, isActive: true });
        if (remainingAdmins < 1) throw new HttpError(409, "The last active administrator cannot be deactivated.");
      }

      target.isActive = !target.isActive;
      (target as any).tokenVersion = Number((target as any).tokenVersion || 0) + 1;
      await target.save({ validateBeforeSave: false });
      return target;
    });

    response.json({ success: true, message: user.isActive ? "User activated." : "User deactivated.", data: userView(user) });
  })
);

router.get(
  "/categories",
  asyncHandler(async (_request, response) => {
    const defaults = ["Dresses", "Bags", "Shoes", "Accessories", "Art", "Books"];
    const productCategories = await Product.distinct("category");
    const names = Array.from(new Set([...defaults, ...productCategories].filter(Boolean)));
    await Promise.all(names.map((name, index) => Category.updateOne(
      { name },
      { $setOnInsert: { name, slug: slugify(name), isActive: true, sortOrder: index } },
      { upsert: true }
    )));
    const categories = await Category.find().sort({ sortOrder: 1, name: 1 }).lean();
    const counts = await Product.aggregate([{ $group: { _id: "$category", productCount: { $sum: 1 } } }]);
    const countMap = new Map(counts.map((item) => [item._id, item.productCount]));
    response.json({ success: true, data: categories.map((item) => ({ ...item, productCount: countMap.get(item.name) || 0 })) });
  })
);

router.post(
  "/categories",
  asyncHandler(async (request, response) => {
    const name = String(request.body?.name || "").trim();
    if (!name) throw new HttpError(400, "Category name is required.");
    const category = await Category.create({
      name,
      slug: slugify(name),
      description: String(request.body?.description || "").trim(),
      image: String(request.body?.image || "").trim(),
      isActive: request.body?.isActive !== false,
      sortOrder: Number(request.body?.sortOrder) || 0,
    });
    response.status(201).json({ success: true, message: "Category created.", data: category });
  })
);

router.put(
  "/categories/:id",
  asyncHandler(async (request, response) => {
    const category = await Category.findById(request.params.id);
    if (!category) throw new HttpError(404, "Category not found.");
    const oldName = category.name;
    if (request.body?.name !== undefined) {
      category.name = String(request.body.name).trim();
      category.slug = slugify(category.name);
    }
    if (request.body?.description !== undefined) category.description = String(request.body.description).trim();
    if (request.body?.image !== undefined) category.image = String(request.body.image).trim();
    if (request.body?.isActive !== undefined) category.isActive = Boolean(request.body.isActive);
    if (request.body?.sortOrder !== undefined) category.sortOrder = Number(request.body.sortOrder) || 0;
    await category.save();
    let updatedProducts = 0;
    if (oldName !== category.name) {
      const result = await Product.updateMany({ category: oldName }, { category: category.name });
      updatedProducts = result.modifiedCount;
    }
    response.json({ success: true, message: "Category updated.", data: { category, updatedProducts } });
  })
);

router.delete(
  "/categories/:id",
  asyncHandler(async (request, response) => {
    const category = await Category.findById(request.params.id);
    if (!category) throw new HttpError(404, "Category not found.");
    const count = await Product.countDocuments({ category: category.name });
    const reassignTo = String(request.body?.reassignTo || "").trim();
    if (count && !reassignTo) throw new HttpError(409, "Choose another category for the products before deleting this category.");
    if (count) await Product.updateMany({ category: category.name }, { category: reassignTo });
    await category.deleteOne();
    response.json({ success: true, message: "Category deleted." });
  })
);

export default router;
