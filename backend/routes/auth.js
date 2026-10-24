const express = require("express");
const router = express.Router();
const User = require("../models/User");
const Activity = require("../models/Activity");
const { generateToken, requireAuth, optionalAuth } = require("../middleware/auth");
const { createChallenge, verifyChallenge, resendChallenge } = require("../utils/otp");
const { sendOtpEmail, isEmailConfigured } = require("../utils/email");

const ADMIN_USERNAME = process.env.ADMIN_USERNAME || "admin";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "seatwise@admin123";
const ADMIN_ALT_PASSWORD = process.env.ADMIN_ALT_PASSWORD || "examseat@admin123";

/* =========================================================================
   Simple in-memory rate limiter for OTP endpoints.
   Limits per IP and per account to prevent brute force and email flooding.
   ========================================================================= */
const rateLimitStore = new Map();

function checkRateLimit(key, maxRequests, windowSeconds) {
  const now = Date.now();
  const windowMs = windowSeconds * 1000;
  const entry = rateLimitStore.get(key);

  if (!entry || now - entry.windowStart > windowMs) {
    rateLimitStore.set(key, { windowStart: now, count: 1 });
    return { allowed: true };
  }

  if (entry.count >= maxRequests) {
    const retryAfter = Math.ceil((entry.windowStart + windowMs - now) / 1000);
    return { allowed: false, retryAfter };
  }

  entry.count++;
  return { allowed: true };
}

// Clean up stale rate limit entries every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of rateLimitStore) {
    if (now - entry.windowStart > 600000) {
      rateLimitStore.delete(key);
    }
  }
}, 300000);

/**
 * POST /api/auth/admin-login
 * Administrator authentication — Direct credential validation (no OTP)
 */
router.post("/admin-login", async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ ok: false, message: "Username and password are required." });
    }

    // Rate limit: max 10 login attempts per IP per 5 minutes
    const ipKey = `login:ip:${req.ip}`;
    const ipLimit = checkRateLimit(ipKey, 10, 300);
    if (!ipLimit.allowed) {
      return res.status(429).json({ ok: false, message: "Too many login attempts. Please try again later." });
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

    // Admin authenticated successfully — generate JWT token directly
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
 * Student login by email OR roll number — Step 1: Validate credentials, initiate OTP
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

    // Rate limit: max 10 login attempts per IP per 5 minutes
    const ipKey = `login:ip:${req.ip}`;
    const ipLimit = checkRateLimit(ipKey, 10, 300);
    if (!ipLimit.allowed) {
      return res.status(429).json({ ok: false, message: "Too many login attempts. Please try again later." });
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

    // Resolve OTP destination from database record (never from client input)
    const otpEmail = student.email;
    if (!otpEmail || !otpEmail.includes("@")) {
      return res.status(500).json({
        ok: false,
        message: "Your account does not have a valid email address. Please contact the administrator.",
      });
    }

    // Rate limit OTP generation per account: max 5 per 10 minutes
    const acctKey = `otp:acct:${student.id}`;
    const acctLimit = checkRateLimit(acctKey, 5, 600);
    if (!acctLimit.allowed) {
      return res.status(429).json({ ok: false, message: "Too many verification requests. Please try again later." });
    }

    // Create OTP challenge
    const { challengeId, otpCode, maskedEmail } = await createChallenge(
      student.id,
      "student",
      otpEmail
    );

    // Attempt to send email
    const emailResult = await sendOtpEmail(otpEmail, otpCode, student.name);
    if (!emailResult.ok) {
      const OtpChallenge = require("../models/OtpChallenge");
      await OtpChallenge.updateOne({ challengeId }, { $set: { invalidated: true } });
      return res.status(503).json({
        ok: false,
        message: emailResult.error || "Failed to send verification email. Please try again.",
      });
    }

    return res.json({
      ok: true,
      otpRequired: true,
      challengeId,
      maskedEmail,
      message: "Credentials verified. A verification code has been sent to your registered email.",
    });
  } catch (err) {
    console.error("Student login error:", err);
    return res.status(500).json({ ok: false, message: "Server error during login." });
  }
});

/**
 * POST /api/auth/verify-otp
 * Step 2: Verify OTP and issue authenticated JWT
 */
router.post("/verify-otp", async (req, res) => {
  try {
    const { challengeId, otp, role } = req.body;

    if (!challengeId || !otp) {
      return res.status(400).json({ ok: false, message: "Verification code is required." });
    }

    const expectedRole = role === "admin" ? "admin" : "student";

    // Rate limit OTP verification per IP: max 20 per 5 minutes
    const ipKey = `verify:ip:${req.ip}`;
    const ipLimit = checkRateLimit(ipKey, 20, 300);
    if (!ipLimit.allowed) {
      return res.status(429).json({ ok: false, message: "Too many verification attempts. Please try again later." });
    }

    const cleanOtp = String(otp).trim();
    if (!/^\d{4}$/.test(cleanOtp)) {
      return res.status(400).json({ ok: false, message: "Please enter a valid 4-digit verification code." });
    }
    const result = await verifyChallenge(challengeId, cleanOtp, expectedRole);

    if (!result.valid) {
      return res.status(401).json({ ok: false, message: result.error });
    }

    // OTP verified — look up the user and issue JWT
    const user = await User.findOne({ id: result.challenge.userId });
    if (!user) {
      return res.status(401).json({ ok: false, message: "User account no longer exists." });
    }

    if (user.disabled === true) {
      return res.status(403).json({ ok: false, message: "Account is disabled. Please contact administrator." });
    }

    // Verify role matches
    if (user.role !== expectedRole) {
      return res.status(403).json({ ok: false, message: "Access denied." });
    }

    const token = generateToken(user);

    if (expectedRole === "admin") {
      await Activity.create({ message: "Administrator logged in" });
    } else {
      await Activity.create({ message: `Student logged in: ${user.name} (${user.rollNo})` });
    }

    return res.json({
      ok: true,
      message: expectedRole === "admin" ? "Welcome back, Administrator." : "Login successful. Redirecting...",
      token,
      user: user.toSafeObject(),
    });
  } catch (err) {
    console.error("OTP verification error:", err);
    return res.status(500).json({ ok: false, message: "Server error during verification." });
  }
});

/**
 * POST /api/auth/resend-otp
 * Resend OTP for an active challenge
 */
router.post("/resend-otp", async (req, res) => {
  try {
    const { challengeId, role } = req.body;

    if (!challengeId) {
      return res.status(400).json({ ok: false, message: "Invalid verification session." });
    }

    const expectedRole = role === "admin" ? "admin" : "student";

    // Rate limit resend per IP: max 5 per 5 minutes
    const ipKey = `resend:ip:${req.ip}`;
    const ipLimit = checkRateLimit(ipKey, 5, 300);
    if (!ipLimit.allowed) {
      return res.status(429).json({ ok: false, message: "Too many resend requests. Please try again later." });
    }

    const result = await resendChallenge(challengeId, expectedRole);

    if (!result.ok) {
      return res.status(400).json({ ok: false, message: result.error });
    }

    // Send the new OTP email
    const emailResult = await sendOtpEmail(result.email, result.otpCode);
    if (!emailResult.ok) {
      return res.status(503).json({
        ok: false,
        message: emailResult.error || "Failed to resend verification email.",
      });
    }

    return res.json({
      ok: true,
      maskedEmail: result.maskedEmail,
      message: "A new verification code has been sent.",
    });
  } catch (err) {
    console.error("OTP resend error:", err);
    return res.status(500).json({ ok: false, message: "Server error resending code." });
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
