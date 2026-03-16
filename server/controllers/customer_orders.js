const prisma = require("../utills/db");
const { asyncHandler, AppError } = require("../utills/errorHandler");
const { validateOrderData } = require('../utills/validation');
const { createOrderUpdateNotification } = require('../utills/notificationHelpers');

const ALLOWED_ORDER_STATUSES = ['PENDING', 'PAID', 'PROCESSING', 'SHIPPED', 'DELIVERED', 'CANCELLED', 'REFUNDED'];

const createCustomerOrder = asyncHandler(async (request, response) => {
  if (!request.body || typeof request.body !== 'object') {
    throw new AppError("Invalid request body", 400);
  }

  const validation = validateOrderData(request.body);

  if (!validation.isValid) {
    return response.status(400).json({
      error: "Validation failed",
      details: validation.errors
    });
  }

  const validatedData = validation.validatedData;

  if (validatedData.total < 0.01) {
    return response.status(400).json({
      error: "Invalid order total",
      details: [{ field: 'total', message: 'Order total must be at least $0.01' }]
    });
  }

  const oneMinuteAgo = new Date(Date.now() - 60 * 1000);
  const duplicateOrder = await prisma.customer_order.findFirst({
    where: {
      email: validatedData.email,
      total: validatedData.total,
      dateTime: { gte: oneMinuteAgo }
    }
  });

  if (duplicateOrder) {
    return response.status(409).json({
      error: "Duplicate order detected",
      details: "An identical order was just created. Please wait a moment before trying again."
    });
  }

  const corder = await prisma.customer_order.create({
    data: {
      name: validatedData.name,
      lastname: validatedData.lastname,
      phone: validatedData.phone,
      email: validatedData.email,
      company: validatedData.company ?? '',
      address: validatedData.address,
      apartment: validatedData.apartment,
      postalCode: validatedData.postalCode,
      status: validatedData.status,
      city: validatedData.city,
      country: validatedData.country,
      orderNotice: validatedData.orderNotice,
      total: validatedData.total,
      totalKobo: Math.round(validatedData.total * 100),
      dateTime: new Date()
    },
  });

  // Notify user if they have an account — failure does not fail the order
  try {
    let user = null;

    if (request.body.userId) {
      user = await prisma.user.findUnique({ where: { id: request.body.userId } });
    }

    if (!user) {
      user = await prisma.user.findUnique({ where: { email: validatedData.email } });
    }

    if (user) {
      await createOrderUpdateNotification(user.id, 'confirmed', corder.id, validatedData.total);
    }
  } catch (notificationError) {
    console.error('Failed to create order notification:', notificationError);
  }

  return response.status(201).json({
    id: corder.id,
    message: "Order created successfully",
    orderNumber: corder.id
  });
});

const updateCustomerOrder = asyncHandler(async (request, response) => {
  const { id } = request.params;

  if (!id || typeof id !== 'string') {
    throw new AppError("Order ID is required", 400);
  }

  if (!request.body || typeof request.body !== 'object') {
    throw new AppError("Invalid request body", 400);
  }

  const { status } = request.body;

  if (!status || typeof status !== 'string') {
    return response.status(400).json({
      error: "Validation failed",
      details: [{ field: 'status', message: 'status is required' }]
    });
  }

  if (!ALLOWED_ORDER_STATUSES.includes(status)) {
    return response.status(400).json({
      error: "Validation failed",
      details: [{ field: 'status', message: `status must be one of: ${ALLOWED_ORDER_STATUSES.join(', ')}` }]
    });
  }

  const existingOrder = await prisma.customer_order.findUnique({ where: { id } });

  if (!existingOrder) {
    throw new AppError("Order not found", 404);
  }

  const updatedOrder = await prisma.customer_order.update({
    where: { id },
    data: { status }
  });

  // Fire notification if status changed — failure does not fail the update
  if (existingOrder.status !== status) {
    try {
      const user = await prisma.user.findUnique({ where: { email: existingOrder.email } });
      if (user) {
        await createOrderUpdateNotification(user.id, status, updatedOrder.id, existingOrder.total);
      }
    } catch (notificationError) {
      console.error('Failed to create status update notification:', notificationError);
    }
  }

  return response.status(200).json(updatedOrder);
});

const deleteCustomerOrder = asyncHandler(async (request, response) => {
  const { id } = request.params;

  if (!id || typeof id !== 'string') {
    throw new AppError("Order ID is required", 400);
  }

  const existingOrder = await prisma.customer_order.findUnique({ where: { id } });

  if (!existingOrder) {
    throw new AppError("Order not found", 404);
  }

  await prisma.customer_order.delete({ where: { id } });

  return response.status(204).send();
});

const getCustomerOrder = asyncHandler(async (request, response) => {
  const { id } = request.params;

  if (!id || typeof id !== 'string') {
    throw new AppError("Order ID is required", 400);
  }

  const order = await prisma.customer_order.findUnique({ where: { id } });

  if (!order) {
    throw new AppError("Order not found", 404);
  }

  return response.status(200).json(order);
});

const getAllOrders = asyncHandler(async (request, response) => {
  const page = parseInt(request.query.page) || 1;
  const limit = parseInt(request.query.limit) || 50;
  const offset = (page - 1) * limit;

  if (page < 1 || limit < 1 || limit > 100) {
    throw new AppError("Page must be >= 1, limit must be between 1 and 100", 400);
  }

  const [orders, totalCount] = await Promise.all([
    prisma.customer_order.findMany({
      skip: offset,
      take: limit,
      orderBy: { dateTime: 'desc' }
    }),
    prisma.customer_order.count()
  ]);

  return response.json({
    orders,
    pagination: {
      page,
      limit,
      total: totalCount,
      totalPages: Math.ceil(totalCount / limit)
    }
  });
});

module.exports = {
  createCustomerOrder,
  updateCustomerOrder,
  deleteCustomerOrder,
  getCustomerOrder,
  getAllOrders,
};