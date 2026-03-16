const express = require('express');
const router = express.Router();
const { getUser, createUser, updateUser, deleteUser, getAllUsers, getUserByEmail } = require('../controllers/users');
const { registerLimiter, authLimiter, adminLimiter } = require('../middleware/rateLimiter');
const { authenticate, requireAdmin } = require('../middleware/auth');


router.route('/email/:email')
  .get(authLimiter, authenticate, requireAdmin, getUserByEmail);

router.route('/')
  .get(adminLimiter, authenticate, requireAdmin, getAllUsers)
  .post(registerLimiter, createUser);                          // public — customer registration

router.route('/:id')
  .get(adminLimiter, authenticate, requireAdmin, getUser)
  .put(adminLimiter, authenticate, requireAdmin, updateUser)
  .delete(adminLimiter, authenticate, requireAdmin, deleteUser);

module.exports = router;