const express = require("express");
const router = express.Router();
const bcrypt = require("bcryptjs");
const User = require("../models/User");
const Room = require("../models/Room");
const Exam = require("../models/Exam");
const SeatingPlan = require("../models/SeatingPlan");
const Complaint = require("../models/Complaint");
const Activity = require("../models/Activity");
const { requireAdmin, requireAuth } = require("../middleware/auth");

/**
 * GET /api/system/stats
 * Telemetry and dashboard stats
 */
router.get("/stats", requireAuth, async (req, res) => {
  try {
    const students = await User.find({ role: "student" });
    const rooms = await Room.find();
    const exams = await Exam.find();
    const activePlan = await SeatingPlan.findOne({ isActive: true });

    const totalSeats = rooms.reduce((sum, r) => sum + r.capacity, 0);
    const conflicts = activePlan ? activePlan.stats.totalConflicts : 0;
    const unassigned = activePlan ? activePlan.stats.unassignedCount : students.length;
    const assignedStudents = activePlan ? students.length - unassigned : 0;
    const roomsUsed = activePlan ? activePlan.stats.roomsUsed : 0;

    let utilization = 0;
    if (totalSeats > 0 && activePlan) {
      utilization = Number(((assignedStudents / totalSeats) * 100).toFixed(1));
    }

    const activeStudents = students.filter((s) => !s.disabled).length;
    const disabledStudents = students.filter((s) => s.disabled).length;

    return res.json({
      ok: true,
      stats: {
        totalStudents: students.length,
        activeStudents,
        disabledStudents,
        totalRooms: rooms.length,
        totalSeats,
        totalExams: exams.length,
        conflicts,
        unassigned,
        assignedStudents,
        roomsUsed,
        utilization,
        hasPlan: !!activePlan,
        plan: activePlan ? activePlan.toSafeObject() : null,
      },
    });
  } catch (err) {
    console.error("System stats error:", err);
    return res.status(500).json({ ok: false, message: "Error fetching system statistics." });
  }
});

/**
 * POST /api/system/seed
 * Seed the benchmark dataset (10 lecture halls, 500 students, 3 exams)
 */
