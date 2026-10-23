const express = require("express");
const router = express.Router();
const mongoose = require("mongoose");
const SeatingPlan = require("../models/SeatingPlan");
const User = require("../models/User");
const Student = require("../models/Student");
const Room = require("../models/Room");
const Exam = require("../models/Exam");
const Activity = require("../models/Activity");
const { SeatingEngine, seatLabel } = require("../utils/seatingEngine");
const { requireAdmin, requireAuth } = require("../middleware/auth");

/**
 * Stamp examId and seatingPlanId onto each seat in the grid,
 * and populate relational rooms.seats array referencing Student ObjectIds.
 */
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

async function syncPlanSeats(plan) {
  if (!plan || !Array.isArray(plan.rooms)) return;
  const students = await User.find({ role: "student" }).select("_id id rollNo name subject");
  const studentMap = new Map();
  students.forEach((s) => {
    if (s.rollNo) studentMap.set(String(s.rollNo).toUpperCase(), s);
    if (s.id) studentMap.set(s.id, s);
  });
  stampAssignments(plan, studentMap);
}

/**
 * GET /api/seating
 * Get all seating plans, or filter by examId
 */
router.get("/", requireAuth, async (req, res) => {
  try {
    const { examId } = req.query;
    const query = {};
    if (examId) query.examId = examId;

    const plans = await SeatingPlan.find(query).sort({ generation: -1, createdAt: -1 });
    return res.json({
      ok: true,
      plans: plans.map((p) => p.toSafeObject()),
    });
  } catch (err) {
    console.error("Get seating plans error:", err);
    return res.status(500).json({ ok: false, message: "Error fetching seating plans." });
  }
});

/**
 * GET /api/seating/student/:rollNo
 * Retrieve student seat assignments across all active plans or for specific exam
 * - Admin: any student
 * - Student: strictly own roll number only
 */
router.get("/student/:rollNo", requireAuth, async (req, res) => {
  try {
    const targetRoll = req.params.rollNo.trim().toLowerCase();

    if (req.user.role === "student") {
      const myRoll = (req.user.rollNo || "").trim().toLowerCase();
      if (!myRoll || myRoll !== targetRoll) {
        return res.status(403).json({
          ok: false,
          message: "Access forbidden: You may only view your own seating allocation.",
        });
      }
    }

    const { examId } = req.query;

    const query = { isActive: true };
    if (examId) query.examId = examId;

    const plans = await SeatingPlan.find(query);
    const results = [];

    for (const plan of plans) {
      if (!Array.isArray(plan.rooms)) continue;
      let foundInPlan = false;
      for (const room of plan.rooms) {
        if (!Array.isArray(room.grid)) continue;
        for (const row of room.grid) {
          for (const seat of row) {
            if (seat && String(seat.rollNo || "").toLowerCase() === targetRoll) {
              results.push({
                ...seat,
                roomNumber: room.roomNumber,
                examId: plan.examId,
                examName: plan.examName,
                seatingPlanId: plan.id,
                generation: plan.generation,
              });
              foundInPlan = true;
              break;
            }
          }
          if (foundInPlan) break;
        }
        if (foundInPlan) break;
      }
    }

    return res.json({
      ok: true,
      seats: results,
      seat: results[0] || null,
    });
  } catch (err) {
    console.error("Get student seats error:", err);
    return res.status(500).json({ ok: false, message: "Error finding student seating." });
  }
});

/**
 * GET /api/seating/:examId
 * Get active seating plan or specific generation for an exam
 */
router.get("/:examId", requireAuth, async (req, res) => {
  try {
    const examId = req.params.examId.trim();
    const { generation } = req.query;

    let plan = null;
    if (generation !== undefined && generation !== null && generation !== "") {
      plan = await SeatingPlan.findOne({ examId, generation: Number(generation) });
    } else {
      plan = await SeatingPlan.findOne({ examId, isActive: true });
      if (!plan) {
        plan = await SeatingPlan.findOne({ examId }).sort({ generation: -1 });
      }
    }

    if (!plan) {
      return res.status(404).json({ ok: false, message: "No seating plan found for this examination." });
    }

    return res.json({ ok: true, plan: plan.toSafeObject() });
  } catch (err) {
    console.error("Get exam seating plan error:", err);
    return res.status(500).json({ ok: false, message: "Error fetching seating plan." });
  }
});

/**
 * POST /api/seating/generate
 * Admin only: Run Generation #1 fresh for an exam
 */
