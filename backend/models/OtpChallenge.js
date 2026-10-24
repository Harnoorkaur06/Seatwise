const mongoose = require("mongoose");

const OtpChallengeSchema = new mongoose.Schema(
  {
    challengeId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    userId: {
      type: String,
      required: true,
      index: true,
    },
    role: {
      type: String,
      enum: ["admin", "student"],
      required: true,
    },
    email: {
      type: String,
      required: true,
    },
    otpHash: {
      type: String,
      required: true,
    },
    otpSalt: {
      type: String,
      required: true,
    },
    expiresAt: {
      type: Date,
      required: true,
    },
    attempts: {
      type: Number,
      default: 0,
    },
    maxAttempts: {
      type: Number,
      default: 5,
    },
    consumed: {
      type: Boolean,
      default: false,
    },
    invalidated: {
      type: Boolean,
      default: false,
    },
    lastResendAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

// TTL index: auto-remove documents 10 minutes after expiry (cleanup only, not security)
OtpChallengeSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 600 });

module.exports = mongoose.model("OtpChallenge", OtpChallengeSchema);