router.post("/seed", requireAdmin, async (req, res) => {
  if (process.env.NODE_ENV === "production") {
    return res.status(403).json({ ok: false, message: "Seed operations are prohibited in production." });
  }
  try {
    // 1. Rooms
    const roomTemplates = [
      { roomNumber: "LH-101", rows: 5, cols: 10, capacity: 50 },
      { roomNumber: "LH-102", rows: 5, cols: 10, capacity: 50 },
      { roomNumber: "LH-103", rows: 5, cols: 10, capacity: 50 },
      { roomNumber: "LH-104", rows: 5, cols: 10, capacity: 50 },
      { roomNumber: "LH-105", rows: 5, cols: 10, capacity: 50 },
      { roomNumber: "LH-106", rows: 5, cols: 10, capacity: 50 },
      { roomNumber: "LH-107", rows: 5, cols: 10, capacity: 50 },
      { roomNumber: "LH-108", rows: 5, cols: 10, capacity: 50 },
      { roomNumber: "LH-109", rows: 5, cols: 10, capacity: 50 },
      { roomNumber: "LH-110", rows: 5, cols: 10, capacity: 50 },
    ];

    for (const rt of roomTemplates) {
      await Room.findOneAndUpdate(
        { roomNumber: rt.roomNumber },
        rt,
        { upsert: true, new: true }
      );
    }

    // 2. Exams
    const examTemplates = [
      {
        id: "exam_cndc",
        name: "CNDC",
        date: "2026-08-26",
        time: "15:03",
        semester: "5th Semester",
        duration: "2 Hours",
      },
      {
        id: "exam_pa",
        name: "PA",
        date: "2026-08-29",
        time: "10:08",
        semester: "5th Semester",
        duration: "2 Hours",
      },
      {
        id: "exam_dbms",
        name: "DBMS",
        date: "2026-09-02",
        time: "10:00",
        semester: "5th Semester",
        duration: "2 Hours",
      },
    ];

    for (const et of examTemplates) {
      await Exam.findOneAndUpdate({ id: et.id }, et, { upsert: true, new: true });
    }

    // 3. Featured candidate: Harnoor Kaur (pre-hashed password)
    const salt = await bcrypt.genSalt(10);
    const hashedStudentPassword = await bcrypt.hash("student123", salt);

    await User.findOneAndUpdate(
      { email: "harnoor@student.com" },
      {
        id: "student_harnoor",
        name: "HARNOOR KAUR",
        email: "harnoor@student.com",
        rollNo: "2410992925",
        fatherName: "Mr. SATINDER SINGH",
        classBranch: "2024-BE-CSE-AI-4 SEM",
        department: "Department of Computer Science & Engineering (Artificial Intelligence & Machine Learning)",
        coursesList: ["24APS4101", "24CAI0201", "24CAI0202", "24CAI0203", "24CAI0204", "24UNI0124", "25MOC0136", "25MOC0137", "25MOC0138", "25MOC0139", "Curriculum"],
        password: hashedStudentPassword,
        passwordSet: true,
        mobile: "9876543210",
        course: "CSE-AI",
        semester: "4th Semester",
        subject: "24CAI0201",
        role: "student",
        disabled: false,
      },
      { upsert: true, new: true }
    );

    // 4. Benchmark 500 Students (if not already present)
    const existingCount = await User.countDocuments({ role: "student" });
    if (existingCount < 100) {
      const subjects = ["CS301", "MA201", "PH201", "EC201"];
      const firstNames = [
        "Rahul", "Aman", "Priya", "Sneha", "Vikram", "Anjali", "Karan", "Neha",
        "Rohit", "Isha", "Aditya", "Pooja", "Manish", "Kavya", "Arjun", "Simran",
        "Yash", "Riya", "Nikhil", "Tanya", "Suresh", "Meera", "Deepak", "Ananya",
        "Varun", "Shreya", "Gaurav", "Divya", "Sameer", "Nisha"
      ];

      const batch = [];
      let rollCounter = 101;

      for (let i = 0; i < 500; i++) {
        const firstName = firstNames[i % firstNames.length];
        const name = firstName + (i >= firstNames.length ? ` ${Math.floor(i / firstNames.length) + 1}` : "");
        const subject = subjects[i % subjects.length];
        const rollNo = `2410992${rollCounter}`;

        let email = "";
        if (i === 0) email = "rahul@student.com";
        else if (i === 1) email = "aman@student.com";
        else if (i === 2) email = "priya@student.com";
        else if (i === 3) email = "disabled@student.com";
        else email = `${firstName.toLowerCase()}${rollCounter}@student.com`;

        batch.push({
          id: `student_${rollCounter}`,
          name,
          email,
          rollNo,
          fatherName: "Mr. RAJESH SHARMA",
          classBranch: i % 2 === 0 ? "2024-BE-CSE-AI-4 SEM" : "2024-BE-CSE-4 SEM",
          department: "Department of Computer Science & Engineering (Artificial Intelligence & Machine Learning)",
          coursesList: ["24APS4101", "24CAI0201", "24CAI0202", "24CAI0203", "24CAI0204", "24UNI0124", "25MOC0136", "25MOC0137", "25MOC0138", "25MOC0139", "Curriculum"],
          password: hashedStudentPassword,
          passwordSet: true,
          mobile: "9876543210",
          course: i % 2 === 0 ? "CSE-AI" : "CSE",
          semester: "4th Semester",
          subject,
          role: "student",
          disabled: i === 3,
        });
        rollCounter++;
      }

      await User.insertMany(batch);
    }

    await Activity.create({ message: "Benchmark dataset seeded (10 rooms, 500 students, 3 exams)" });

    return res.json({
      ok: true,
      message: "Benchmark dataset successfully seeded into MongoDB.",
    });
  } catch (err) {
    console.error("Seed error:", err);
    return res.status(500).json({ ok: false, message: "Error seeding benchmark dataset." });
  }
});

/**
 * POST /api/system/purge
 * Admin only: Purge all platform data
 */
router.post("/purge", requireAdmin, async (req, res) => {
  if (process.env.NODE_ENV === "production") {
    return res.status(403).json({ ok: false, message: "Purge operations are prohibited in production." });
  }
  try {
    await User.deleteMany({ role: "student" });
    await Room.deleteMany({});
    await Exam.deleteMany({});
    await SeatingPlan.deleteMany({});
    await Complaint.deleteMany({});
    await Activity.deleteMany({});

    return res.json({ ok: true, message: "All student, room, exam, and seating plan data purged." });
  } catch (err) {
    console.error("Purge error:", err);
    return res.status(500).json({ ok: false, message: "Error purging database." });
  }
});

module.exports = router;
