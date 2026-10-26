const express = require("express");
const router = express.Router();
const mongoose = require("mongoose");
const User = require("../models/User");
const Activity = require("../models/Activity");
const { requireAdmin, requireAuth, optionalAuth } = require("../middleware/auth");

/**
 * Universal query builder to match a student by _id (ObjectId), custom id, rollNo, or email
 */
function buildStudentQuery(target) {
  const clean = String(target || "").trim();
  const or = [
    { id: clean },
    { rollNo: clean },
    { rollNo: clean.toUpperCase() },
    { email: clean.toLowerCase() },
  ];
  if (mongoose.Types.ObjectId.isValid(clean)) {
    or.push({ _id: clean });
  }
  return { role: "student", $or: or };
}

/**
 * Helper to generate ID
 */
function generateId(prefix = "student") {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * GET /api/students
 * Retrieve students:
 * - Admin: all students (filterable with ?q=)
 * - Student: strictly own record only
 */
router.get("/", requireAuth, async (req, res) => {
  try {
    if (req.user.role === "student") {
      return res.json({
        ok: true,
        students: [req.user.toSafeObject()],
      });
    }

    const q = (req.query.q || "").trim();
    let query = { role: "student" };

    if (q) {
      const regex = new RegExp(q, "i");
      query = {
        role: "student",
        $or: [
          { name: regex },
          { rollNo: regex },
          { email: regex },
          { course: regex },
          { subject: regex },
        ],
      };
    }

    const students = await User.find(query).sort({ rollNo: 1 });
    return res.json({
      ok: true,
      students: students.map((s) => s.toSafeObject()),
    });
  } catch (err) {
    console.error("Get students error:", err);
    return res.status(500).json({ ok: false, message: "Error fetching student records." });
  }
});

/**
 * GET /api/students/:idOrRoll
 * Admin: any student
 * Student: only own record
 */
router.get("/:idOrRoll", requireAuth, async (req, res) => {
  try {
    const target = req.params.idOrRoll.trim();

    if (req.user.role === "student") {
      const isSelf =
        req.user.id === target ||
        req.user.rollNo.toUpperCase() === target.toUpperCase() ||
        req.user.email.toLowerCase() === target.toLowerCase();

      if (!isSelf) {
        return res.status(403).json({
          ok: false,
          message: "Access forbidden: You may only view your own student record.",
        });
      }
    }

    const student = await User.findOne(buildStudentQuery(target));

    if (!student) {
      return res.status(404).json({ ok: false, message: "Student record not found." });
    }

    return res.json({ ok: true, student: student.toSafeObject() });
  } catch (err) {
    console.error("Get student error:", err);
    return res.status(500).json({ ok: false, message: "Error fetching student." });
  }
});

/**
 * POST /api/students
 * Admin only: Create a new student
 */
router.post("/", requireAdmin, async (req, res) => {
  try {
    const { name, email, rollNo, password, mobile, course, semester, subject, disabled } = req.body;

    if (!name || !name.trim()) return res.status(400).json({ ok: false, message: "Full name is required." });
    if (!email || !email.trim()) return res.status(400).json({ ok: false, message: "Email address is required." });
    if (!rollNo || !rollNo.trim()) return res.status(400).json({ ok: false, message: "University roll number is required." });

    const cleanEmail = email.trim().toLowerCase();
    const cleanRollNo = rollNo.trim().toUpperCase();

    // Check duplicate
    const existing = await User.findOne({
      $or: [{ email: cleanEmail }, { rollNo: cleanRollNo }],
    });
    if (existing) {
      return res.status(400).json({ ok: false, message: "Student with this email or roll number already exists." });
    }

    const hasPassword = Boolean(password && password.trim());

    const student = new User({
      id: generateId("student"),
      name: name.trim(),
      email: cleanEmail,
      rollNo: cleanRollNo,
      password: hasPassword ? password.trim() : "",
      passwordSet: hasPassword,
      mobile: (mobile || "").trim(),
      course: (course || "CSE").trim(),
      semester: (semester || "5th Semester").trim(),
      subject: (subject || "CS301").trim().toUpperCase(),
      role: "student",
      disabled: disabled === true,
    });

    await student.save();
    await Activity.create({ message: `Student created by admin: ${student.name} (${student.rollNo})` });

    return res.status(201).json({
      ok: true,
      message: "Student created successfully.",
      student: student.toSafeObject(),
    });
  } catch (err) {
    console.error("Create student error:", err);
    return res.status(500).json({ ok: false, message: "Error creating student." });
  }
});

/**
 * PUT /api/students/:idOrRoll
 * Update student record:
 * - Admin: can update any student and all fields
 * - Student: strictly self only, restricted to profile fields (name, mobile, classBranch, avatar)
 */
router.put("/:idOrRoll", requireAuth, async (req, res) => {
  try {
    const target = req.params.idOrRoll.trim();
    let student = await User.findOne(buildStudentQuery(target));

    if (!student) {
      if (req.user.role === "admin" && (req.body.name || req.body.email || req.body.rollNo)) {
        const cleanRoll = (req.body.rollNo || target).trim().toUpperCase();
        const cleanEmail = (req.body.email || `${cleanRoll.toLowerCase()}@student.com`).trim().toLowerCase();
        student = new User({
          id: target.startsWith("student_") ? target : generateId("student"),
          name: (req.body.name || target).trim(),
          email: cleanEmail,
          rollNo: cleanRoll,
          course: (req.body.course || "CSE").trim(),
          semester: (req.body.semester || "5th Semester").trim(),
          subject: (req.body.subject || "CS301").trim().toUpperCase(),
          mobile: (req.body.mobile || "").trim(),
          disabled: req.body.disabled === true,
          role: "student",
          password: req.body.password ? req.body.password.trim() : "student123",
          passwordSet: true,
        });
        await student.save();
        await Activity.create({ message: `Student saved: ${student.name} (${student.rollNo})` });
        return res.json({
          ok: true,
          message: "Student updated successfully.",
          student: student.toSafeObject(),
        });
      }
      return res.status(404).json({ ok: false, message: "Student record not found." });
    }

    const isAdmin = req.user.role === "admin";
    const isSelf =
      req.user.id === student.id ||
      req.user.rollNo.toUpperCase() === student.rollNo.toUpperCase() ||
      req.user.email.toLowerCase() === student.email.toLowerCase();

    if (!isAdmin && !isSelf) {
      return res.status(403).json({
        ok: false,
        message: "Access forbidden: You may only update your own student record.",
      });
    }

    const updates = { ...req.body };
    delete updates.role; // Immutable role

    if (!isAdmin) {
      // Students can ONLY update personal profile fields
      if (updates.name !== undefined) student.name = updates.name.trim();
      if (updates.mobile !== undefined) student.mobile = updates.mobile.trim();
      if (updates.classBranch !== undefined) student.classBranch = updates.classBranch.trim();
      if (updates.avatar !== undefined) student.avatar = updates.avatar;

      await student.save();
      await Activity.create({ message: `Student profile updated by user: ${student.name} (${student.rollNo})` });

      return res.json({
        ok: true,
        message: "Profile updated successfully.",
        student: student.toSafeObject(),
      });
    }

    // Admin-level update
    if (updates.email && updates.email.trim().toLowerCase() !== student.email) {
      const emailConflict = await User.findOne({
        _id: { $ne: student._id },
        email: updates.email.trim().toLowerCase(),
      });
      if (emailConflict) {
        return res.status(400).json({ ok: false, message: "Another student with this email address already exists." });
      }
      student.email = updates.email.trim().toLowerCase();
    }

    if (updates.rollNo && updates.rollNo.trim().toUpperCase() !== student.rollNo) {
      const rollConflict = await User.findOne({
        _id: { $ne: student._id },
        rollNo: updates.rollNo.trim().toUpperCase(),
      });
      if (rollConflict) {
        return res.status(400).json({ ok: false, message: "Another student with this roll number already exists." });
      }
      student.rollNo = updates.rollNo.trim().toUpperCase();
    }

    if (updates.name !== undefined) student.name = updates.name.trim();
    if (updates.mobile !== undefined) student.mobile = updates.mobile.trim();
    if (updates.course !== undefined) student.course = updates.course.trim();
    if (updates.semester !== undefined) student.semester = updates.semester.trim();
    if (updates.subject !== undefined) student.subject = updates.subject.trim().toUpperCase();
    if (updates.avatar !== undefined) student.avatar = updates.avatar;
    if (updates.fatherName !== undefined) student.fatherName = updates.fatherName;
    if (updates.classBranch !== undefined) student.classBranch = updates.classBranch;
    if (updates.department !== undefined) student.department = updates.department;
    if (updates.coursesList !== undefined && Array.isArray(updates.coursesList)) student.coursesList = updates.coursesList;
    if (updates.disabled !== undefined) student.disabled = updates.disabled === true;

    if (updates.password && updates.password.trim() !== "") {
      student.password = updates.password.trim();
      student.passwordSet = true;
    }

    await student.save();
    await Activity.create({ message: `Student updated by admin: ${student.name} (${student.rollNo})` });

    return res.json({
      ok: true,
      message: "Student record updated successfully.",
      student: student.toSafeObject(),
    });
  } catch (err) {
    console.error("Update student error:", err);
    return res.status(500).json({ ok: false, message: "Error updating student record." });
  }
});

/**
 * DELETE /api/students/:idOrRoll
 * Admin only: Permanently delete student
 */
router.delete("/:idOrRoll", requireAdmin, async (req, res) => {
  try {
    const target = req.params.idOrRoll.trim();
    const student = await User.findOneAndDelete(buildStudentQuery(target));

    if (!student) {
      return res.status(404).json({ ok: false, message: "Student record not found." });
    }

    await Activity.create({ message: `Student deleted permanently: ${student.name} (${student.rollNo})` });
    return res.json({ ok: true, message: "Student deleted successfully." });
  } catch (err) {
    console.error("Delete student error:", err);
    return res.status(500).json({ ok: false, message: "Error deleting student." });
  }
});

/**
 * POST /api/students/import
 * Admin only: Bulk import JSON roster
 */
router.post("/import", requireAdmin, async (req, res) => {
  try {
    let data = req.body;
    if (typeof data === "string") {
      try {
        data = JSON.parse(data);
      } catch (e) {
        return res.status(400).json({ ok: false, message: "Invalid JSON format." });
      }
    }

    if (!Array.isArray(data)) {
      return res.status(400).json({ ok: false, message: "JSON root must be an array of student objects." });
    }

    const errors = [];
    const validStudents = [];

    // Preload existing rolls and emails for instant lookups
    const existing = await User.find({ role: "student" }).select("rollNo email");
    const existingRolls = new Set(existing.map((s) => (s.rollNo || "").toLowerCase()));
    const existingEmails = new Set(existing.map((s) => (s.email || "").toLowerCase()));

    const bcrypt = require("bcryptjs");

    for (let i = 0; i < data.length; i++) {
      const item = data[i];
      const label = `Row ${i + 1}`;
      if (!item || typeof item !== "object") {
        errors.push(`${label}: Invalid object format.`);
        continue;
      }

      const rollNo = (item.rollNo || "").toString().trim().toUpperCase();
      const name = (item.name || "").toString().trim();
      const email = (item.email || `${rollNo.toLowerCase()}@student.com`).toString().trim().toLowerCase();
      const password = item.password ? item.password.toString().trim() : "";
      const subject = (item.subject || "CS301").toString().trim().toUpperCase();

      if (!rollNo) {
        errors.push(`${label}: missing rollNo.`);
        continue;
      }
      if (!name) {
        errors.push(`${label} (${rollNo}): missing name.`);
        continue;
      }

      if (existingRolls.has(rollNo.toLowerCase())) {
        errors.push(`${label}: rollNo "${rollNo}" already exists in system.`);
        continue;
      }
      if (existingEmails.has(email)) {
        errors.push(`${label}: email "${email}" already exists in system.`);
        continue;
      }

      existingRolls.add(rollNo.toLowerCase());
      existingEmails.add(email);

      let hashedPassword = "";
      if (password) {
        const salt = await bcrypt.genSalt(10);
        hashedPassword = await bcrypt.hash(password, salt);
      }

      validStudents.push({
        id: item.id || generateId("student"),
        rollNo,
        name,
        email,
        password: hashedPassword,
        passwordSet: Boolean(password),
        mobile: (item.mobile || "").toString().trim(),
        course: (item.course || "CSE").toString().trim(),
        semester: (item.semester || "5th Semester").toString().trim(),
        subject,
        role: "student",
        disabled: item.disabled === true,
      });
    }

    if (validStudents.length > 0) {
      await User.insertMany(validStudents);
      await Activity.create({ message: `Imported ${validStudents.length} student records from JSON` });
    }

    return res.json({
      ok: validStudents.length > 0,
      count: validStudents.length,
      errors,
    });
  } catch (err) {
    console.error("Import students error:", err);
    return res.status(500).json({ ok: false, message: "Error importing student roster." });
  }
});

module.exports = router;
