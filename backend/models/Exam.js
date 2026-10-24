const mongoose = require("mongoose");

const ExamSchema = new mongoose.Schema(
  {
    id: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      index: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    date: {
      type: String,
      required: true,
    },
    time: {
      type: String,
      required: true,
    },
    semester: {
      type: String,
      default: "5th Semester",
    },
    duration: {
      type: String,
      default: "2 Hours",
    },
    subjectCode: {
      type: String,
      default: "",
      trim: true,
    },
    reportingTime: {
      type: String,
      default: "",
      trim: true,
    },
    instructions: {
      type: [String],
      default: [],
    },
    timezone: {
      type: String,
      default: () => process.env.EXAM_TIMEZONE || "Asia/Kolkata",
      trim: true,
    },
    isCancelled: {
      type: Boolean,
      default: false,
    },
    status: {
      type: String,
      default: "scheduled",
      trim: true,
    },
  },
  {
    timestamps: true,
  }
);

ExamSchema.methods.toSafeObject = function () {
  const obj = this.toObject();
  delete obj.__v;
  return obj;
};

module.exports = mongoose.model("Exam", ExamSchema);
