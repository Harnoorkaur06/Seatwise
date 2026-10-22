const express = require("express");
const router = express.Router();
const User = require("../models/User");
const Room = require("../models/Room");
const Exam = require("../models/Exam");
const SeatingPlan = require("../models/SeatingPlan");
const Complaint = require("../models/Complaint");
const Activity = require("../models/Activity");
const { requireAdmin } = require("../middleware/auth");

/**
 * POST /api/migrate/import-browser-data
 * Safe, repeatable, idempotent migration of browser LocalStorage into MongoDB.
 * - Requires Administrator authorization
 * - Prevents duplicate imports based on primary business keys
 * - Never drops or overwrites existing MongoDB records without explicit instruction
 * - Validates records and tracks imported, skipped, and rejected counts
 * - Never deletes client data
 */
router.post("/import-browser-data", requireAdmin, async (req, res) => {
  try {
    const { students, rooms, exams, seatingPlans, complaints, activity } = req.body;

    const report = {
      imported: { students: 0, rooms: 0, exams: 0, seatingPlans: 0, complaints: 0, activity: 0 },
      skipped: { students: 0, rooms: 0, exams: 0, seatingPlans: 0, complaints: 0, activity: 0 },
      rejected: { students: 0, rooms: 0, exams: 0, seatingPlans: 0, complaints: 0, activity: 0 },
      errors: [],
    };

    // 1. Migrate Students
    if (Array.isArray(students) && students.length > 0) {
      for (const [i, s] of students.entries()) {
        if (!s || typeof s !== "object") {
          report.rejected.students++;
          report.errors.push(`Student #${i + 1}: Invalid object format.`);
          continue;
        }

        const roll = String(s.rollNo || "").trim().toUpperCase();
        const name = String(s.name || "").trim();
        const email = String(s.email || (roll ? `${roll.toLowerCase()}@student.com` : "")).trim().toLowerCase();

        if (!roll || !name) {
          report.rejected.students++;
          report.errors.push(`Student #${i + 1}: Missing roll number or full name.`);
          continue;
        }

        const exists = await User.findOne({
          role: "student",
          $or: [{ rollNo: roll }, { email }],
        });

        if (exists) {
          report.skipped.students++;
        } else {
          try {
            const newStudent = new User({
              id: s.id || `student_${roll}`,
              name,
              email,
              rollNo: roll,
              fatherName: s.fatherName || "Mr. SATINDER SINGH",
              classBranch: s.classBranch || (s.course ? `2024-BE-${s.course}-4 SEM` : "2024-BE-CSE-AI-4 SEM"),
              department: s.department || "Department of Computer Science & Engineering (Artificial Intelligence & Machine Learning)",
              coursesList: s.coursesList && Array.isArray(s.coursesList) && s.coursesList.length > 0 ? s.coursesList : undefined,
              password: s.password || "",
              passwordSet: Boolean(s.password),
              mobile: (s.mobile || "").trim(),
              course: (s.course || "CSE-AI").trim(),
              semester: (s.semester || "4th Semester").trim(),
              subject: (s.subject || "24CAI0201").trim().toUpperCase(),
              avatar: s.avatar || "",
              role: "student",
              disabled: s.disabled === true,
            });
            await newStudent.save();
            report.imported.students++;
          } catch (valErr) {
            report.rejected.students++;
            report.errors.push(`Student ${roll} validation error: ${valErr.message}`);
          }
        }
      }
    }

    // 2. Migrate Rooms
    if (Array.isArray(rooms) && rooms.length > 0) {
      for (const [i, r] of rooms.entries()) {
        if (!r || typeof r !== "object" || !r.roomNumber) {
          report.rejected.rooms++;
          report.errors.push(`Room #${i + 1}: Missing room number.`);
          continue;
        }

        const rmNum = String(r.roomNumber).trim().toUpperCase();
        const numRows = Number(r.rows);
        const numCols = Number(r.cols);

        if (!Number.isInteger(numRows) || !Number.isInteger(numCols) || numRows <= 0 || numCols <= 0) {
          report.rejected.rooms++;
          report.errors.push(`Room ${rmNum}: Invalid dimensions (${r.rows}x${r.cols}).`);
          continue;
        }

        const exists = await Room.findOne({ roomNumber: rmNum });
        if (exists) {
          report.skipped.rooms++;
        } else {
          try {
            const newRoom = new Room({
              roomNumber: rmNum,
              rows: numRows,
              cols: numCols,
              capacity: numRows * numCols,
            });
            await newRoom.save();
            report.imported.rooms++;
          } catch (valErr) {
            report.rejected.rooms++;
            report.errors.push(`Room ${rmNum} validation error: ${valErr.message}`);
          }
        }
      }
    }

    // 3. Migrate Exams
    if (Array.isArray(exams) && exams.length > 0) {
      for (const [i, e] of exams.entries()) {
        if (!e || typeof e !== "object" || !e.name) {
          report.rejected.exams++;
          report.errors.push(`Exam #${i + 1}: Missing examination name.`);
          continue;
        }

        const examId = e.id || `exam_${e.name.toLowerCase().replace(/[^a-z0-9]/g, "_")}`;
        const exists = await Exam.findOne({
          $or: [{ id: examId }, { name: e.name.trim(), date: e.date }],
        });

        if (exists) {
          report.skipped.exams++;
        } else {
          try {
            const newExam = new Exam({
              id: examId,
              name: e.name.trim(),
              date: e.date || new Date().toISOString().split("T")[0],
              time: e.time || "10:00",
              semester: e.semester || "5th Semester",
              duration: e.duration || "2 Hours",
            });
            await newExam.save();
            report.imported.exams++;
          } catch (valErr) {
            report.rejected.exams++;
            report.errors.push(`Exam ${e.name} error: ${valErr.message}`);
          }
        }
      }
    }

    // 4. Migrate Seating Plans
    if (Array.isArray(seatingPlans) && seatingPlans.length > 0) {
      for (const [i, p] of seatingPlans.entries()) {
        if (!p || typeof p !== "object" || !p.examId || !Array.isArray(p.rooms)) {
          report.rejected.seatingPlans++;
          report.errors.push(`Seating Plan #${i + 1}: Incomplete structure or missing rooms.`);
          continue;
        }

        const planId = p.id || `plan_${Date.now()}_${i}`;
        const exists = await SeatingPlan.findOne({
          $or: [
            { id: planId },
            { examId: p.examId, generation: p.generation || 1 },
          ],
        });

        if (exists) {
          report.skipped.seatingPlans++;
        } else {
          try {
            const newPlan = new SeatingPlan({
              id: planId,
              examId: p.examId,
              examName: p.examName || "Examination",
              generation: p.generation || 1,
              isActive: p.isActive !== false,
              generatedAt: p.generatedAt || new Date().toISOString(),
              rooms: p.rooms || [],
              unassigned: p.unassigned || [],
              conflicts: p.conflicts || [],
              stats: p.stats || {},
            });
            await newPlan.save();
            report.imported.seatingPlans++;
          } catch (valErr) {
            report.rejected.seatingPlans++;
            report.errors.push(`Seating plan error: ${valErr.message}`);
          }
        }
      }
    }

    // 5. Migrate Complaints
    if (Array.isArray(complaints) && complaints.length > 0) {
      for (const [i, c] of complaints.entries()) {
        if (!c || typeof c !== "object" || !c.subject) {
          report.rejected.complaints++;
          report.errors.push(`Complaint #${i + 1}: Missing subject.`);
          continue;
        }

        const cmplId = c.id || `cmpl_${Date.now()}_${i}`;
        const exists = await Complaint.findOne({ id: cmplId });

        if (exists) {
          report.skipped.complaints++;
        } else {
          try {
            const newComplaint = new Complaint({
              id: cmplId,
              userId: c.userId || "student_migrated",
              userName: c.userName || "Student",
              userEmail: c.userEmail || "",
              rollNo: c.rollNo || "",
              category: c.category || "Other",
              subject: c.subject.trim(),
              message: (c.message || "").trim(),
              status: c.status || "Pending",
              adminReply: c.adminReply || "",
              unread: c.unread === true,
              unreadReply: c.unreadReply === true,
            });
            await newComplaint.save();
            report.imported.complaints++;
          } catch (valErr) {
            report.rejected.complaints++;
            report.errors.push(`Complaint error: ${valErr.message}`);
          }
        }
      }
    }

    // 6. Migrate Activity Log
    if (Array.isArray(activity) && activity.length > 0) {
      for (const a of activity) {
        if (!a || typeof a !== "object") continue;
        const text = a.message || a.text;
        if (!text) continue;

        const exists = await Activity.findOne({ message: text, time: a.time });
        if (exists) {
          report.skipped.activity++;
        } else {
          try {
            await Activity.create({ message: text, time: a.time || new Date().toISOString() });
            report.imported.activity++;
          } catch (valErr) {
            report.rejected.activity++;
          }
        }
      }
    }

    const totalImported = Object.values(report.imported).reduce((a, b) => a + b, 0);
    const totalSkipped = Object.values(report.skipped).reduce((a, b) => a + b, 0);
    const totalRejected = Object.values(report.rejected).reduce((a, b) => a + b, 0);

    await Activity.create({
      message: `Data migration: imported ${totalImported} items, skipped ${totalSkipped} duplicates, rejected ${totalRejected}`,
    });

    return res.json({
      ok: true,
      message: `Migration completed: ${totalImported} records imported, ${totalSkipped} duplicates skipped, ${totalRejected} rejected.`,
      report,
    });
  } catch (err) {
    console.error("Migration error:", err);
    return res.status(500).json({ ok: false, message: "Server error during data migration." });
  }
});

module.exports = router;
