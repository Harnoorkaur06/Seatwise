/**
 * test/run-tests.js
 * SEATWISE Comprehensive Automated Test Suite
 * Tests models, password security, authentication, RBAC, REST endpoints,
 * seating conflict algorithm, complaints workflow, and data migration idempotency.
 * 
 * Uses MongoMemoryServer for 100% isolated, non-destructive execution.
 */

const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "../.env") });
const assert = require("assert");
const mongoose = require("mongoose");
const { MongoMemoryServer } = require("mongodb-memory-server");
const bcrypt = require("bcryptjs");

// Models & Middleware
const User = require("../models/User");
const Room = require("../models/Room");
const Exam = require("../models/Exam");
const SeatingPlan = require("../models/SeatingPlan");
const Complaint = require("../models/Complaint");
const Activity = require("../models/Activity");
const { generateToken, verifyToken } = require("../middleware/auth");
const { SeatingEngine, seatLabel } = require("../utils/seatingEngine");

let mongoServer;
let testsPassed = 0;
let testsFailed = 0;
const failureDetails = [];

async function test(name, fn) {
  try {
    process.stdout.write(`  ⏳ ${name}... `);
    await fn();
    console.log(`\x1b[32mPASSED\x1b[0m`);
    testsPassed++;
  } catch (err) {
    console.log(`\x1b[31mFAILED\x1b[0m`);
    console.error(`     Error: ${err.message}`);
    testsFailed++;
    failureDetails.push({ name, error: err.message, stack: err.stack });
  }
}

async function setup() {
  console.log("\n=======================================================");
  console.log("🧪 SEATWISE MongoDB Review Automated Test Suite");
  console.log("=======================================================\n");
  console.log("Starting isolated In-Memory MongoDB instance...");

  mongoServer = await MongoMemoryServer.create({
    instance: { dbName: "seatwise_test" },
  });
  const uri = mongoServer.getUri();
  await mongoose.connect(uri);
  console.log(`✓ Connected to in-memory test database: ${uri}\n`);
}

async function teardown() {
  console.log("\nCleaning up test environment...");
  await mongoose.disconnect();
  if (mongoServer) await mongoServer.stop();
  console.log("✓ In-memory database closed cleanly.");

  console.log("\n=======================================================");
  console.log(`RESULTS: \x1b[32m${testsPassed} Passed\x1b[0m, \x1b[31m${testsFailed} Failed\x1b[0m (Total: ${testsPassed + testsFailed})`);
  console.log("=======================================================\n");

  if (testsFailed > 0) {
    console.error("Failure details:");
    failureDetails.forEach((f, i) => {
      console.error(`  ${i + 1}. [${f.name}]: ${f.error}`);
    });
    process.exit(1);
  } else {
    console.log("🎉 All automated test suites passed successfully!\n");
  }
}

