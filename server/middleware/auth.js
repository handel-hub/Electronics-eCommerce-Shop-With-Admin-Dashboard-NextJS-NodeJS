/* const jwt = require('jsonwebtoken');
const { AppError } = require('../utills/errorHandler');

// Fail fast if secret is missing
const NEXTAUTH_SECRET = process.env.NEXTAUTH_SECRET;
if (!NEXTAUTH_SECRET) {
    throw new Error('NEXTAUTH_SECRET is not set — check your .env file');
}

const authenticate = (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
        throw new AppError('Authentication required', 401);
        }

        const token = authHeader.split(' ')[1];
        const decoded = jwt.verify(token, NEXTAUTH_SECRET); // ← use constant

        if (!decoded || !decoded.id) {
        throw new AppError('Session expired, please login again', 401);
        }

        req.user = {
        id: decoded.id,
        role: decoded.role,
        };

        next();
    } catch (error) {
        if (error instanceof AppError) {
        return res.status(error.statusCode).json({ error: error.message });
        }
        if (error.name === 'JsonWebTokenError') {
        return res.status(401).json({ error: 'Invalid token' });
        }
        if (error.name === 'TokenExpiredError') {
        return res.status(401).json({ error: 'Session expired, please login again' });
        }
        return res.status(500).json({ error: 'Authentication error' });
    }
};

const requireAdmin = (req, res, next) => {
    if (!req.user) {
        return res.status(401).json({ error: 'Authentication required' });
    }
    if (req.user.role !== 'admin') {
        return res.status(403).json({ error: 'Admin access required' });
    }
    next();
};

module.exports = { authenticate, requireAdmin };
 */
const jwt = require('jsonwebtoken');

const NEXTAUTH_SECRET = process.env.NEXTAUTH_SECRET;
if (!NEXTAUTH_SECRET) {
    throw new Error('NEXTAUTH_SECRET is not set — check your .env file');
}

const authenticate = (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Authentication required' });
        }

        const token = authHeader.split(' ')[1];
        const decoded = jwt.verify(token, NEXTAUTH_SECRET);

        if (!decoded || !decoded.id) {
        return res.status(401).json({ error: 'Invalid token payload' });
        }

        req.user = {
        id: decoded.id,
        role: decoded.role ?? 'user',
        };

        next();
    } catch (error) {
        if (error.name === 'JsonWebTokenError') {
        return res.status(401).json({ error: 'Invalid token' });
        }
        if (error.name === 'TokenExpiredError') {
        return res.status(401).json({ error: 'Session expired, please login again' });
        }
        return res.status(500).json({ error: 'Authentication error' });
    }
};

const requireAdmin = (req, res, next) => {
    if (!req.user) {
        return res.status(401).json({ error: 'Authentication required' });
    }
    if (req.user.role !== 'admin') {
        return res.status(403).json({ error: 'Admin access required' });
    }
    next();
};

module.exports = { authenticate, requireAdmin };