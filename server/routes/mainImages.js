const express = require("express");
const router = express.Router();
const { uploadMainImage } = require("../controllers/mainImages");
const { uploadLimiter } = require('../middleware/rateLimiter');
const { authenticate, requireAdmin } = require('../middleware/auth');

router.route("/").post(uploadLimiter, authenticate, requireAdmin, uploadMainImage);

module.exports = router;