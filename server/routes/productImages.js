const express = require('express');
const router = express.Router();
const { getSingleProductImages, createImage, updateImage, deleteImage } = require('../controllers/productImages');
const { browseLimiter, uploadLimiter, adminLimiter } = require('../middleware/rateLimiter');
const { authenticate, requireAdmin } = require('../middleware/auth');

router.route('/')
  .post(uploadLimiter, authenticate, requireAdmin, createImage);

router.route('/:id')
  .get(browseLimiter, getSingleProductImages)                               // public
  .put(uploadLimiter, authenticate, requireAdmin, updateImage)
  .delete(adminLimiter, authenticate, requireAdmin, deleteImage);

module.exports = router;
