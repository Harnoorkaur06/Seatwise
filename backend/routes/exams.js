const express = require("express");
const router = express.Router();
const mongoose = require("mongoose");
const Exam = require("../models/Exam");
const SeatingPlan = require("../models/SeatingPlan");
const Room = require("../models/Room");
const User = require("../models/User");
const Student = require("../models/Student");
const Activity = require("../models/Activity");
const { SeatingEngine, seatLabel } = require("../utils/seatingEngine");
const { requireAdmin, requireAuth } = require("../middleware/auth");

function stampAssignments(plan, studentDocMap = new Map()) {
  if (!plan || !Array.isArray(plan.rooms)) return;
  for (const room of plan.rooms) {
    room.seats = [];
    if (!Array.isArray(room.grid)) continue;
    for (let r = 0; r < room.grid.length; r++) {
      for (let c = 0; c < room.grid[r].length; c++) {
        const cell = room.grid[r][c];
        if (cell) {
          cell.examId = plan.examId;
          cell.seatingPlanId = plan.id;
          const rollKey = String(cell.rollNo || "").toUpperCase();
          const doc = studentDocMap.get(rollKey) || studentDocMap.get(cell.id);
          room.seats.push({
            seat: seatLabel(r, c),
            row: r,
            col: c,
            student: doc ? doc._id : undefined,
            studentId: cell.id || (doc && doc.id),
            studentRoll: cell.rollNo || (doc && doc.rollNo),
            studentName: cell.name || (doc && doc.name),
            subject: cell.subject,
          });
        }
      }
    }
  }
}

function generateId(prefix = "exam") {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * GET /api/exams
 */
router.get("/", requireAuth, async (req, res) => {
  try {
    const exams = await Exam.find().sort({ date: 1, time: 1 });
    return res.json({
      ok: true,
      exams: exams.map((e) => e.toSafeObject()),
    });
  } catch (err) {
    console.error("Get exams error:", err);
    return res.status(500).json({ ok: false, message: "Error fetching exams." });
  }
});

/**
 * GET /api/exams/active
 */
router.get("/active", requireAuth, async (req, res) => {
  try {
    const exams = await Exam.find().sort({ date: 1, time: 1 });
    if (exams.length === 0) {
      return res.json({ ok: true, exam: null });
    }
    const today = new Date().toISOString().split("T")[0];
    const upcoming = exams.find((e) => e.date >= today) || exams[0];
    return res.json({ ok: true, exam: upcoming.toSafeObject() });
  } catch (err) {
    console.error("Get active exam error:", err);
    return res.status(500).json({ ok: false, message: "Error fetching active exam." });
  }
});

/**
 * POST /api/exams
 * Admin only: Create examination
 */
router.post("/", requireAdmin, async (req, res) => {
  try {
    const { name, date, time, semester, duration } = req.body;
    if (!name || !date || !time) {
      return res.status(400).json({ ok: false, message: "Exam name, date, and time are required." });
    }

    const exam = new Exam({
      id: generateId("exam"),
      name: name.trim(),
      date,
      time,
      semester: (semester || "5th Semester").trim(),
      duration: (duration || "2 Hours").trim(),
    });
    await exam.save();

    await Activity.create({ message: `Exam created: ${exam.name}` });

    return res.status(201).json({
      ok: true,
      message: "Examination created successfully.",
      exam: exam.toSafeObject(),
    });
  } catch (err) {
    console.error("Create exam error:", err);
    return res.status(500).json({ ok: false, message: "Error creating examination." });
  }
});

/**
 * PUT /api/exams/:id
 * Admin only: Update exam details
 */
router.put("/:id", requireAdmin, async (req, res) => {
  try {
    const target = req.params.id.trim();
    const exam = await Exam.findOne({ id: target });
    if (!exam) {
      return res.status(404).json({ ok: false, message: "Exam not found." });
    }

    const { name, date, time, semester, duration } = req.body;
    if (name) exam.name = name.trim();
    if (date) exam.date = date;
    if (time) exam.time = time;
    if (semester) exam.semester = semester.trim();
    if (duration) exam.duration = duration.trim();

    await exam.save();

    // Update examName in existing seating plans tied to this examId
    if (name) {
      await SeatingPlan.updateMany({ examId: target }, { examName: name.trim() });
    }

    await Activity.create({ message: `Exam updated: ${exam.name}` });

    return res.json({
      ok: true,
      message: "Examination updated successfully.",
      exam: exam.toSafeObject(),
    });
  } catch (err) {
    console.error("Update exam error:", err);
    return res.status(500).json({ ok: false, message: "Error updating examination." });
  }
});

/**
 * DELETE /api/exams/:id
 * Admin only: Delete exam and all its seating plans
 */
router.delete("/:id", requireAdmin, async (req, res) => {
  try {
    const target = req.params.id.trim();
    const exam = await Exam.findOneAndDelete({ id: target });
    if (!exam) {
      return res.status(404).json({ ok: false, message: "Exam not found." });
    }

    // Delete associated seating plans
    await SeatingPlan.deleteMany({ examId: target });
    await Activity.create({ message: `Exam removed: ${exam.name}` });

    return res.json({ ok: true, message: "Examination and associated seating plans removed successfully." });
  } catch (err) {
    console.error("Delete exam error:", err);
    return res.status(500).json({ ok: false, message: "Error deleting examination." });
  }
});

/**
 * POST /api/exams/:id/generate-seating
 * Admin only: Generate conflict-free seating plan for a specific exam.
 * Populates student links and exam session references.
 */
router.post("/:id/generate-seating", requireAdmin, async (req, res) => {
  try {
    const target = req.params.id.trim();
    let exam = await Exam.findOne({
      $or: [
        { id: target },
        { _id: mongoose.isValidObjectId(target) ? target : null },
      ],
    });

    if (!exam) {
      return res.status(404).json({ ok: false, message: "Exam not found." });
    }

    const students = await User.find({ role: "student" }).sort({ rollNo: 1 });
    const rooms = await Room.find().sort({ roomNumber: 1 });

    if (rooms.length === 0) {
      return res.status(400).json({ ok: false, message: "Cannot generate seating: No lecture halls configured." });
    }

    const studentMap = new Map();
    students.forEach((s) => {
      if (s.rollNo) studentMap.set(String(s.rollNo).toUpperCase(), s);
      if (s.id) studentMap.set(s.id, s);
    });

    const planData = SeatingEngine.generate(students, rooms, {
      generation: 1,
      examId: exam.id,
      examName: exam.name,
    });

    planData.exam = exam._id;
    stampAssignments(planData, studentMap);

    // Deactivate previous active plans for this exam
    await SeatingPlan.updateMany({ examId: exam.id }, { isActive: false });

    // Save plan and populate
    const plan = new SeatingPlan(planData);
    await plan.save();
    await plan.populateExamAndStudents();

    await Activity.create({
      message: `Seating generated for ${exam.name} via POST /api/exams/:id/generate-seating (${planData.stats.totalConflicts} conflicts)`,
    });

    return res.status(201).json({
      ok: true,
      message: `Seating generated successfully for ${exam.name}.`,
      plan: plan.toSafeObject(),
    });
  } catch (err) {
    console.error("Generate seating error in exams router:", err);
    return res.status(500).json({ ok: false, message: "Error generating seating arrangement." });
  }
});

module.exports = router;
