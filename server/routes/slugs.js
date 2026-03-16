const express = require("express");
const router = express.Router();
const { getProductBySlug } = require("../controllers/slugs");
const { browseLimiter } = require('../middleware/rateLimiter');

router.route("/:slug").get(browseLimiter, getProductBySlug); 

module.exports = router;