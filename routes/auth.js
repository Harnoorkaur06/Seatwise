const express = require("express");
const router = express.Router();
const User = require("../models/User");
const Activity = require("../models/Activity");
const { generateToken, requireAuth, optionalAuth } = require("../middleware/auth");

const ADMIN_USERNAME = process.env.ADMIN_USERNAME || "admin";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "seatwise@admin123";
const ADMIN_ALT_PASSWORD = process.env.ADMIN_ALT_PASSWORD || "examseat@admin123";

/**
 * POST /api/auth/admin-login
 * Administrator authentication
 */
router.post("/admin-login", async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ ok: false, message: "Username and password are required." });
    }

    const cleanUsername = String(username).trim();
    let admin = await User.findOne({
      role: "admin",
      $or: [{ id: cleanUsername }, { email: cleanUsername.toLowerCase() }],
    });

    if (!admin && cleanUsername === ADMIN_USERNAME) {
      admin = await User.findOne({ role: "admin" });
    }

    if (!admin) {
      const anyAdmin = await User.findOne({ role: "admin" });
      if (!anyAdmin && cleanUsername === ADMIN_USERNAME) {
        admin = new User({
          id: "admin",
          name: "Administrator",
          email: "admin@seatwise.local",
          role: "admin",
          password: ADMIN_PASSWORD,
          passwordSet: true,
        });
        await admin.save();
      }
    }

    if (!admin) {
      return res.status(401).json({ ok: false, message: "Invalid admin credentials." });
    }

    const isMatch = await admin.comparePassword(password);
    if (!isMatch) {
      return res.status(401).json({ ok: false, message: "Invalid admin credentials." });
    }

    const token = generateToken(admin);
    await Activity.create({ message: "Administrator logged in" });

    return res.json({
      ok: true,
      message: "Welcome back, Administrator.",
      token,
      user: admin.toSafeObject(),
    });
  } catch (err) {
    console.error("Admin login error:", err);
    return res.status(500).json({ ok: false, message: "Server error during login." });
  }
});

/**
 * POST /api/auth/login
 * Student login by email OR roll number
 */
router.post("/login", async (req, res) => {
  try {
    const { email, rollNo, password } = req.body;
    const rawEmail = (email || "").toString().trim().toLowerCase();
    const rawRollNo = (rollNo || "").toString().trim().toUpperCase();
    const inputIdent = (email || rollNo || "").toString().trim();

    if (!rawEmail && !rawRollNo && !inputIdent) {
      return res.status(400).json({ ok: false, message: "Please enter your email or roll number." });
    }

    if (!password) {
      return res.status(400).json({ ok: false, message: "Please enter your password." });
    }

    // Flexible query across email and rollNo
    const query = {
      role: "student",
      $or: [],
    };

    if (rawEmail) query.$or.push({ email: rawEmail });
    if (rawRollNo) query.$or.push({ rollNo: rawRollNo });
    if (inputIdent) {
      query.$or.push({ email: inputIdent.toLowerCase() });
      query.$or.push({ rollNo: inputIdent.toUpperCase() });
    }

    const student = await User.findOne(query);

    if (!student) {
      return res.status(401).json({
        ok: false,
        message: "Invalid credentials. Please verify your email or roll number.",
      });
    }

    if (student.disabled === true) {
      return res.status(403).json({
        ok: false,
        message: "Your account is temporarily disabled. Please contact the administrator.",
      });
    }

    if (!student.password || student.passwordSet === false) {
      return res.status(400).json({
        ok: false,
        message: "Please set up your password first using the link below.",
      });
    }

    const isMatch = await student.comparePassword(password);
    if (!isMatch) {
      return res.status(401).json({
        ok: false,
        message: "Invalid credentials. Please try again.",
      });
    }

    const token = generateToken(student);
    await Activity.create({ message: `Student logged in: ${student.name} (${student.rollNo})` });

    return res.json({
      ok: true,
      message: "Login successful. Redirecting...",
      token,
      user: student.toSafeObject(),
    });
  } catch (err) {
    console.error("Student login error:", err);
    return res.status(500).json({ ok: false, message: "Server error during login." });
  }
});

/**
 * POST /api/auth/setup-password
 * First-time password setup for students
 */
router.post("/setup-password", async (req, res) => {
  try {
    const { identifier, newPassword, confirmPassword } = req.body;
    const targetKey = (identifier || "").trim();

    if (!targetKey) {
      return res.status(400).json({ ok: false, message: "Please enter your email or roll number." });
    }

    if (!newPassword || !confirmPassword) {
      return res.status(400).json({ ok: false, message: "Please enter and confirm your new password." });
    }

    if (newPassword !== confirmPassword) {
      return res.status(400).json({ ok: false, message: "Passwords do not match." });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({ ok: false, message: "Password must contain at least 6 characters." });
    }

    const student = await User.findOne({
      role: "student",
      $or: [
        { email: targetKey.toLowerCase() },
        { rollNo: targetKey.toUpperCase() },
      ],
    });

    if (!student) {
      return res.status(404).json({
        ok: false,
        message: "Student record not found for this email or roll number. Please contact your examination administrator to be registered.",
      });
    }

    if (student.disabled === true) {
      return res.status(403).json({
        ok: false,
        message: "Your account is temporarily disabled. Please contact the administrator.",
      });
    }

    student.password = newPassword;
    student.passwordSet = true;
    await student.save();

    await Activity.create({ message: `Password set up successfully by student: ${student.name} (${student.rollNo})` });

    return res.json({
      ok: true,
      message: "Password set successfully. You can now sign in.",
    });
  } catch (err) {
    console.error("Setup password error:", err);
    return res.status(500).json({ ok: false, message: "Server error setting password." });
  }
});

/**
 * POST /api/auth/update-password
 * Update password while logged in
 */
router.post("/update-password", requireAuth, async (req, res) => {
  try {
    const { currentPassword, newPassword, confirmPassword } = req.body;
    if (!currentPassword) {
      return res.status(400).json({ ok: false, message: "Current password is required." });
    }

    if (!newPassword || !confirmPassword) {
      return res.status(400).json({ ok: false, message: "Please provide both new password and confirmation." });
    }

    if (newPassword !== confirmPassword) {
      return res.status(400).json({ ok: false, message: "New passwords do not match." });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({ ok: false, message: "Password must be at least 6 characters." });
    }

    const user = await User.findOne({ id: req.user.id });
    if (!user) {
      return res.status(404).json({ ok: false, message: "User not found." });
    }

    const match = await user.comparePassword(currentPassword);
    if (!match) {
      return res.status(400).json({ ok: false, message: "Current password is incorrect." });
    }

    user.password = newPassword;
    user.passwordSet = true;
    await user.save();

    await Activity.create({ message: `Password updated by ${user.name}` });

    return res.json({ ok: true, message: "Password updated successfully." });
  } catch (err) {
    console.error("Update password error:", err);
    return res.status(500).json({ ok: false, message: "Server error updating password." });
  }
});

/**
 * GET /api/auth/me
 * Current authenticated user profile
 */
router.get("/me", requireAuth, async (req, res) => {
  return res.json({
    ok: true,
    user: req.user.toSafeObject(),
  });
});

/**
 * POST /api/auth/logout
 */
router.post("/logout", optionalAuth, async (req, res) => {
  if (req.user) {
    await Activity.create({ message: `${req.user.name} logged out` });
  }
  return res.json({ ok: true, message: "Logged out successfully." });
});

module.exports = router;
