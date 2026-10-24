/**
 * utils/otp.js — Secure OTP generation, hashing, and verification for SEATWISE
 *
 * Uses Node.js built-in crypto module for CSPRNG and hashing.
 * Never uses Math.random(), timestamps, or predictable patterns.
 */

const crypto = require("crypto");
const OtpChallenge = require("../models/OtpChallenge");

const OTP_EXPIRY_MINUTES = 5;
const MAX_ATTEMPTS = 5;
const RESEND_COOLDOWN_SECONDS = 60;

/**
 * Generate a cryptographically secure 4-digit OTP.
 * Supports leading zeros (e.g. "0047", "0821").
 */
function generateOtpCode() {
  const num = crypto.randomInt(0, 10000);
  return String(num).padStart(4, "0");
}

/**
 * Hash an OTP code with a random salt using SHA-256.
 * Returns { hash, salt }.
 */
function hashOtp(otpCode) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto
    .createHmac("sha256", salt)
    .update(otpCode)
    .digest("hex");
  return { hash, salt };
}

/**
 * Verify an OTP code against stored hash and salt.
 */
function verifyOtpHash(otpCode, storedHash, storedSalt) {
  const candidateHash = crypto
    .createHmac("sha256", storedSalt)
    .update(otpCode)
    .digest("hex");
  return crypto.timingSafeEqual(
    Buffer.from(candidateHash, "hex"),
    Buffer.from(storedHash, "hex")
  );
}

/**
 * Create a new OTP challenge for a user.
 * Invalidates any existing active challenges for the same user+role.
 *
 * @param {string} userId - The user's id field
 * @param {string} role - "student" or "admin"
 * @param {string} email - The recipient email address
 * @returns {{ challengeId: string, otpCode: string, maskedEmail: string }}
 */
async function createChallenge(userId, role, email) {
  // Invalidate all existing active challenges for this user+role
  await OtpChallenge.updateMany(
    { userId, role, consumed: false, invalidated: false },
    { $set: { invalidated: true } }
  );

  const otpCode = generateOtpCode();
  const { hash, salt } = hashOtp(otpCode);
  const challengeId = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000);

  await OtpChallenge.create({
    challengeId,
    userId,
    role,
    email,
    otpHash: hash,
    otpSalt: salt,
    expiresAt,
    attempts: 0,
    maxAttempts: MAX_ATTEMPTS,
    consumed: false,
    invalidated: false,
    lastResendAt: new Date(),
  });

  return {
    challengeId,
    otpCode,
    maskedEmail: maskEmail(email),
  };
}

/**
 * Verify an OTP submission against an active challenge.
 * Returns { valid: boolean, error?: string, challenge?: OtpChallenge }
 */
async function verifyChallenge(challengeId, otpCode, expectedRole) {
  const challenge = await OtpChallenge.findOne({ challengeId });

  if (!challenge) {
    return { valid: false, error: "Invalid verification session. Please log in again." };
  }

  // Role isolation: student challenges cannot auth admins and vice versa
  if (challenge.role !== expectedRole) {
    return { valid: false, error: "Invalid verification session. Please log in again." };
  }

  if (challenge.consumed) {
    return { valid: false, error: "This verification code has already been used. Please log in again." };
  }

  if (challenge.invalidated) {
    return { valid: false, error: "This verification session has been invalidated. Please log in again." };
  }

  if (new Date() > challenge.expiresAt) {
    challenge.invalidated = true;
    await challenge.save();
    return { valid: false, error: "Verification code has expired. Please log in again." };
  }

  if (challenge.attempts >= challenge.maxAttempts) {
    challenge.invalidated = true;
    await challenge.save();
    return { valid: false, error: "Too many failed attempts. Please log in again." };
  }

  // Increment attempt count atomically
  const updated = await OtpChallenge.findOneAndUpdate(
    {
      challengeId,
      consumed: false,
      invalidated: false,
      attempts: { $lt: MAX_ATTEMPTS },
    },
    { $inc: { attempts: 1 } },
    { new: true }
  );

  if (!updated) {
    return { valid: false, error: "Verification session is no longer valid. Please log in again." };
  }

  const isValid = verifyOtpHash(otpCode, updated.otpHash, updated.otpSalt);

  if (!isValid) {
    const remaining = updated.maxAttempts - updated.attempts;
    if (remaining <= 0) {
      updated.invalidated = true;
      await updated.save();
      return { valid: false, error: "Too many failed attempts. Please log in again." };
    }
    return {
      valid: false,
      error: `Incorrect verification code. ${remaining} attempt${remaining !== 1 ? "s" : ""} remaining.`,
    };
  }

  // Mark as consumed atomically to prevent double-use
  const consumed = await OtpChallenge.findOneAndUpdate(
    { challengeId, consumed: false, invalidated: false },
    { $set: { consumed: true } },
    { new: true }
  );

  if (!consumed) {
    return { valid: false, error: "Verification session is no longer valid. Please log in again." };
  }

  return { valid: true, challenge: consumed };
}

/**
 * Resend OTP for an active challenge.
 * Enforces cooldown and generates a new code.
 */
async function resendChallenge(challengeId, expectedRole) {
  const challenge = await OtpChallenge.findOne({ challengeId });

  if (!challenge) {
    return { ok: false, error: "Invalid verification session. Please log in again." };
  }

  if (challenge.role !== expectedRole) {
    return { ok: false, error: "Invalid verification session. Please log in again." };
  }

  if (challenge.consumed || challenge.invalidated) {
    return { ok: false, error: "This verification session is no longer active. Please log in again." };
  }

  if (new Date() > challenge.expiresAt) {
    challenge.invalidated = true;
    await challenge.save();
    return { ok: false, error: "Verification session has expired. Please log in again." };
  }

  // Enforce resend cooldown
  if (challenge.lastResendAt) {
    const elapsed = (Date.now() - challenge.lastResendAt.getTime()) / 1000;
    if (elapsed < RESEND_COOLDOWN_SECONDS) {
      const wait = Math.ceil(RESEND_COOLDOWN_SECONDS - elapsed);
      return { ok: false, error: `Please wait ${wait} seconds before requesting a new code.` };
    }
  }

  // Generate new OTP and update challenge
  const otpCode = generateOtpCode();
  const { hash, salt } = hashOtp(otpCode);

  // Reset attempts and extend expiry for the resend
  const newExpiry = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000);

  await OtpChallenge.updateOne(
    { challengeId },
    {
      $set: {
        otpHash: hash,
        otpSalt: salt,
        expiresAt: newExpiry,
        attempts: 0,
        lastResendAt: new Date(),
      },
    }
  );

  return {
    ok: true,
    otpCode,
    email: challenge.email,
    maskedEmail: maskEmail(challenge.email),
  };
}

/**
 * Mask an email address for safe client display.
 * "harnoor@student.com" -> "har****@student.com"
 */
function maskEmail(email) {
  if (!email || !email.includes("@")) return "***@***.***";
  const [local, domain] = email.split("@");
  if (local.length <= 2) {
    return `${local[0]}***@${domain}`;
  }
  const visible = Math.min(3, Math.floor(local.length / 2));
  return `${local.substring(0, visible)}${"*".repeat(local.length - visible)}@${domain}`;
}

module.exports = {
  generateOtpCode,
  hashOtp,
  verifyOtpHash,
  createChallenge,
  verifyChallenge,
  resendChallenge,
  maskEmail,
  OTP_EXPIRY_MINUTES,
  MAX_ATTEMPTS,
  RESEND_COOLDOWN_SECONDS,
};
