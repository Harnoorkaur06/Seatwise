const jwt = require("jsonwebtoken");
const User = require("../models/User");

const JWT_SECRET = process.env.JWT_SECRET || "seatwise-dev-secret-key-2026-eval";

if (process.env.NODE_ENV === "production" && (!process.env.JWT_SECRET || process.env.JWT_SECRET === "seatwise-dev-secret-key-2026-eval")) {
  throw new Error("Security Error: JWT_SECRET must be configured with a secure value in production.");
}

async function verifyToken(token) {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (err) {
    return null;
  }
}

function extractToken(req) {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith("Bearer ")) {
    return authHeader.substring(7).trim();
  }
  if (req.headers["x-access-token"]) {
    return req.headers["x-access-token"];
  }
  if (req.cookies && req.cookies.token) {
    return req.cookies.token;
  }
  return null;
}

async function requireAuth(req, res, next) {
  try {
    const token = extractToken(req);
    if (!token) {
      return res.status(401).json({ ok: false, message: "Authentication required. Please sign in." });
    }

    const decoded = await verifyToken(token);
    if (!decoded) {
      return res.status(401).json({ ok: false, message: "Invalid or expired session. Please sign in again." });
    }

    // Look up user to ensure they are active and not disabled
    const user = await User.findOne({ id: decoded.id });
    if (!user) {
      return res.status(401).json({ ok: false, message: "User account no longer exists." });
    }

    if (user.disabled === true) {
      return res.status(403).json({ ok: false, message: "Account is disabled. Please contact administrator." });
    }

    req.user = user;
    next();
  } catch (err) {
    console.error("Auth middleware error:", err);
    return res.status(500).json({ ok: false, message: "Internal authentication error." });
  }
}

async function requireAdmin(req, res, next) {
  await requireAuth(req, res, () => {
    if (!req.user || req.user.role !== "admin") {
      return res.status(403).json({ ok: false, message: "Access forbidden: Administrator privileges required." });
    }
    next();
  });
}

async function requireStudent(req, res, next) {
  await requireAuth(req, res, () => {
    if (!req.user || req.user.role !== "student") {
      return res.status(403).json({ ok: false, message: "Access forbidden: Student privileges required." });
    }
    next();
  });
}

async function optionalAuth(req, res, next) {
  try {
    const token = extractToken(req);
    if (token) {
      const decoded = await verifyToken(token);
      if (decoded) {
        const user = await User.findOne({ id: decoded.id });
        if (user && !user.disabled) {
          req.user = user;
        }
      }
    }
    next();
  } catch (err) {
    next();
  }
}

function generateToken(user) {
  return jwt.sign(
    {
      id: user.id,
      email: user.email,
      role: user.role,
      name: user.name,
      rollNo: user.rollNo,
    },
    JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || "7d" }
  );
}

module.exports = {
  requireAuth,
  requireAdmin,
  requireStudent,
  optionalAuth,
  generateToken,
  verifyToken,
};
