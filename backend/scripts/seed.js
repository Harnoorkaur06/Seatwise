/**
 * scripts/seed.js
 * Safe, development-only, non-destructive data seeder for SEATWISE.
 * - Idempotent: checks for existence before adding records
 * - Non-destructive: never drops collections or overwrites existing records
 * - Refuses to run if NODE_ENV=production
 */

const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "../.env") });
const { connectDB, closeDB } = require("../utils/db");
const User = require("../models/User");
const Room = require("../models/Room");
const Exam = require("../models/Exam");
const Activity = require("../models/Activity");

async function seedBaselineData() {
  if (process.env.NODE_ENV === "production") {
    return;
  }

  // 1. Ensure Administrator Account
  const adminExists = await User.findOne({ role: "admin" });
  if (!adminExists) {
    const admin = new User({
      id: "admin",
      name: "Administrator",
      email: "admin@seatwise.local",
      role: "admin",
      password: process.env.ADMIN_PASSWORD || "seatwise@admin123",
      passwordSet: true,
    });
    await admin.save();
    console.log("  ✓ Created default administrator account (username: admin)");
  }

  // 2. Ensure 10 Standard Lecture Halls
  const roomCount = await Room.countDocuments();
  if (roomCount === 0) {
    const initialRooms = [
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
    await Room.insertMany(initialRooms);
    console.log(`  ✓ Seeded ${initialRooms.length} lecture halls`);
  }

  // 3. Ensure Examination Schedule Slots
  const examCount = await Exam.countDocuments();
  if (examCount === 0) {
    const upcomingDate = new Date(Date.now() + 2 * 24 * 3600 * 1000).toISOString().split("T")[0];
    const initialExams = [
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
      {
        id: "exam_ai",
        name: "AI",
        date: upcomingDate,
        time: "09:30",
        semester: "5th Semester",
        duration: "2 Hours",
      },
    ];
    await Exam.insertMany(initialExams);
    console.log(`  ✓ Seeded ${initialExams.length} examinations`);
  }

  // 4. Ensure Student Accounts (Featured Candidate & Sample Roster)
  const studentCount = await User.countDocuments({ role: "student" });
  if (studentCount === 0) {
    const bcrypt = require("bcryptjs");
    const defaultSalt = await bcrypt.genSalt(10);
    const hashedStudentPassword = await bcrypt.hash("student123", defaultSalt);

    const students = [];

    // Candidate: Harnoor Kaur
    students.push({
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
    });

    const subjects = ["CS301", "MA201", "PH201", "EC201"];
    const firstNames = [
      "Rahul", "Aman", "Priya", "Sneha", "Vikram", "Anjali", "Karan", "Neha",
      "Rohit", "Isha", "Aditya", "Pooja", "Manish", "Kavya", "Arjun", "Simran",
      "Yash", "Riya", "Nikhil", "Tanya", "Suresh", "Meera", "Deepak", "Ananya",
      "Varun", "Shreya", "Gaurav", "Divya", "Sameer", "Nisha"
    ];

    for (let i = 0; i < 50; i++) {
      const firstName = firstNames[i % firstNames.length];
      const name = firstName + (i >= firstNames.length ? ` ${Math.floor(i / firstNames.length) + 1}` : "");
      const subject = subjects[i % subjects.length];
      const rollCounter = 101 + i;
      const rollNo = `2410992${rollCounter}`;

      let email = "";
      if (i === 0) email = "rahul@student.com";
      else if (i === 1) email = "aman@student.com";
      else if (i === 2) email = "priya@student.com";
      else if (i === 3) email = "disabled@student.com";
      else email = `${firstName.toLowerCase()}${rollCounter}@student.com`;

      students.push({
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
    }

    await User.insertMany(students);
    console.log(`  ✓ Seeded ${students.length} student records`);
    await Activity.create({ message: "Development benchmark data initialized in MongoDB" });
  }
}

async function runSeed() {
  if (process.env.NODE_ENV === "production") {
    console.error("SAFETY ERROR: Cannot run dev seeder in production environment!");
    process.exit(1);
  }

  console.log("🌱 Starting safe development seeder for SEATWISE...");

  try {
    await connectDB();
    await seedBaselineData();
    console.log("✅ Development database seeding complete.");
  } catch (err) {
    console.error("❌ Seeding error:", err);
  } finally {
    await closeDB();
  }
}

if (require.main === module) {
  runSeed();
}

module.exports = { runSeed, seedBaselineData };
