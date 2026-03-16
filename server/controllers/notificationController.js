const prisma = require("../utills/db");
const { asyncHandler, AppError } = require("../utills/errorHandler");

const VALID_TYPES = ['ORDER_UPDATE', 'PAYMENT_STATUS', 'PROMOTION', 'SYSTEM_ALERT'];
const VALID_PRIORITIES = ['LOW', 'NORMAL', 'HIGH', 'URGENT'];

const getUserNotifications = asyncHandler(async (req, res) => {
  const { userId } = req.params;

  if (req.user.id !== userId && req.user.role !== 'admin') {
    throw new AppError('Access denied', 403);
  }

  const {
    type,
    isRead,
    search,
    page = 1,
    limit = 10,
    sortBy = 'createdAt',
    sortOrder = 'desc'
  } = req.query;

  const where = {
    userId,
    ...(type && { type }),
    ...(isRead !== undefined && { isRead: isRead === 'true' }),
    ...(search && {
      OR: [
        { title: { contains: search, mode: 'insensitive' } },
        { message: { contains: search, mode: 'insensitive' } }
      ]
    })
  };

  const skip = (parseInt(page) - 1) * parseInt(limit);
  const take = parseInt(limit);

  const orderBy = {};
  if (sortBy === 'priority') {
    orderBy.priority = sortOrder;
    orderBy.createdAt = 'desc';
  } else {
    orderBy[sortBy] = sortOrder;
  }

  const [notifications, total, unreadCount] = await Promise.all([
    prisma.notification.findMany({ where, orderBy, skip, take }),
    prisma.notification.count({ where }),
    prisma.notification.count({ where: { userId, isRead: false } })
  ]);

  const totalPages = Math.ceil(total / take);

  res.json({
    notifications,
    total,
    page: parseInt(page),
    totalPages,
    unreadCount
  });
});

const createNotification = asyncHandler(async (req, res) => {
  const { userId, title, message, type, priority = 'NORMAL', metadata } = req.body;

  if (!userId || !title || !message || !type) {
    throw new AppError('Missing required fields: userId, title, message, type', 400);
  }

  if (!VALID_TYPES.includes(type)) {
    throw new AppError('Invalid notification type', 400);
  }

  if (!VALID_PRIORITIES.includes(priority)) {
    throw new AppError('Invalid notification priority', 400);
  }

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) {
    throw new AppError('User not found', 404);
  }

  const notification = await prisma.notification.create({
    data: { userId, title, message, type, priority, metadata }
  });

  res.status(201).json(notification);
});

const updateNotification = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { isRead, userId } = req.body;

  if (typeof isRead !== 'boolean') {
    throw new AppError('isRead must be a boolean value', 400);
  }

  const existing = await prisma.notification.findFirst({
    where: { id, userId }
  });

  if (!existing) {
    throw new AppError('Notification not found', 404);
  }

  const notification = await prisma.notification.update({
    where: { id },
    data: { isRead }
  });

  res.json(notification);
});

const bulkMarkAsRead = asyncHandler(async (req, res) => {
  const { notificationIds, userId } = req.body;

  if (!Array.isArray(notificationIds) || notificationIds.length === 0) {
    throw new AppError('notificationIds must be a non-empty array', 400);
  }

  if (!userId) {
    throw new AppError('userId is required', 400);
  }

  const updateResult = await prisma.notification.updateMany({
    where: {
      id: { in: notificationIds },
      userId
    },
    data: { isRead: true }
  });

  res.json({
    message: `${updateResult.count} notifications marked as read`,
    updatedCount: updateResult.count
  });
});

const deleteNotification = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { userId } = req.body;

  const notification = await prisma.notification.findFirst({
    where: { id, userId }
  });

  if (!notification) {
    throw new AppError('Notification not found', 404);
  }

  await prisma.notification.delete({ where: { id } });

  res.json({ message: 'Notification deleted successfully' });
});

const bulkDeleteNotifications = asyncHandler(async (req, res) => {
  const { notificationIds, userId } = req.body;

  if (!Array.isArray(notificationIds) || notificationIds.length === 0) {
    throw new AppError('notificationIds must be a non-empty array', 400);
  }

  if (!userId) {
    throw new AppError('userId is required', 400);
  }

  const deleteResult = await prisma.notification.deleteMany({
    where: {
      id: { in: notificationIds },
      userId
    }
  });

  res.json({
    message: `${deleteResult.count} notifications deleted`,
    deletedCount: deleteResult.count
  });
});

const getUnreadCount = asyncHandler(async (req, res) => {
  const { userId } = req.params;

  if (req.user.id !== userId && req.user.role !== 'admin') {
    throw new AppError('Access denied', 403);
  }

  const unreadCount = await prisma.notification.count({
    where: { userId, isRead: false }
  });

  res.json({ unreadCount });
});

module.exports = {
  getUserNotifications,
  createNotification,
  updateNotification,
  bulkMarkAsRead,
  deleteNotification,
  bulkDeleteNotifications,
  getUnreadCount
};