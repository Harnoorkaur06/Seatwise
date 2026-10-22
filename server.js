require("dotenv").config();
const express = require("express");
const path = require("path");
const cors = require("cors");
const { connectDB } = require("./utils/db");
const User = require("./models/User");
const Room = require("./models/Room");
const Exam = require("./models/Exam");
const Activity = require("./models/Activity");

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json({ limit: "15mb" }));
app.use(express.urlencoded({ extended: true, limit: "15mb" }));

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
app.use(express.static(path.join(__dirname)));

// Root fallback for SPA / HTML navigation
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
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

    const server = app.listen(PORT, () => {
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
