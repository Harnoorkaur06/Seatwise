const path = require("path");
require("dotenv").config({ path: path.join(__dirname, ".env") });
const express = require("express");
const cors = require("cors");
const { connectDB } = require("./utils/db");
const User = require("./models/User");
const Room = require("./models/Room");
const Exam = require("./models/Exam");
const Activity = require("./models/Activity");

const mongoose = require("mongoose");

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json({ limit: "15mb" }));
app.use(express.urlencoded({ extended: true, limit: "15mb" }));

// Public Health Check & Status Endpoints
app.get(["/health", "/api/health"], (req, res) => {
  const isDbReady = mongoose.connection.readyState === 1;
  res.status(isDbReady ? 200 : 503).json({
    ok: isDbReady,
    status: isDbReady ? "healthy" : "unhealthy",
    database: isDbReady ? "connected" : "disconnected",
    timestamp: new Date().toISOString(),
    uptime: Math.floor(process.uptime()),
  });
});

app.get("/api", (req, res) => {
  const isDbReady = mongoose.connection.readyState === 1;
  res.json({
    ok: true,
    name: "SEATWISE API Platform",
    status: "online",
    database: isDbReady ? "connected" : "disconnected",
    documentation: "SEATWISE Smart Seating & Examination Management REST API",
    authentication: {
      instructions: "Protected endpoints require header: 'Authorization: Bearer <token>'",
      adminLogin: "POST /api/auth/admin-login (body: { username, password })",
      studentLogin: "POST /api/auth/login (body: { email or rollNo, password })"
    },
    endpoints: {
      health: "GET /api/health",
      auth: {
        adminLogin: "POST /api/auth/admin-login",
        studentLogin: "POST /api/auth/login",
        setupPassword: "POST /api/auth/setup-password",
        currentUser: "GET /api/auth/me"
      },
      students: "GET /api/students, POST /api/students, PUT /api/students/:idOrRoll, DELETE /api/students/:idOrRoll",
      rooms: "GET /api/rooms, POST /api/rooms, PUT /api/rooms/:roomNumber, DELETE /api/rooms/:roomNumber",
      exams: "GET /api/exams, GET /api/exams/active, POST /api/exams, PUT /api/exams/:id, DELETE /api/exams/:id",
      seating: "GET /api/seating, POST /api/seating/generate, POST /api/seating/regenerate, POST /api/seating/override",
      complaints: "GET /api/complaints, POST /api/complaints, PUT /api/complaints/:id",
      system: "GET /api/system/stats, POST /api/system/seed, POST /api/system/purge",
      migrate: "POST /api/migrate/import-browser-data"
    }
  });
});

// Mount API Routes
app.use("/api/auth", require("./routes/auth"));
app.use("/api/students", require("./routes/students"));
app.use("/api/rooms", require("./routes/rooms"));
app.use("/api/exams", require("./routes/exams"));
app.use("/api/seating", require("./routes/seating"));
app.use("/api/complaints", require("./routes/complaints"));
app.use("/api/activity", require("./routes/activity"));
app.use("/api/system", require("./routes/system"));
app.use("/api/migrate", require("./routes/migrate"));

// Serve static frontend files
const frontendDir = path.join(__dirname, "../frontend");
app.use(express.static(frontendDir));

// Root fallback for SPA / HTML navigation
app.get("/", (req, res) => {
  res.sendFile(path.join(frontendDir, "index.html"));
});

// Central error handler
app.use((err, req, res, next) => {
  console.error("Unhandled server error:", err);
  res.status(err.status || 500).json({
    ok: false,
    message: err.message || "Internal server error occurred.",
  });
});

/**
 * Ensure baseline administrator exists if no admin account is present
 */
async function ensureAdminExists() {
  try {
    const adminExists = await User.findOne({ role: "admin" });
    if (!adminExists) {
      const admin = new User({
        id: "admin",
        name: "Administrator",
        email: "admin@seatwise.local",
        role: "admin",
        password: process.env.ADMIN_PASSWORD || "seatwise@admin123",
        passwordSet: true,
      });
      await admin.save();
      console.log("✓ Administrator account provisioned");
    }
  } catch (err) {
    console.error("Admin account provisioning notice:", err.message);
  }
}

const { seedBaselineData } = require("./scripts/seed");

// Start server function
async function startServer() {
  try {
    await connectDB();
    await ensureAdminExists();
    if (process.env.NODE_ENV !== "production") {
      await seedBaselineData();
    }

    const server = app.listen(PORT, "0.0.0.0", () => {
      console.log(`=======================================================`);
      console.log(`🎓 SEATWISE Examination Platform Active`);
      console.log(`📡 URL: http://localhost:${PORT}`);
      console.log(`ℹ Environment: ${process.env.NODE_ENV || "development"}`);
      console.log(`=======================================================`);
    });

    return server;
  } catch (err) {
    console.error("FATAL: Failed to start server:", err);
    process.exit(1);
  }
}

if (require.main === module) {
  startServer();
}

module.exports = { app, startServer };
