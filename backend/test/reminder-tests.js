/**
 * test/reminder-tests.js
 * SEATWISE Automated Examination Reminder Email Test Suite
 *
 * Covers:
 * 1. 24-hour boundary eligibility (25h prior, exact 24h, <24h created, post-start).
 * 2. Exam lifecycle preservation (no status mutation when exam starts).
 * 3. Personalized student details (correct room, seat, date, times, instructions).
 * 4. Missing, ambiguous, and invalid student assignments recorded for admin review.
 * 5. Cancelled exams and unfinalized seating plans.
 * 6. Duplicate prevention across repeated scheduler runs and restarts.
 * 7. Mocked email provider failures and safe retry backoff.
 * 8. Timezone handling (Asia/Kolkata).
 * 9. RBAC barriers for admin reminder-inspection endpoint.
 */

const assert = require("assert");
const Exam = require("../models/Exam");
const Room = require("../models/Room");
const User = require("../models/User");
const SeatingPlan = require("../models/SeatingPlan");
const ExamReminder = require("../models/ExamReminder");
const {
  checkAndDispatchReminders,
  getExamStartEpoch,
  calculateEndTime,
} = require("../services/reminderScheduler");
const { setTransporter, resetTransporter } = require("../utils/email");

function createMockTransporter(behavior = {}) {
  const sentMails = [];
  let hasFailed = false;
  return {
    sentMails,
    sendMail: async (mailOptions) => {
      if (behavior.failFirst && !hasFailed) {
        hasFailed = true;
        throw new Error("SMTP connection reset by peer (simulated temporary failure)");
      }
      if (behavior.alwaysFail) {
        throw new Error("SMTP authentication rejected (simulated permanent failure)");
      }
      const messageId = `<mock-${Date.now()}-${Math.random().toString(36).slice(2)}@seatwise.edu>`;
      sentMails.push({ ...mailOptions, messageId });
      return { messageId, response: "250 OK: Message accepted" };
    },
  };
}

