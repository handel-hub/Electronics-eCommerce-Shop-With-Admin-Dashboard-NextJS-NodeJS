const express = require("express");
const router = express.Router();
const { searchProducts } = require("../controllers/search");
const { searchLimiter } = require('../middleware/rateLimiter');

router.route("/").get(searchLimiter, searchProducts);  

module.exports = router;