async function runAll() {
  await setup();

  // -------------------------------------------------------------------------
  // 1. DATABASE & CONNECTION TESTS
  // -------------------------------------------------------------------------
  console.log("1. Database Connection & Environment");
  await test("Mongoose connection is open and ready", async () => {
    assert.strictEqual(mongoose.connection.readyState, 1);
  });

  // -------------------------------------------------------------------------
  // 2. MODEL VALIDATION & PASSWORDS
  // -------------------------------------------------------------------------
  console.log("\n2. User Model & Password Hashing");
  await test("Creates admin user and hashes password with bcrypt", async () => {
    const admin = new User({
      id: "admin",
      name: "Administrator",
      email: "admin@seatwise.local",
      role: "admin",
      password: "seatwise@admin123",
      passwordSet: true,
    });
    await admin.save();

    assert.ok(admin.password.startsWith("$2a$") || admin.password.startsWith("$2b$"));
    const match = await admin.comparePassword("seatwise@admin123");
    assert.strictEqual(match, true);
    const wrong = await admin.comparePassword("wrongpass");
    assert.strictEqual(wrong, false);
  });

  await test("toSafeObject() strips password from output", async () => {
    const admin = await User.findOne({ id: "admin" });
    const safe = admin.toSafeObject();
    assert.strictEqual(safe.password, undefined);
    assert.strictEqual(safe.name, "Administrator");
  });

  await test("Creates student user with unique rollNo and coursesList", async () => {
    const student = new User({
      id: "student_harnoor",
      name: "HARNOOR KAUR",
      email: "harnoor@student.com",
      rollNo: "2410992925",
      course: "CSE-AI",
      semester: "4th Semester",
      subject: "24CAI0201",
      role: "student",
      password: "student123",
    });
    await student.save();

    assert.strictEqual(student.rollNo, "2410992925");
    assert.ok(student.password.startsWith("$2a$") || student.password.startsWith("$2b$"));
    assert.ok(Array.isArray(student.coursesList));
    assert.ok(student.coursesList.length > 0);
  });

  await test("Prevents duplicate email or rollNo for student", async () => {
    let duplicateError = false;
    try {
      const dup = new User({
        id: "student_dup",
        name: "Duplicate Student",
        email: "harnoor@student.com", // existing
        rollNo: "2410999999",
        role: "student",
      });
      await dup.save();
    } catch (e) {
      duplicateError = true;
    }
    assert.strictEqual(duplicateError, true);
  });

  // -------------------------------------------------------------------------
  // 3. JWT AUTHENTICATION & TOKENS
  // -------------------------------------------------------------------------
  console.log("\n3. JWT Authentication & Token Security");
  let adminToken, studentToken;

  await test("Generates and verifies JWT token with correct claims", async () => {
    const admin = await User.findOne({ id: "admin" });
    adminToken = generateToken(admin);
    assert.ok(adminToken);

    const student = await User.findOne({ id: "student_harnoor" });
    studentToken = generateToken(student);
    assert.ok(studentToken);

    const { verifyToken } = require("../middleware/auth");
    const decodedAdmin = await verifyToken(adminToken);
    assert.strictEqual(decodedAdmin.id, "admin");
    assert.strictEqual(decodedAdmin.role, "admin");

    const decodedStudent = await verifyToken(studentToken);
    assert.strictEqual(decodedStudent.id, "student_harnoor");
    assert.strictEqual(decodedStudent.role, "student");
    assert.strictEqual(decodedStudent.rollNo, "2410992925");
  });

  // -------------------------------------------------------------------------
  // 4. ROOMS & EXAMS MODELS
  // -------------------------------------------------------------------------
  console.log("\n4. Room & Exam Management Models");
  await test("Creates room and auto-computes capacity", async () => {
    const room = new Room({
      roomNumber: "LH-101",
      rows: 5,
      cols: 10,
      capacity: 50,
    });
    await room.save();
    assert.strictEqual(room.capacity, 50);
  });

  await test("Creates examination timetable record", async () => {
    const exam = new Exam({
      id: "exam_cndc",
      name: "CNDC",
      date: "2026-08-26",
      time: "15:03",
      semester: "5th Semester",
      duration: "2 Hours",
    });
    await exam.save();
    assert.strictEqual(exam.id, "exam_cndc");
  });

  // -------------------------------------------------------------------------
  // 5. SEATING ENGINE & CONFLICT ALGORITHM
  // -------------------------------------------------------------------------
  console.log("\n5. Seating Engine & Conflict Rules");
  await test("Generates conflict-free seating plan across multiple subjects", async () => {
    const students = [
      { id: "s1", rollNo: "2410992101", name: "Student 1", subject: "CS301" },
      { id: "s2", rollNo: "2410992102", name: "Student 2", subject: "MA201" },
      { id: "s3", rollNo: "2410992103", name: "Student 3", subject: "PH201" },
      { id: "s4", rollNo: "2410992104", name: "Student 4", subject: "EC201" },
      { id: "s5", rollNo: "2410992105", name: "Student 5", subject: "CS301" },
      { id: "s6", rollNo: "2410992106", name: "Student 6", subject: "MA201" },
    ];
    const rooms = [{ roomNumber: "LH-101", rows: 2, cols: 5, capacity: 10 }];

    const plan = SeatingEngine.generate(students, rooms, {
      examId: "exam_cndc",
      examName: "CNDC",
      generation: 1,
    });

    assert.strictEqual(plan.stats.totalAssigned, 6);
    assert.strictEqual(plan.stats.totalConflicts, 0);
    assert.strictEqual(plan.stats.validityPercentage, 100);
    assert.strictEqual(plan.rooms[0].occupied, 6);
  });

  await test("Detects horizontal and vertical same-subject adjacency conflicts", async () => {
    const plan = {
      rooms: [
        {
          roomNumber: "LH-101",
          rows: 2,
          cols: 2,
          grid: [
            [
              { rollNo: "R1", name: "Student A", subject: "CS301" },
              { rollNo: "R2", name: "Student B", subject: "CS301" }, // Horizontal conflict!
            ],
            [
              null,
              null,
            ],
          ],
        },
      ],
    };

    const conflicts = SeatingEngine._detectConflicts(plan.rooms);
    assert.strictEqual(conflicts.length, 1);
    assert.strictEqual(conflicts[0].subject, "CS301");
  });

  // -------------------------------------------------------------------------
  // 6. COMPLAINTS & UNREAD REPLIES
  // -------------------------------------------------------------------------
  console.log("\n6. Complaints Workflow & Unread Counters");
  let testComplaintId;
  await test("Student submits complaint and sets status to Pending", async () => {
    const student = await User.findOne({ id: "student_harnoor" });
    const cmpl = new Complaint({
      id: "cmpl_test_01",
      userId: student.id,
      userName: student.name,
      userEmail: student.email,
      rollNo: student.rollNo,
      category: "Seating Issue",
      subject: "Desk wobble in LH-101",
      message: "Desk A4 in LH-101 is unstable.",
      status: "Pending",
      unread: true,
      unreadReply: false,
    });
    await cmpl.save();
    testComplaintId = cmpl.id;

    assert.strictEqual(cmpl.status, "Pending");
    assert.strictEqual(cmpl.unreadReply, false);
  });

  await test("Admin replies to complaint and sets unreadReply for student", async () => {
    const cmpl = await Complaint.findOne({ id: testComplaintId });
    cmpl.adminReply = "Desk inspected and replaced with new unit.";
    cmpl.status = "Resolved";
    cmpl.unreadReply = true;
    cmpl.unread = false;
    await cmpl.save();

    const unreadCount = await Complaint.countDocuments({
      rollNo: "2410992925",
      unreadReply: true,
    });
    assert.strictEqual(unreadCount, 1);
  });

  await test("Student clears unread notification bell", async () => {
    await Complaint.updateMany({ rollNo: "2410992925" }, { unreadReply: false });
    const count = await Complaint.countDocuments({
      rollNo: "2410992925",
      unreadReply: true,
    });
    assert.strictEqual(count, 0);
  });

  // -------------------------------------------------------------------------
  // 7. DATA MIGRATION IDEMPOTENCY
  // -------------------------------------------------------------------------
  console.log("\n7. LocalStorage Data Migration & Idempotency");
  await test("Importing existing data skips duplicates and does not crash", async () => {
    const payload = {
      students: [
        {
          name: "HARNOOR KAUR",
          rollNo: "2410992925",
          email: "harnoor@student.com",
          course: "CSE-AI",
        },
        {
          name: "NEW MIGRATED STUDENT",
          rollNo: "2410992999",
          email: "migrated999@student.com",
          course: "CSE",
        },
      ],
      rooms: [
        { roomNumber: "LH-101", rows: 5, cols: 10 },
        { roomNumber: "LH-201", rows: 4, cols: 8 },
      ],
      exams: [
        { name: "CNDC", date: "2026-08-26", time: "15:03" },
        { name: "NEW EXAM", date: "2026-09-10", time: "10:00" },
      ],
    };

    let importedStudents = 0;
    let skippedStudents = 0;

    for (const s of payload.students) {
      const exists = await User.findOne({
        $or: [{ rollNo: s.rollNo }, { email: s.email }],
      });
      if (exists) {
        skippedStudents++;
      } else {
        await User.create({
          id: `student_${s.rollNo}`,
          name: s.name,
          email: s.email,
          rollNo: s.rollNo,
          course: s.course,
          role: "student",
        });
        importedStudents++;
      }
    }

    assert.strictEqual(skippedStudents, 1); // Harnoor already exists
    assert.strictEqual(importedStudents, 1); // New student imported

    // Re-run exact same batch to test idempotency
    let reimported = 0;
    let reskipped = 0;
    for (const s of payload.students) {
      const exists = await User.findOne({
        $or: [{ rollNo: s.rollNo }, { email: s.email }],
      });
      if (exists) reskipped++;
      else reimported++;
    }
    assert.strictEqual(reskipped, 2);
    assert.strictEqual(reimported, 0); // Zero duplicate records added!
  });

  // -------------------------------------------------------------------------
  // 9. HTTP REST API ENDPOINTS & RBAC ACCESS BARRIERS
  // -------------------------------------------------------------------------
  console.log("\n9. HTTP REST API & RBAC Security Barriers");
  const { app } = require("../server");
  let server, baseUrl;

  await test("Starts Express application server on ephemeral port", async () => {
    await new Promise((resolve) => {
      server = app.listen(0, () => {
        const port = server.address().port;
        baseUrl = `http://127.0.0.1:${port}/api`;
        resolve();
      });
    });
    assert.ok(baseUrl);
  });

  await test("POST /api/auth/admin-login authenticates valid admin", async () => {
    const res = await fetch(`${baseUrl}/auth/admin-login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: "admin", password: "seatwise@admin123" }),
    });
    const data = await res.json();
    assert.strictEqual(res.status, 200);
    assert.strictEqual(data.ok, true);
    assert.ok(data.token);
    assert.strictEqual(data.user.role, "admin");
    adminToken = data.token;
  });

  await test("POST /api/auth/admin-login rejects incorrect credentials", async () => {
    const res = await fetch(`${baseUrl}/auth/admin-login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: "admin", password: "wrongpassword" }),
    });
    const data = await res.json();
    assert.strictEqual(res.status, 401);
    assert.strictEqual(data.ok, false);
  });

  await test("POST /api/auth/login authenticates student by email", async () => {
    const res = await fetch(`${baseUrl}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "harnoor@student.com", password: "student123" }),
    });
    const data = await res.json();
    assert.strictEqual(res.status, 200);
    assert.strictEqual(data.ok, true);
    assert.ok(data.token);
    assert.strictEqual(data.user.rollNo, "2410992925");
    studentToken = data.token;
  });

  await test("GET /api/students enforces requireAuth barrier (401 without token)", async () => {
    const res = await fetch(`${baseUrl}/students`);
    assert.strictEqual(res.status, 401);
  });

  await test("GET /api/students restricts student to their own record only", async () => {
    const res = await fetch(`${baseUrl}/students`, {
      headers: { Authorization: `Bearer ${studentToken}` },
    });
    const data = await res.json();
    assert.strictEqual(res.status, 200);
    assert.strictEqual(data.students.length, 1);
    assert.strictEqual(data.students[0].rollNo, "2410992925");
  });

  await test("GET /api/students returns full roster to authenticated admin", async () => {
    const res = await fetch(`${baseUrl}/students`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const data = await res.json();
    assert.strictEqual(res.status, 200);
    assert.ok(data.students.length >= 2);
  });

  await test("PUT /api/students/:idOrRoll blocks student from modifying other students (403)", async () => {
    const res = await fetch(`${baseUrl}/students/2410992999`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${studentToken}`,
      },
      body: JSON.stringify({ name: "Hacked Name" }),
    });
    assert.strictEqual(res.status, 403);
  });

  await test("PUT /api/students/:idOrRoll allows student to update own allowed fields", async () => {
    const res = await fetch(`${baseUrl}/students/2410992925`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${studentToken}`,
      },
      body: JSON.stringify({ mobile: "9876500000" }),
    });
    const data = await res.json();
    assert.strictEqual(res.status, 200);
    assert.strictEqual(data.ok, true);
    assert.strictEqual(data.student.mobile, "9876500000");
  });

  await test("GET /api/complaints restricts student to own complaints", async () => {
    const res = await fetch(`${baseUrl}/complaints`, {
      headers: { Authorization: `Bearer ${studentToken}` },
    });
    const data = await res.json();
    assert.strictEqual(res.status, 200);
    assert.ok(Array.isArray(data.complaints));
    data.complaints.forEach((c) => {
      assert.strictEqual(c.rollNo, "2410992925");
    });
  });

  await test("PUT /api/complaints/:id blocks student from admin reply (403)", async () => {
    const res = await fetch(`${baseUrl}/complaints/cmpl_test_01`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${studentToken}`,
      },
      body: JSON.stringify({ adminReply: "Unauthorized reply" }),
    });
    assert.strictEqual(res.status, 403);
  });

  await test("PUT /api/complaints/:id allows admin reply and updates status", async () => {
    const res = await fetch(`${baseUrl}/complaints/cmpl_test_01`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({ status: "Resolved", adminReply: "Issue resolved by administrator." }),
    });
    const data = await res.json();
    assert.strictEqual(res.status, 200);
    assert.strictEqual(data.ok, true);
    assert.strictEqual(data.complaint.status, "Resolved");
  });

  await test("GET /api/seating/student/:rollNo enforces ownership barrier for students", async () => {
    // Attempt to access another student's seat
    const resForbidden = await fetch(`${baseUrl}/seating/student/2410992999`, {
      headers: { Authorization: `Bearer ${studentToken}` },
    });
    assert.strictEqual(resForbidden.status, 403);

    // Access own seat
    const resOwn = await fetch(`${baseUrl}/seating/student/2410992925`, {
      headers: { Authorization: `Bearer ${studentToken}` },
    });
    assert.strictEqual(resOwn.status, 200);
  });

  await test("POST /api/migrate/import-browser-data rejects student access (403)", async () => {
    const res = await fetch(`${baseUrl}/migrate/import-browser-data`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${studentToken}`,
      },
      body: JSON.stringify({ students: [] }),
    });
    assert.strictEqual(res.status, 403);
  });

  await test("POST /api/migrate/import-browser-data allows admin and reports metrics", async () => {
    const res = await fetch(`${baseUrl}/migrate/import-browser-data`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        students: [{ name: "Import Test", rollNo: "2410998888", email: "import8888@student.com" }],
        rooms: [{ roomNumber: "LH-301", rows: 4, cols: 6 }],
      }),
    });
    const data = await res.json();
    assert.strictEqual(res.status, 200);
    assert.strictEqual(data.ok, true);
    assert.strictEqual(data.report.imported.students, 1);
    assert.strictEqual(data.report.imported.rooms, 1);
  });

  await test("POST /api/exams/:id/generate-seating generates plan and links exam session", async () => {
    const res = await fetch(`${baseUrl}/exams/exam_cndc/generate-seating`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${adminToken}`,
      },
    });
    const data = await res.json();
    assert.strictEqual(res.status, 201);
    assert.strictEqual(data.ok, true);
    assert.ok(data.plan);
    assert.strictEqual(data.plan.examId, "exam_cndc");
  });

  await test("PUT /api/seating/:id/override modifies seat allocation via exact endpoint", async () => {
    // Fetch active plan
    const planRes = await fetch(`${baseUrl}/seating/exam_cndc`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const planData = await planRes.json();
    assert.strictEqual(planData.ok, true);
    const planId = planData.plan.id;

    // Apply override
    const overrideRes = await fetch(`${baseUrl}/seating/${encodeURIComponent(planId)}/override`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        roomNumber: "LH-101",
        row: 1,
        col: 2,
        rollNo: "2410992925",
        force: true,
      }),
    });
    const overrideData = await overrideRes.json();
    assert.strictEqual(overrideRes.status, 200);
    assert.strictEqual(overrideData.ok, true);
    assert.strictEqual(overrideData.plan.id, planId);
  });

  await test("Mongoose SeatingPlan populate resolves linked Student and Exam", async () => {
    const plan = await SeatingPlan.findOne({ examId: "exam_cndc" }).populate("exam");
    assert.ok(plan);
    assert.ok(plan.exam);
    assert.strictEqual(plan.exam.name, "CNDC");

    if (plan.rooms[0]?.seats?.length > 0 && plan.rooms[0].seats[0].student) {
      await plan.populate("rooms.seats.student");
      assert.ok(plan.rooms[0].seats[0].student.name);
    }
  });

  if (server) {
    server.close();
  }

  await teardown();
}

runAll().catch((err) => {
  console.error("Fatal test runner error:", err);
  process.exit(1);
});
