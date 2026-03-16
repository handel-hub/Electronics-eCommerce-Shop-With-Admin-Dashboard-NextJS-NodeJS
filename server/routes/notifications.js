const express = require('express');
const router = express.Router();
const { getUserNotifications, createNotification, updateNotification, bulkMarkAsRead, deleteNotification, bulkDeleteNotifications, getUnreadCount } = require('../controllers/notificationController');
const { userLimiter, adminLimiter } = require('../middleware/rateLimiter');
const { authenticate, requireAdmin } = require('../middleware/auth');

// Specific before generic
router.post('/mark-read', userLimiter, authenticate, bulkMarkAsRead);
router.delete('/bulk', userLimiter, authenticate,requireAdmin, bulkDeleteNotifications);

router.get('/:userId/unread-count', userLimiter, authenticate, getUnreadCount);
router.get('/:userId', userLimiter, authenticate, getUserNotifications);
router.post('/', adminLimiter, authenticate, requireAdmin, createNotification);
router.put('/:id', userLimiter, authenticate, updateNotification);
router.delete('/:id', userLimiter, authenticate, deleteNotification);

module.exports = router;