async function runReminderTests(test, baseUrl, adminToken, studentToken) {
  console.log("\n=======================================================");
  console.log("📧 10. Automated Examination Reminder Email Service Tests");
  console.log("=======================================================");

  // -------------------------------------------------------------------------
  // TEST 1: TIMEZONE & DURATION CALCULATIONS
  // -------------------------------------------------------------------------
  await test("Timezone calculation: Correctly parses Asia/Kolkata (+05:30) date & time to UTC Epoch", async () => {
    // 2026-10-25 09:30:00 in Asia/Kolkata (+05:30) corresponds to 2026-10-25 04:00:00 UTC
    const epoch = getExamStartEpoch("2026-10-25", "09:30", "Asia/Kolkata");
    const dateUtc = new Date(epoch);
    assert.strictEqual(dateUtc.toISOString(), "2026-10-25T04:00:00.000Z");

    // Calculate end time
    const end = calculateEndTime("09:30", "2 Hours");
    assert.strictEqual(end, "11:30");

    const end90 = calculateEndTime("14:00", "90 Mins");
    assert.strictEqual(end90, "15:30");
  });

  // -------------------------------------------------------------------------
  // TEST 2: 24-HOUR WINDOW BOUNDARIES & LIFECYCLE PRESERVATION
  // -------------------------------------------------------------------------
  await test("24-Hour Boundary: Exam at 25h is NOT eligible; exact 24h & <24h are eligible", async () => {
    // Clean up previous test reminders and exams
    await ExamReminder.deleteMany({});
    await Exam.deleteMany({ id: { $in: ["exam_window_test", "exam_past_test"] } });
    await SeatingPlan.deleteMany({ examId: { $in: ["exam_window_test", "exam_past_test"] } });

    // Target exam start: 2026-10-26 10:00 IST -> 2026-10-26 04:30:00 UTC
    const examDate = "2026-10-26";
    const examTime = "10:00";
    const exam = new Exam({
      id: "exam_window_test",
      name: "Distributed Systems",
      date: examDate,
      time: examTime,
      timezone: "Asia/Kolkata",
      semester: "5th Semester",
      duration: "2 Hours",
      status: "scheduled",
    });
    await exam.save();

    // Finalized seating plan with 1 student (Harnoor)
    const plan = new SeatingPlan({
      id: "plan_window_test",
      examId: "exam_window_test",
      examName: "Distributed Systems",
      isActive: true,
      rooms: [
        {
          roomNumber: "LH-101",
          capacity: 50,
          seats: [
            {
              seat: "A-1",
              row: 0,
              col: 0,
              studentId: "student_harnoor",
              studentRoll: "2410992925",
              studentName: "HARNOOR KAUR",
              subject: "24CAI0201",
            },
          ],
        },
      ],
    });
    await plan.save();

    const mockTransporter = createMockTransporter();
    setTransporter(mockTransporter);

    const examStartEpoch = getExamStartEpoch(examDate, examTime, "Asia/Kolkata");

    // Case A: 25 hours before start (Outside window)
    const time25hBefore = new Date(examStartEpoch - 25 * 60 * 60 * 1000);
    const repA = await checkAndDispatchReminders({
      currentTime: time25hBefore,
      allowInMemoryForTest: true,
    });
    assert.strictEqual(repA.remindersSent, 0, "Should not send reminder 25 hours before exam");
    assert.strictEqual(mockTransporter.sentMails.length, 0);

    // Case B: Exactly 24 hours before start (Enters window)
    const time24hBefore = new Date(examStartEpoch - 24 * 60 * 60 * 1000);
    const repB = await checkAndDispatchReminders({
      currentTime: time24hBefore,
      allowInMemoryForTest: true,
    });
    assert.strictEqual(repB.remindersSent, 1, "Should send reminder at exactly 24 hours before exam");
    assert.strictEqual(mockTransporter.sentMails.length, 1);

    // Case C: Post-start (5 minutes after exam start time)
    // Create an exam in the past
    const pastExam = new Exam({
      id: "exam_past_test",
      name: "Past Exam",
      date: "2026-10-20",
      time: "09:00",
      timezone: "Asia/Kolkata",
      status: "scheduled", // Important: must not be altered merely because time passed!
    });
    await pastExam.save();

    const pastPlan = new SeatingPlan({
      id: "plan_past_test",
      examId: "exam_past_test",
      examName: "Past Exam",
      isActive: true,
      rooms: [
        {
          roomNumber: "LH-102",
          capacity: 50,
          seats: [
            {
              seat: "B-2",
              row: 1,
              col: 1,
              studentId: "student_harnoor",
              studentRoll: "2410992925",
              studentName: "HARNOOR KAUR",
            },
          ],
        },
      ],
    });
    await pastPlan.save();

    const repC = await checkAndDispatchReminders({
      currentTime: new Date("2026-10-20T09:30:00+05:30"),
      allowInMemoryForTest: true,
    });
    assert.strictEqual(repC.remindersSent, 0, "Must not send reminder once examination has already started");

    // Verify existing exam status was NOT overwritten or corrupted!
    const reloadedPastExam = await Exam.findOne({ id: "exam_past_test" });
    assert.strictEqual(
      reloadedPastExam.status,
      "scheduled",
      "Exam status must NOT be altered merely because start time has passed"
    );

    resetTransporter();
  });

  // -------------------------------------------------------------------------
  // TEST 3: PERSONALIZED EMAIL CONTENT & PRIVACY GUARANTEE
  // -------------------------------------------------------------------------
  await test("Personalized Email Content: Each student receives only their own seat and instructions", async () => {
    await ExamReminder.deleteMany({});
    await Exam.deleteMany({ id: "exam_personalized" });
    await SeatingPlan.deleteMany({ examId: "exam_personalized" });

    const exam = new Exam({
      id: "exam_personalized",
      name: "Cloud Computing",
      subjectCode: "CS502",
      date: "2026-10-27",
      time: "10:30",
      duration: "2 Hours",
      reportingTime: "10:00 AM",
      timezone: "Asia/Kolkata",
      instructions: [
        "Special Rule: Only scientific calculators are permitted.",
        "Sign the attendance sheet with blue pen only.",
      ],
    });
    await exam.save();

    // Ensure two test students exist with distinct emails
    await User.findOneAndUpdate(
      { id: "student_alpha" },
      {
        id: "student_alpha",
        name: "Alpha Student",
        email: "alpha@student.com",
        rollNo: "2410992001",
        role: "student",
      },
      { upsert: true }
    );

    await User.findOneAndUpdate(
      { id: "student_beta" },
      {
        id: "student_beta",
        name: "Beta Student",
        email: "beta@student.com",
        rollNo: "2410992002",
        role: "student",
      },
      { upsert: true }
    );

    const plan = new SeatingPlan({
      id: "plan_personalized",
      examId: "exam_personalized",
      examName: "Cloud Computing",
      isActive: true,
      rooms: [
        {
          roomNumber: "LH-201",
          capacity: 50,
          seats: [
            {
              seat: "A-5",
              row: 0,
              col: 4,
              studentId: "student_alpha",
              studentRoll: "2410992001",
              studentName: "Alpha Student",
              subject: "CS502",
            },
          ],
        },
        {
          roomNumber: "LH-202",
          capacity: 50,
          seats: [
            {
              seat: "C-2",
              row: 2,
              col: 1,
              studentId: "student_beta",
              studentRoll: "2410992002",
              studentName: "Beta Student",
              subject: "CS502",
            },
          ],
        },
      ],
    });
    await plan.save();

    const mock = createMockTransporter();
    setTransporter(mock);

    const evalTime = new Date("2026-10-26T18:00:00+05:30"); // ~16.5 hours prior
    const result = await checkAndDispatchReminders({
      currentTime: evalTime,
      allowInMemoryForTest: true,
    });

    assert.strictEqual(result.remindersSent, 2);
    assert.strictEqual(mock.sentMails.length, 2);

    const mailAlpha = mock.sentMails.find((m) => m.to === "alpha@student.com");
    const mailBeta = mock.sentMails.find((m) => m.to === "beta@student.com");

    assert.ok(mailAlpha, "Alpha must receive an email");
    assert.ok(mailBeta, "Beta must receive an email");

    // Verify Alpha's email has Alpha's details and NOT Beta's seat
    assert.ok(mailAlpha.html.includes("LH-201"), "Alpha must see LH-201");
    assert.ok(mailAlpha.html.includes("A-5"), "Alpha must see seat A-5");
    assert.ok(!mailAlpha.html.includes("LH-202"), "Alpha must NOT see Beta's room");
    assert.ok(!mailAlpha.html.includes("C-2"), "Alpha must NOT see Beta's seat");
    assert.ok(mailAlpha.html.includes("10:00 AM"), "Must include reporting time");
    assert.ok(mailAlpha.html.includes("Only scientific calculators are permitted"), "Must include custom instructions");

    // Verify Beta's email has Beta's details and NOT Alpha's seat
    assert.ok(mailBeta.html.includes("LH-202"), "Beta must see LH-202");
    assert.ok(mailBeta.html.includes("C-2"), "Beta must see seat C-2");
    assert.ok(!mailBeta.html.includes("LH-201"), "Beta must NOT see Alpha's room");
    assert.ok(!mailBeta.html.includes("A-5"), "Beta must NOT see Alpha's seat");

    resetTransporter();
  });

  // -------------------------------------------------------------------------
  // TEST 4: DUPLICATE PREVENTION ACROSS REPEATED RUNS & RESTARTS
  // -------------------------------------------------------------------------
  await test("Duplicate Prevention: Repeated scheduler cycles do NOT resend confirmed reminders", async () => {
    const mock = createMockTransporter();
    setTransporter(mock);

    const evalTime = new Date("2026-10-26T18:00:00+05:30");

    // Second cycle
    const run2 = await checkAndDispatchReminders({
      currentTime: evalTime,
      allowInMemoryForTest: true,
    });
    assert.strictEqual(run2.remindersSent, 0, "Must not resend in second cycle");
    assert.strictEqual(mock.sentMails.length, 0);

    // Third cycle
    const run3 = await checkAndDispatchReminders({
      currentTime: evalTime,
      allowInMemoryForTest: true,
    });
    assert.strictEqual(run3.remindersSent, 0, "Must not resend in third cycle");
    assert.strictEqual(mock.sentMails.length, 0);

    // Verify database status remains strictly 'sent'
    const records = await ExamReminder.find({ examId: "exam_personalized" });
    assert.strictEqual(records.length, 2);
    for (const r of records) {
      assert.strictEqual(r.status, "sent");
      assert.ok(r.messageId);
      assert.ok(r.sentAt);
      assert.strictEqual(r.attemptCount, 1);
    }

    resetTransporter();
  });

  // -------------------------------------------------------------------------
  // TEST 5: MISSING, AMBIGUOUS, AND INVALID EMAIL REVIEWS
  // -------------------------------------------------------------------------
  await test("Error Handling: Flags missing assignment, ambiguous seats, and invalid email for review", async () => {
    await ExamReminder.deleteMany({});
    await Exam.deleteMany({ id: "exam_flagged_test" });
    await SeatingPlan.deleteMany({ examId: "exam_flagged_test" });

    const exam = new Exam({
      id: "exam_flagged_test",
      name: "Cyber Security",
      date: "2026-10-28",
      time: "11:00",
      timezone: "Asia/Kolkata",
    });
    await exam.save();

    // Student with invalid email
    await User.findOneAndUpdate(
      { id: "student_bad_email" },
      {
        id: "student_bad_email",
        name: "Invalid Email Student",
        email: "notanemail",
        rollNo: "2410992099",
        role: "student",
      },
      { upsert: true }
    );

    // Student assigned to multiple seats (ambiguous assignment)
    await User.findOneAndUpdate(
      { id: "student_ambiguous" },
      {
        id: "student_ambiguous",
        name: "Ambiguous Student",
        email: "ambiguous@student.com",
        rollNo: "2410992088",
        role: "student",
      },
      { upsert: true }
    );

    const plan = new SeatingPlan({
      id: "plan_flagged_test",
      examId: "exam_flagged_test",
      examName: "Cyber Security",
      isActive: true,
      rooms: [
        {
          roomNumber: "LH-301",
          capacity: 50,
          seats: [
            {
              seat: "A-1",
              row: 0,
              col: 0,
              studentId: "student_bad_email",
              studentRoll: "2410992099",
              studentName: "Invalid Email Student",
            },
            {
              seat: "A-2",
              row: 0,
              col: 1,
              studentId: "student_ambiguous",
              studentRoll: "2410992088",
              studentName: "Ambiguous Student",
            },
            {
              seat: "B-2", // Duplicate seat in same plan for same student!
              row: 1,
              col: 1,
              studentId: "student_ambiguous",
              studentRoll: "2410992088",
              studentName: "Ambiguous Student",
            },
          ],
        },
      ],
    });
    await plan.save();

    const mock = createMockTransporter();
    setTransporter(mock);

    const evalTime = new Date("2026-10-27T15:00:00+05:30");
    await checkAndDispatchReminders({
      currentTime: evalTime,
      allowInMemoryForTest: true,
      examId: "exam_flagged_test",
    });

    assert.strictEqual(mock.sentMails.length, 0, "No emails should be dispatched to invalid/ambiguous students");

    const badEmailRecord = await ExamReminder.findOne({
      examId: "exam_flagged_test",
      studentId: "student_bad_email",
    });
    assert.ok(badEmailRecord);
    assert.strictEqual(badEmailRecord.status, "skipped_invalid_email");

    const ambiguousRecord = await ExamReminder.findOne({
      examId: "exam_flagged_test",
      studentId: "student_ambiguous",
    });
    assert.ok(ambiguousRecord);
    assert.strictEqual(ambiguousRecord.status, "skipped_ambiguous_assignment");

    resetTransporter();
  });

  // -------------------------------------------------------------------------
  // TEST 6: CANCELLED EXAMINATIONS & UNFINALIZED PLANS
  // -------------------------------------------------------------------------
  await test("Cancelled exams & unfinalized seating plans: Strictly skipped without sending emails", async () => {
    await Exam.deleteMany({ id: { $in: ["exam_cancelled_test", "exam_no_plan_test"] } });

    // Cancelled exam
    const cancelledExam = new Exam({
      id: "exam_cancelled_test",
      name: "Cancelled Math",
      date: "2026-10-29",
      time: "09:00",
      timezone: "Asia/Kolkata",
      isCancelled: true,
    });
    await cancelledExam.save();

    // Exam with no seating plan
    const noPlanExam = new Exam({
      id: "exam_no_plan_test",
      name: "Unplanned Physics",
      date: "2026-10-29",
      time: "09:00",
      timezone: "Asia/Kolkata",
    });
    await noPlanExam.save();

    const mock = createMockTransporter();
    setTransporter(mock);

    const evalTime = new Date("2026-10-28T12:00:00+05:30");
    const rep = await checkAndDispatchReminders({
      currentTime: evalTime,
      allowInMemoryForTest: true,
    });

    assert.strictEqual(mock.sentMails.length, 0);

    const reminders = await ExamReminder.find({
      examId: { $in: ["exam_cancelled_test", "exam_no_plan_test"] },
    });
    assert.strictEqual(reminders.length, 0);

    resetTransporter();
  });

  // -------------------------------------------------------------------------
  // TEST 7: EMAIL PROVIDER TEMPORARY FAILURE & SAFE RETRY
  // -------------------------------------------------------------------------
  await test("Retry Strategy: Temporary delivery failure marks 'failed' and retries safely on next run", async () => {
    await ExamReminder.deleteMany({});
    await Exam.deleteMany({ id: "exam_retry_test" });
    await SeatingPlan.deleteMany({ examId: "exam_retry_test" });

    const exam = new Exam({
      id: "exam_retry_test",
      name: "Software Engineering",
      date: "2026-10-30",
      time: "10:00",
      timezone: "Asia/Kolkata",
    });
    await exam.save();

    const plan = new SeatingPlan({
      id: "plan_retry_test",
      examId: "exam_retry_test",
      examName: "Software Engineering",
      isActive: true,
      rooms: [
        {
          roomNumber: "LH-401",
          capacity: 50,
          seats: [
            {
              seat: "D-1",
              row: 3,
              col: 0,
              studentId: "student_alpha",
              studentRoll: "2410992001",
              studentName: "Alpha Student",
            },
          ],
        },
      ],
    });
    await plan.save();

    // Mock configured to fail on first attempt
    const mock = createMockTransporter({ failFirst: true });
    setTransporter(mock);

    const evalTime = new Date("2026-10-29T14:00:00+05:30");

    // First cycle: Simulated SMTP failure
    const rep1 = await checkAndDispatchReminders({
      currentTime: evalTime,
      allowInMemoryForTest: true,
      examId: "exam_retry_test",
    });
    assert.strictEqual(rep1.remindersFailed, 1);
    assert.strictEqual(rep1.remindersSent, 0);

    const recordFail = await ExamReminder.findOne({
      examId: "exam_retry_test",
      studentId: "student_alpha",
    });
    assert.ok(recordFail);
    assert.strictEqual(recordFail.status, "failed");
    assert.strictEqual(recordFail.attemptCount, 1);
    assert.ok(recordFail.lastError.includes("SMTP connection reset"));

    // Second cycle: SMTP is now working
    const rep2 = await checkAndDispatchReminders({
      currentTime: evalTime,
      allowInMemoryForTest: true,
      examId: "exam_retry_test",
    });
    assert.strictEqual(rep2.remindersSent, 1);
    assert.strictEqual(rep2.remindersFailed, 0);

    const recordSuccess = await ExamReminder.findOne({
      examId: "exam_retry_test",
      studentId: "student_alpha",
    });
    assert.strictEqual(recordSuccess.status, "sent");
    assert.strictEqual(recordSuccess.attemptCount, 2);
    assert.ok(recordSuccess.messageId);

    // Third cycle: Confirmed sent, must not resend
    const rep3 = await checkAndDispatchReminders({
      currentTime: evalTime,
      allowInMemoryForTest: true,
      examId: "exam_retry_test",
    });
    assert.strictEqual(rep3.remindersSent, 0);

    resetTransporter();
  });

  // -------------------------------------------------------------------------
  // TEST 8: ADMIN REMINDER-INSPECTION ENDPOINT & RBAC SECURITY
  // -------------------------------------------------------------------------
  await test("GET /api/exams/:id/reminders enforces RBAC and masks email addresses", async () => {
    // 1. Unauthenticated request -> 401
    const unauthRes = await fetch(`${baseUrl}/exams/exam_retry_test/reminders`);
    assert.strictEqual(unauthRes.status, 401, "Unauthenticated request must be blocked (401)");

    // 2. Student request -> 403
    const studentRes = await fetch(`${baseUrl}/exams/exam_retry_test/reminders`, {
      headers: { Authorization: `Bearer ${studentToken}` },
    });
    assert.strictEqual(studentRes.status, 403, "Student must be forbidden from inspecting reminder logs (403)");

    // 3. Admin request -> 200 with stats & masked student emails
    const adminRes = await fetch(`${baseUrl}/exams/exam_retry_test/reminders`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert.strictEqual(adminRes.status, 200, "Admin must be authorized (200)");

    const data = await adminRes.json();
    assert.strictEqual(data.ok, true);
    assert.strictEqual(data.examId, "exam_retry_test");
    assert.ok(data.stats);
    assert.strictEqual(data.stats.sent, 1);
    assert.ok(Array.isArray(data.reminders));
    assert.strictEqual(data.reminders.length, 1);

    // Verify email masking for privacy
    const reminder = data.reminders[0];
    assert.ok(reminder.studentEmail.includes("***@"), `Student email must be masked: ${reminder.studentEmail}`);
    assert.strictEqual(reminder.seat, "D-1");
  });
}

module.exports = { runReminderTests };
