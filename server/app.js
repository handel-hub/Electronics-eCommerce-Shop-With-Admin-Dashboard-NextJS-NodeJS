const express = require("express");
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const cron = require('node-cron');

const fileUpload = require("express-fileupload");
const productsRouter = require("./routes/products");
const productImagesRouter = require("./routes/productImages");
const categoryRouter = require("./routes/category");
const searchRouter = require("./routes/search");
const mainImageRouter = require("./routes/mainImages");
const userRouter = require("./routes/users");
const orderRouter = require("./routes/customer_orders");
const slugRouter = require("./routes/slugs");
const orderProductRouter = require('./routes/customer_order_product');
const notificationsRouter = require('./routes/notifications');
const merchantRouter = require('./routes/merchant');
const bulkUploadRouter = require('./routes/bulkUpload');
const paymentsRouter = require('./routes/payments');
const { runWebhookProcessor } = require('./controllers/webhookProcessor');
const { runCleanupJob } = require('./controllers/cleanupJob');
const { runRefundJob } = require('./controllers/refundJob');
var cors = require("cors");

const { addRequestId, requestLogger, errorLogger, securityLogger } = require('./middleware/requestLogger');
const { generalLimiter } = require('./middleware/rateLimiter');
const { handleServerError } = require('./utills/errorHandler');

const app = express();

app.set('trust proxy', 1);

app.use(addRequestId);
app.use(securityLogger);
app.use(requestLogger);
app.use(errorLogger);

const allowedOrigins = [
  'http://localhost:3000',
  'http://localhost:3001',
  process.env.NEXTAUTH_URL,
  process.env.FRONTEND_URL,
].filter(Boolean);

const corsOptions = {
  origin: function (origin, callback) {
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin)) return callback(null, true);
    if (process.env.NODE_ENV === 'development' && origin.startsWith('http://localhost:')) {
      return callback(null, true);
    }
    const msg = 'The CORS policy for this site does not allow access from the specified Origin.';
    return callback(new Error(msg), false);
  },
  methods: ["GET", "POST", "PUT", "DELETE"],
  allowedHeaders: ["Content-Type", "Authorization"],
  credentials: true,
};

// Baseline rate limit for all routes
app.use(generalLimiter);

app.use(express.json());
app.use(cors(corsOptions));
app.use(fileUpload());

// Routes — individual limiters applied per route method inside each router file
app.use("/api/products", productsRouter);
app.use("/api/categories", categoryRouter);
app.use("/api/images", productImagesRouter);
app.use("/api/main-image", mainImageRouter);
app.use("/api/users", userRouter);
app.use("/api/search", searchRouter);
app.use("/api/orders", orderRouter);
app.use('/api/order-product', orderProductRouter);
app.use("/api/slugs", slugRouter);
app.use("/api/notifications", notificationsRouter);
app.use("/api/merchants", merchantRouter);
app.use("/api/bulk-upload", bulkUploadRouter);
// app.use("/api/wishlist", wishlistRouter);
app.use('/api/payments', paymentsRouter);
// Health check — no rate limiting
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    rateLimiting: 'enabled',
    requestId: req.reqId
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    error: 'Route not found',
    requestId: req.reqId
  });
});

// Global error handler
app.use((err, req, res, next) => {
  handleServerError(err, res, `${req.method} ${req.path}`);
});

if (require.main === module) {

  cron.schedule('*/30 * * * * *', runWebhookProcessor); // every 30 seconds
  cron.schedule('*/15 * * * *', runCleanupJob);          // every 15 minutes
  cron.schedule('0 * * * *', runRefundJob); 

  const PORT = process.env.PORT || 3001;
  app.listen(PORT, () => {

  });
}

module.exports = app;



