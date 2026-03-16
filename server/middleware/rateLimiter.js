// middleware/rateLimiter.js

const {rateLimit,ipKeyGenerator} = require('express-rate-limit');

// 1. General baseline — all routes
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  keyGenerator: (req) => ipKeyGenerator(req),
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => res.status(429).json({
    error: 'Too many requests, please try again later.',
    retryAfter: '15 minutes'
  })
});

// 2. Browse — public read operations
const browseLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 60,
  keyGenerator: (req) => ipKeyGenerator(req),
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => res.status(429).json({
    error: 'Too many requests, please try again later.',
    retryAfter: '15 minutes'
  })
});

// 3. Search — expensive DB operation
const searchLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: 30,
  keyGenerator: (req) => ipKeyGenerator(req),
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => res.status(429).json({
    error: 'Too many search requests, please try again later.',
    retryAfter: '1 minute'
  })
});

// 4. Register — account creation (IP + email)
const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 3,
  keyGenerator: (req) => {
    const email = req.body?.email?.toLowerCase().trim() || '';
    return `${ipKeyGenerator(req)}:${email}`;
  },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => res.status(429).json({
    error: 'Too many registration attempts, please try again later.',
    retryAfter: '1 hour'
  })
});

// 5. Auth — email lookup / login (IP + email)
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  skipSuccessfulRequests: true,
  keyGenerator: (req) => {
    const email = req.params?.email?.toLowerCase().trim() || '';
    return `${ipKeyGenerator(req)}:${email}`;
  },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => res.status(429).json({
    error: 'Too many authentication attempts, please try again later.',
    retryAfter: '15 minutes'
  })
});

// 6. Password reset (IP + email)
const passwordResetLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 3,
  keyGenerator: (req) => {
    const email = req.body?.email?.toLowerCase().trim() || '';
    return `${ipKeyGenerator(req)}:${email}`;
  },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => res.status(429).json({
    error: 'Too many password reset attempts, please try again later.',
    retryAfter: '1 hour'
  })
});

// 7. Order — checkout (IP + email)
const orderLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  keyGenerator: (req) => {
    const email = req.body?.email?.toLowerCase().trim() || '';
    return `${ipKeyGenerator(req)}:${email}`;
  },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => res.status(429).json({
    error: 'Too many order attempts, please try again later.',
    retryAfter: '15 minutes'
  })
});

// 8. Upload — file uploads
const uploadLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  keyGenerator: (req) => ipKeyGenerator(req),
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => res.status(429).json({
    error: 'Too many upload requests, please try again later.',
    retryAfter: '15 minutes'
  })
});

// 9. User — authenticated user actions
const userLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  keyGenerator: (req) => ipKeyGenerator(req),
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => res.status(429).json({
    error: 'Too many requests, please try again later.',
    retryAfter: '15 minutes'
  })
});

// 10. Admin — admin panel operations
const adminLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  keyGenerator: (req) => ipKeyGenerator(req),
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => res.status(429).json({
    error: 'Too many admin operations, please try again later.',
    retryAfter: '15 minutes'
  })
});

// 11. Wishlist — for when wishlist is built
const wishlistLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 40,
  keyGenerator: (req) => ipKeyGenerator(req),
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => res.status(429).json({
    error: 'Too many wishlist operations, please try again later.',
    retryAfter: '5 minutes'
  })
});

// 12. Dynamic — create custom limiter on the fly
const createDynamicLimiter = (windowMs, max, message) => {
  return rateLimit({
    windowMs,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req, res) => res.status(429).json({
      error: message,
      retryAfter: `${Math.ceil(windowMs / 60000)} minutes`
    })
  });
};

module.exports = {
  generalLimiter,
  browseLimiter,
  searchLimiter,
  registerLimiter,
  authLimiter,
  passwordResetLimiter,
  orderLimiter,
  uploadLimiter,
  userLimiter,
  adminLimiter,
  wishlistLimiter,
  createDynamicLimiter,
};
