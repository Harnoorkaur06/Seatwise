const mongoose = require("mongoose");

const SeatAssignmentSchema = new mongoose.Schema(
  {
    seat: { type: String, required: true },
    row: { type: Number, required: true },
    col: { type: Number, required: true },
    student: { type: mongoose.Schema.Types.ObjectId, ref: "Student" },
    studentId: { type: String },
    studentRoll: { type: String },
    studentName: { type: String },
    subject: { type: String },
  },
  { _id: false }
);

const PlanRoomSchema = new mongoose.Schema(
  {
    roomNumber: { type: String, required: true },
    rows: { type: Number, default: 5 },
    cols: { type: Number, default: 10 },
    capacity: { type: Number, default: 50 },
    grid: { type: [[mongoose.Schema.Types.Mixed]], default: [] },
    seats: { type: [SeatAssignmentSchema], default: [] },
  },
  { _id: false }
);

const SeatingPlanSchema = new mongoose.Schema(
  {
    id: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    // Relational reference to Exam session
    exam: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Exam",
    },
    examId: {
      type: String,
      required: true,
      index: true,
    },
    examName: {
      type: String,
      required: true,
    },
    generation: {
      type: Number,
      default: 1,
      index: true,
    },
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
    generatedAt: {
      type: String,
      default: () => new Date().toISOString(),
    },
    rooms: {
      type: [PlanRoomSchema],
      default: [],
    },
    unassigned: {
      type: [mongoose.Schema.Types.Mixed],
      default: [],
    },
    conflicts: {
      type: [mongoose.Schema.Types.Mixed],
      default: [],
    },
    stats: {
      totalConflicts: { type: Number, default: 0 },
      unassignedCount: { type: Number, default: 0 },
      roomsUsed: { type: Number, default: 0 },
      totalAssigned: { type: Number, default: 0 },
      conflictRate: { type: Number, default: 0 },
      validityPercentage: { type: Number, default: 100 },
      seatUtilization: { type: Number, default: 0 },
    },
  },
  {
    timestamps: true,
  }
);

/**
 * Populate helper linking students to their assigned seats and exam session
 */
SeatingPlanSchema.methods.populateExamAndStudents = function () {
  return this.populate([
    { path: "exam" },
    { path: "rooms.seats.student", select: "-password -__v" },
  ]);
};

SeatingPlanSchema.methods.toSafeObject = function () {
  const obj = this.toObject();
  delete obj.__v;
  return obj;
};

module.exports = mongoose.model("SeatingPlan", SeatingPlanSchema);