router.post("/generate", requireAdmin, async (req, res) => {
  try {
    const { examId } = req.body;
    let exam = null;
    if (examId) {
      exam = await Exam.findOne({ id: examId });
    }
    if (!exam) {
      exam = await Exam.findOne().sort({ date: 1 });
    }

    if (!exam) {
      return res.status(400).json({ ok: false, message: "Cannot generate seating: No valid examination found." });
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

    // Save new plan to MongoDB
    const plan = new SeatingPlan(planData);
    await plan.save();
    await plan.populateExamAndStudents();

    await Activity.create({
      message: `Seating generated for ${exam.name} (Generation 1) — ${planData.stats.totalConflicts} conflicts`,
    });

    return res.status(201).json({
      ok: true,
      message: `Seating generated for ${exam.name}.`,
      plan: plan.toSafeObject(),
    });
  } catch (err) {
    console.error("Generate seating error:", err);
    return res.status(500).json({ ok: false, message: "Error generating seating arrangement." });
  }
});

/**
 * POST /api/seating/regenerate
 * Admin only: Re-run algorithm with new generation seed
 */
router.post("/regenerate", requireAdmin, async (req, res) => {
  try {
    const { examId } = req.body;
    let exam = null;
    if (examId) {
      exam = await Exam.findOne({ id: examId });
    }
    if (!exam) {
      exam = await Exam.findOne().sort({ date: 1 });
    }

    if (!exam) {
      return res.status(400).json({ ok: false, message: "Cannot regenerate seating: No valid examination found." });
    }

    const lastPlan = await SeatingPlan.findOne({ examId: exam.id }).sort({ generation: -1 });
    const nextGen = (lastPlan?.generation || 0) + 1;

    const students = await User.find({ role: "student" }).sort({ rollNo: 1 });
    const rooms = await Room.find().sort({ roomNumber: 1 });

    const studentMap = new Map();
    students.forEach((s) => {
      if (s.rollNo) studentMap.set(String(s.rollNo).toUpperCase(), s);
      if (s.id) studentMap.set(s.id, s);
    });

    const planData = SeatingEngine.generate(students, rooms, {
      generation: nextGen,
      examId: exam.id,
      examName: exam.name,
    });

    planData.exam = exam._id;
    stampAssignments(planData, studentMap);

    // Deactivate previous plans for this exam
    await SeatingPlan.updateMany({ examId: exam.id }, { isActive: false });

    const plan = new SeatingPlan(planData);
    await plan.save();
    await plan.populateExamAndStudents();

    await Activity.create({
      message: `Seating regenerated for ${exam.name} (Generation ${nextGen}) — ${planData.stats.totalConflicts} conflicts`,
    });

    return res.status(201).json({
      ok: true,
      message: `Seating regenerated for ${exam.name} (Gen ${nextGen}).`,
      plan: plan.toSafeObject(),
    });
  } catch (err) {
    console.error("Regenerate seating error:", err);
    return res.status(500).json({ ok: false, message: "Error regenerating seating arrangement." });
  }
});

/**
 * POST /api/seating/override
 * Admin only: Move or swap a student with conflict check & suggestions
 */
router.post("/override", requireAdmin, async (req, res) => {
  try {
    const { roomNumber, row, col, rollNo, examId, generation } = req.body;

    const query = { examId };
    if (generation) query.generation = Number(generation);
    else query.isActive = true;

    let plan = await SeatingPlan.findOne(query);
    if (!plan) {
      return res.status(404).json({ ok: false, message: "No seating plan exists for this examination." });
    }

    const numericRow = Number(row);
    const numericCol = Number(col);

    const destRoom = plan.rooms.find((r) => r.roomNumber === roomNumber);
    if (!destRoom) {
      return res.status(404).json({ ok: false, message: `Room ${roomNumber} not found in this seating plan.` });
    }

    if (numericRow >= destRoom.grid.length || numericCol >= (destRoom.grid[numericRow]?.length || 0)) {
      return res.status(400).json({ ok: false, message: "Selected seat does not exist in this room." });
    }

    // Locate student in current plan
    let source = null;
    let student = null;

    for (const rm of plan.rooms) {
      for (let r = 0; r < rm.grid.length; r++) {
        for (let c = 0; c < rm.grid[r].length; c++) {
          const seat = rm.grid[r][c];
          if (seat && String(seat.rollNo || "").toUpperCase() === String(rollNo || "").toUpperCase()) {
            source = { roomNumber: rm.roomNumber, row: r, col: c };
            student = seat;
            break;
          }
        }
        if (student) break;
      }
      if (student) break;
    }

    if (!student) {
      return res.status(404).json({ ok: false, message: "Student not found in this seating plan." });
    }

    // Check conflict
    const conflictsExist = SeatingEngine.wouldConflict(
      plan,
      roomNumber,
      numericRow,
      numericCol,
      student.subject,
      student.rollNo
    );

    if (conflictsExist) {
      const suggestions = SeatingEngine.suggestSeats(plan, student.subject, student.rollNo, 3);
      return res.status(200).json({
        ok: false,
        conflict: true,
        message: `⚠ CONFLICT DETECTED — ${student.subject} cannot be placed next to another ${student.subject} student.`,
        suggestions,
      });
    }

    // Apply seat swap
    const destOccupant = destRoom.grid[numericRow][numericCol];
    const srcRoom = plan.rooms.find((r) => r.roomNumber === source.roomNumber);

    destRoom.grid[numericRow][numericCol] = {
      ...student,
      seat: seatLabel(numericRow, numericCol),
      row: numericRow,
      col: numericCol,
      examId: plan.examId,
      seatingPlanId: plan.id,
    };

    if (destOccupant) {
      srcRoom.grid[source.row][source.col] = {
        ...destOccupant,
        seat: seatLabel(source.row, source.col),
        row: source.row,
        col: source.col,
        examId: plan.examId,
        seatingPlanId: plan.id,
      };
    } else {
      srcRoom.grid[source.row][source.col] = null;
    }

    SeatingEngine.recalculate(plan);
    await syncPlanSeats(plan);
    plan.markModified("rooms");
    plan.markModified("conflicts");
    plan.markModified("stats");
    await plan.save();

    await Activity.create({
      message: `Admin manually moved ${rollNo} to ${roomNumber} seat in ${plan.examName}`,
    });

    return res.json({
      ok: true,
      message: "Seat updated successfully.",
      plan: plan.toSafeObject(),
    });
  } catch (err) {
    console.error("Override seat error:", err);
    return res.status(500).json({ ok: false, message: "Error updating seat position." });
  }
});

/**
 * POST /api/seating/force-override
 * Admin only: Force override even with conflicts
 */
router.post("/force-override", requireAdmin, async (req, res) => {
  try {
    const { roomNumber, row, col, rollNo, examId, generation } = req.body;

    const query = { examId };
    if (generation) query.generation = Number(generation);
    else query.isActive = true;

    let plan = await SeatingPlan.findOne(query);
    if (!plan) return res.status(404).json({ ok: false, message: "No seating plan exists." });

    const numericRow = Number(row);
    const numericCol = Number(col);
    const destRoom = plan.rooms.find((r) => r.roomNumber === roomNumber);
    if (!destRoom) return res.status(404).json({ ok: false, message: "Room not found." });

    let source = null, student = null;
    for (const rm of plan.rooms) {
      for (let r = 0; r < rm.grid.length; r++) {
        for (let c = 0; c < rm.grid[r].length; c++) {
          const seat = rm.grid[r][c];
          if (seat && String(seat.rollNo || "").toUpperCase() === String(rollNo || "").toUpperCase()) {
            source = { roomNumber: rm.roomNumber, row: r, col: c };
            student = seat;
            break;
          }
        }
        if (student) break;
      }
      if (student) break;
    }

    if (!student) return res.status(404).json({ ok: false, message: "Student not found in seating plan." });

    const destOccupant = destRoom.grid[numericRow][numericCol];
    const srcRoom = plan.rooms.find((r) => r.roomNumber === source.roomNumber);

    destRoom.grid[numericRow][numericCol] = {
      ...student,
      seat: seatLabel(numericRow, numericCol),
      row: numericRow,
      col: numericCol,
      examId: plan.examId,
      seatingPlanId: plan.id,
    };

    if (destOccupant) {
      srcRoom.grid[source.row][source.col] = {
        ...destOccupant,
        seat: seatLabel(source.row, source.col),
        row: source.row,
        col: source.col,
        examId: plan.examId,
        seatingPlanId: plan.id,
      };
    } else {
      srcRoom.grid[source.row][source.col] = null;
    }

    SeatingEngine.recalculate(plan);
    await syncPlanSeats(plan);
    plan.markModified("rooms");
    plan.markModified("conflicts");
    plan.markModified("stats");
    await plan.save();

    await Activity.create({
      message: `Admin force-applied override for ${rollNo} in ${plan.examName}`,
    });

    return res.json({
      ok: true,
      message: "Override applied (conflict retained).",
      plan: plan.toSafeObject(),
    });
  } catch (err) {
    console.error("Force override error:", err);
    return res.status(500).json({ ok: false, message: "Error applying force override." });
  }
});

/**
 * DELETE /api/seating/:examId
 */
router.delete("/:examId", requireAdmin, async (req, res) => {
  try {
    const target = req.params.examId.trim();
    await SeatingPlan.deleteMany({ examId: target });
    return res.json({ ok: true, message: "Seating plans cleared for exam." });
  } catch (err) {
    return res.status(500).json({ ok: false, message: "Error clearing plans." });
  }
});

/**
 * DELETE /api/seating
 */
router.delete("/", requireAdmin, async (req, res) => {
  try {
    await SeatingPlan.deleteMany({});
    await Activity.create({ message: "All seating plans purged from database" });
    return res.json({ ok: true, message: "All seating plans purged." });
  } catch (err) {
    return res.status(500).json({ ok: false, message: "Error purging seating plans." });
  }
});

/**
 * PUT /api/seating/:id/override
 * Admin only: Apply seat reallocation / override on a specific seating plan.
 * Conforms to Phase 2 teacher endpoint requirements:
 * PUT /api/seating/:id/override
 */
router.put("/:id/override", requireAdmin, async (req, res) => {
  try {
    const targetId = req.params.id.trim();
    let plan = await SeatingPlan.findOne({
      $or: [
        { id: targetId },
        { _id: mongoose.isValidObjectId(targetId) ? targetId : null },
      ],
    });

    if (!plan) {
      return res.status(404).json({ ok: false, message: "Seating plan not found." });
    }

    const { roomNumber, row, col, rollNo, force } = req.body;
    const numericRow = Number(row);
    const numericCol = Number(col);

    const destRoom = plan.rooms.find((r) => r.roomNumber === roomNumber);
    if (!destRoom) {
      return res.status(404).json({ ok: false, message: `Room ${roomNumber} not found in this seating plan.` });
    }

    if (numericRow >= destRoom.grid.length || numericCol >= (destRoom.grid[numericRow]?.length || 0)) {
      return res.status(400).json({ ok: false, message: "Selected seat does not exist in this room." });
    }

    // Locate student in current plan
    let source = null;
    let student = null;

    for (const rm of plan.rooms) {
      for (let r = 0; r < rm.grid.length; r++) {
        for (let c = 0; c < rm.grid[r].length; c++) {
          const seat = rm.grid[r][c];
          if (seat && String(seat.rollNo || "").toUpperCase() === String(rollNo || "").toUpperCase()) {
            source = { roomNumber: rm.roomNumber, row: r, col: c };
            student = seat;
            break;
          }
        }
        if (student) break;
      }
      if (student) break;
    }

    if (!student) {
      return res.status(404).json({ ok: false, message: "Student not found in this seating plan." });
    }

    // Check conflict unless force override is enabled
    if (!force) {
      const conflictsExist = SeatingEngine.wouldConflict(
        plan,
        roomNumber,
        numericRow,
        numericCol,
        student.subject,
        student.rollNo
      );

      if (conflictsExist) {
        const suggestions = SeatingEngine.suggestSeats(plan, student.subject, student.rollNo, 3);
        return res.status(200).json({
          ok: false,
          conflict: true,
          message: "Conflict warning: Placing student here creates an adjacent course code conflict.",
          suggestions,
        });
      }
    }

    // Execute swap/move
    const srcRoom = plan.rooms.find((r) => r.roomNumber === source.roomNumber);
    const destOccupant = destRoom.grid[numericRow][numericCol];

    destRoom.grid[numericRow][numericCol] = {
      ...student,
      seat: seatLabel(numericRow, numericCol),
      row: numericRow,
      col: numericCol,
      examId: plan.examId,
      seatingPlanId: plan.id,
    };

    if (destOccupant) {
      srcRoom.grid[source.row][source.col] = {
        ...destOccupant,
        seat: seatLabel(source.row, source.col),
        row: source.row,
        col: source.col,
        examId: plan.examId,
        seatingPlanId: plan.id,
      };
    } else {
      srcRoom.grid[source.row][source.col] = null;
    }

    SeatingEngine.recalculate(plan);
    await syncPlanSeats(plan);

    plan.markModified("rooms");
    plan.markModified("conflicts");
    plan.markModified("stats");
    await plan.save();
    await plan.populateExamAndStudents();

    await Activity.create({
      message: `Admin applied PUT override on plan ${plan.id} moving ${rollNo} to ${roomNumber}`,
    });

    return res.json({
      ok: true,
      message: "Seat override applied successfully.",
      plan: plan.toSafeObject(),
    });
  } catch (err) {
    console.error("PUT override seat error:", err);
    return res.status(500).json({ ok: false, message: "Error updating seat position." });
  }
});

module.exports = router;
