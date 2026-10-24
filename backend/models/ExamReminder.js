const mongoose = require("mongoose");

/**
 * ExamReminder Model — Persistent delivery tracking and duplicate prevention.
 *
 * Guarantees that personalized exam reminders are sent at most once per student
 * per examination session across repeated scheduler runs and backend restarts.
 *
 * Compound unique index on { examId: 1, studentId: 1 } ensures strict atomic uniqueness.
 */
const ExamReminderSchema = new mongoose.Schema(
  {
    examId: {
      type: String,
      required: true,
      index: true,
      trim: true,
    },
    examName: {
      type: String,
      default: "",
      trim: true,
    },
    studentId: {
      type: String,
      required: true,
      index: true,
      trim: true,
    },
    studentRoll: {
      type: String,
      default: "",
      index: true,
      trim: true,
    },
    studentName: {
      type: String,
      default: "",
      trim: true,
    },
    studentEmail: {
      type: String,
      default: "",
      lowercase: true,
      trim: true,
    },
    roomNumber: {
      type: String,
      default: "",
      trim: true,
    },
    seat: {
      type: String,
      default: "",
      trim: true,
    },
    subject: {
      type: String,
      default: "",
      trim: true,
    },
    status: {
      type: String,
      enum: [
        "pending",
        "processing",
        "sent",
        "failed",
        "skipped_missing_assignment",
        "skipped_ambiguous_assignment",
        "skipped_invalid_email",
      ],
      default: "pending",
      index: true,
    },
    attemptCount: {
      type: Number,
      default: 0,
    },
    lastAttemptAt: {
      type: Date,
    },
    sentAt: {
      type: Date,
    },
    messageId: {
      type: String,
      default: "",
      trim: true,
    },
    lastError: {
      type: String,
      default: "",
      trim: true,
    },
    lockExpiresAt: {
      type: Date,
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

// Authoritative composite unique index: each student receives at most one reminder per exam
ExamReminderSchema.index({ examId: 1, studentId: 1 }, { unique: true });

ExamReminderSchema.methods.toSafeObject = function () {
  const obj = this.toObject();
  delete obj.__v;
  // Mask email for privacy if returned in admin inspection
  if (obj.studentEmail) {
    const parts = obj.studentEmail.split("@");
    if (parts.length === 2 && parts[0].length > 2) {
      obj.studentEmail = `${parts[0].slice(0, 2)}***@${parts[1]}`;
    }
  }
  return obj;
};

module.exports = mongoose.model("ExamReminder", ExamReminderSchema);
