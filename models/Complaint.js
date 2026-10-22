const mongoose = require("mongoose");

const ComplaintSchema = new mongoose.Schema(
  {
    id: {
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
    userName: {
      type: String,
      default: "Student",
    },
    userEmail: {
      type: String,
      default: "",
      index: true,
    },
    rollNo: {
      type: String,
      default: "",
      index: true,
    },
    category: {
      type: String,
      default: "Other",
    },
    subject: {
      type: String,
      required: true,
      trim: true,
    },
    message: {
      type: String,
      required: true,
      trim: true,
    },
    status: {
      type: String,
      enum: ["Pending", "Resolved"],
      default: "Pending",
      index: true,
    },
    adminReply: {
      type: String,
      default: "",
    },
    unread: {
      type: Boolean,
      default: false,
    },
    unreadReply: {
      type: Boolean,
      default: false,
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

ComplaintSchema.methods.toSafeObject = function () {
  const obj = this.toObject();
  delete obj.__v;
  return obj;
};

module.exports = mongoose.model("Complaint", ComplaintSchema);
