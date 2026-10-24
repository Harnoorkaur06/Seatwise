/**
 * services/reminderScheduler.js — SEATWISE Automated Examination Reminder Service
 *
 * Checks upcoming examinations and dispatches individual, personalized reminder
 * emails within the final 24-hour window before examination start.
 *
 * Guarantees:
 * - Respects the configured timezone (default Asia/Kolkata).
 * - Exact 24-hour boundary: (examStart - 24h) <= now < examStart.
 * - Handles exams scheduled < 24h in advance if upcoming & seating plan finalized.
 * - Never modifies exam status or lifecycle (does NOT mark completed merely because time passed).
 * - Never sends reminders for cancelled exams or exams without finalized seating.
 * - Strict duplicate prevention via atomic claims on unique { examId, studentId }.
 * - Recoverable processing locks for backend crash resilience.
 * - Never exposes credentials or sensitive email contents in logs or responses.
 * - Runs only when persistent MongoDB is connected and email transport is configured.
 *
 * Delivery Guarantee Limitation Note:
 * Because external SMTP servers and local MongoDB lack distributed two-phase commit,
 * if an email provider accepts an email but the backend crashes before recording success,
 * an expired lock could permit a retry. The system therefore guarantees reliable
 * at-least-once delivery with atomic deduplication.
 */

const Exam = require("../models/Exam");
const SeatingPlan = require("../models/SeatingPlan");
const User = require("../models/User");
const ExamReminder = require("../models/ExamReminder");
const { sendExamReminderEmail, isEmailConfigured } = require("../utils/email");
const { isPersistentDB } = require("../utils/db");

let _schedulerTimer = null;
let _isCycleRunning = false;

/**
 * Convert exam date and time strings into a UTC Epoch timestamp (milliseconds)
 * taking into account the specified timezone (e.g. "Asia/Kolkata").
 *
 * @param {string} dateStr - Date formatted as "YYYY-MM-DD"
 * @param {string} timeStr - Time formatted as "HH:mm" or "H:mm"
 * @param {string} timezone - IANA timezone identifier or ISO offset
 * @returns {number} UTC epoch timestamp in milliseconds
 */
function getExamStartEpoch(dateStr, timeStr, timezone = "Asia/Kolkata") {
  if (!dateStr || !timeStr) return NaN;

  const [rawH, rawM] = timeStr.split(":");
  const h = String(parseInt(rawH, 10)).padStart(2, "0");
  const m = String(parseInt(rawM || "0", 10)).padStart(2, "0");

  // If timezone is already an offset like "+05:30", "-04:00", or "Z"
  if (/^[+-]\d{2}:?\d{2}$/.test(timezone) || timezone === "Z") {
    const formattedOffset = timezone === "Z" ? "Z" : (timezone.includes(":") ? timezone : `${timezone.slice(0, 3)}:${timezone.slice(3)}`);
    return new Date(`${dateStr}T${h}:${m}:00${formattedOffset}`).getTime();
  }

  // Derive exact offset string for the IANA timezone
  let offsetStr = "+05:30"; // Default fallback to IST
  try {
    const [year, month, day] = dateStr.split("-").map(Number);
    const approxDate = new Date(Date.UTC(year, month - 1, day, Number(h), Number(m), 0));
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      timeZoneName: "longOffset",
    }).formatToParts(approxDate);
    const tzPart = parts.find((p) => p.type === "timeZoneName");
    if (tzPart && tzPart.value) {
      const match = tzPart.value.match(/GMT([+-]\d{2}(?::?\d{2})?)/);
      if (match) {
        const rawOffset = match[1];
        offsetStr = rawOffset.includes(":") ? rawOffset : `${rawOffset.slice(0, 3)}:${rawOffset.slice(3) || "00"}`;
      } else if (tzPart.value === "GMT" || tzPart.value === "UTC") {
        offsetStr = "Z";
      }
    }
  } catch (err) {
    offsetStr = "+05:30";
  }

  return new Date(`${dateStr}T${h}:${m}:00${offsetStr}`).getTime();
}

/**
 * Calculate expected end time string based on start time and duration string.
 *
 * @param {string} startTime - e.g. "09:30"
 * @param {string} duration - e.g. "2 Hours", "90 Mins"
 * @returns {string} e.g. "11:30"
 */
function calculateEndTime(startTime, duration) {
  if (!startTime) return "";
  const [hStr, mStr] = startTime.split(":");
  let totalMinutes = parseInt(hStr, 10) * 60 + parseInt(mStr || "0", 10);

  let durationMinutes = 120; // Default 2 hours
  if (duration) {
    const hoursMatch = duration.match(/(\d+(?:\.\d+)?)\s*(?:hour|hr|h)/i);
    const minsMatch = duration.match(/(\d+)\s*(?:minute|min|m)/i);
    if (hoursMatch) {
      durationMinutes = Math.round(parseFloat(hoursMatch[1]) * 60);
    } else if (minsMatch) {
      durationMinutes = parseInt(minsMatch[1], 10);
    }
  }

  const endTotalMinutes = (totalMinutes + durationMinutes) % (24 * 60);
  const endH = String(Math.floor(endTotalMinutes / 60)).padStart(2, "0");
  const endM = String(endTotalMinutes % 60).padStart(2, "0");
  return `${endH}:${endM}`;
}

/**
 * Extract student seat assignments from a finalized SeatingPlan.
 * Detects ambiguous seat assignments (e.g. student assigned multiple seats in same exam).
 *
 * @param {Object} plan - SeatingPlan document
 * @returns {{ assignments: Map<string, Object>, ambiguousStudentRolls: Set<string> }}
 */
function extractPlanAssignments(plan) {
  const assignments = new Map();
  const seatCounts = new Map();
  const ambiguousStudentRolls = new Set();

  if (!plan || !Array.isArray(plan.rooms)) {
    return { assignments, ambiguousStudentRolls };
  }

  for (const room of plan.rooms) {
    // 1. Check room.seats relational array
    if (Array.isArray(room.seats) && room.seats.length > 0) {
      for (const s of room.seats) {
        if (!s) continue;
        const roll = String(s.studentRoll || "").toUpperCase().trim();
        const id = String(s.studentId || "").trim();
        const key = roll || id;
        if (!key) continue;

        const count = (seatCounts.get(key) || 0) + 1;
        seatCounts.set(key, count);
        if (count > 1) {
          ambiguousStudentRolls.add(key);
        }

        const info = {
          roomNumber: room.roomNumber,
          seat: s.seat || "Assigned",
          studentId: id,
          studentRoll: roll,
          studentName: s.studentName || "",
          subject: s.subject || "",
        };

        if (roll) assignments.set(roll, info);
        if (id) assignments.set(id, info);
      }
    } else if (Array.isArray(room.grid)) {
      // 2. Fallback to room.grid if room.seats not yet populated
      for (let r = 0; r < room.grid.length; r++) {
        const row = room.grid[r];
        if (!Array.isArray(row)) continue;
        for (let c = 0; c < row.length; c++) {
          const cell = row[c];
          if (!cell) continue;

          const roll = String(cell.rollNo || "").toUpperCase().trim();
          const id = String(cell.id || "").trim();
          const key = roll || id;
          if (!key) continue;

          const count = (seatCounts.get(key) || 0) + 1;
          seatCounts.set(key, count);
          if (count > 1) {
            ambiguousStudentRolls.add(key);
          }

          const colLetter = String.fromCharCode(65 + c);
          const seatLabel = `${colLetter}-${r + 1}`;
          const info = {
            roomNumber: room.roomNumber,
            seat: cell.seat || seatLabel,
            studentId: id,
            studentRoll: roll,
            studentName: cell.name || "",
            subject: cell.subject || "",
          };

          if (roll) assignments.set(roll, info);
          if (id) assignments.set(id, info);
        }
      }
    }
  }

  return { assignments, ambiguousStudentRolls };
}

/**
 * Core examination reminder evaluation cycle.
 * Inspects upcoming examinations, evaluates 24-hour eligibility window,
 * claims reminders atomically, dispatches personalized emails, and logs records.
 *
 * @param {Object} [options]
 * @param {Date} [options.currentTime] - Override for testing
 * @param {boolean} [options.allowInMemoryForTest] - Allow running on test in-memory DB
 * @param {number} [options.maxRetries] - Max retry attempts for temporary failures
 * @returns {Promise<{ examsEvaluated: number, remindersSent: number, remindersSkipped: number, remindersFailed: number, details: Array }>}
 */
async function checkAndDispatchReminders(options = {}) {
  const isTest = process.env.NODE_ENV === "test" || options.allowInMemoryForTest === true;
  
  if (!isTest) {
    if (!isPersistentDB()) {
      return {
        ok: false,
        reason: "Durable reminders are paused: persistent MongoDB connection required.",
        examsEvaluated: 0,
        remindersSent: 0,
        remindersSkipped: 0,
        remindersFailed: 0,
        details: [],
      };
    }
    if (!isEmailConfigured()) {
      return {
        ok: false,
        reason: "Durable reminders are paused: SMTP email transport is not configured.",
        examsEvaluated: 0,
        remindersSent: 0,
        remindersSkipped: 0,
        remindersFailed: 0,
        details: [],
      };
    }
  }

  const now = options.currentTime ? new Date(options.currentTime) : new Date();
  const maxRetries = options.maxRetries !== undefined
    ? options.maxRetries
    : parseInt(process.env.MAX_REMINDER_RETRIES || "3", 10);

  const report = {
    ok: true,
    evaluatedAt: now.toISOString(),
    examsEvaluated: 0,
    remindersSent: 0,
    remindersSkipped: 0,
    remindersFailed: 0,
    details: [],
  };

  try {
    // 1. Fetch relevant examinations that are not cancelled or marked completed
    const examQuery = {
      isCancelled: { $ne: true },
      status: { $nin: ["cancelled", "completed"] },
    };
    if (options.examId) {
      examQuery.id = options.examId;
    }
    const exams = await Exam.find(examQuery);

    for (const exam of exams) {
      const tz = exam.timezone || process.env.EXAM_TIMEZONE || "Asia/Kolkata";
      const examStartEpoch = getExamStartEpoch(exam.date, exam.time, tz);

      if (isNaN(examStartEpoch)) {
        continue;
      }

      // Final 24-hour window: [examStart - 24h, examStart)
      const windowStart = examStartEpoch - 24 * 60 * 60 * 1000;
      const windowEnd = examStartEpoch;
      const nowEpoch = now.getTime();

      // Check boundary: Must be inside final 24h window AND must NOT have started yet
      // Preserves existing examination lifecycle without overwriting status!
      if (nowEpoch < windowStart || nowEpoch >= windowEnd) {
        continue;
      }

      report.examsEvaluated++;

      // 2. Check for active finalized seating plan
      const plan = await SeatingPlan.findOne({ examId: exam.id, isActive: true });
      if (!plan || !Array.isArray(plan.rooms) || plan.rooms.length === 0) {
        report.details.push({
          examId: exam.id,
          examName: exam.name,
          status: "skipped_no_finalized_plan",
          message: "Seating plan is not finalized for this upcoming examination.",
        });
        continue;
      }

      // Check if plan has any assigned seats
      const { assignments, ambiguousStudentRolls } = extractPlanAssignments(plan);
      if (assignments.size === 0) {
        report.details.push({
          examId: exam.id,
          examName: exam.name,
          status: "skipped_empty_seating_plan",
          message: "Seating plan has no assigned student seats.",
        });
        continue;
      }

      // 3. Find registered students relevant to this exam:
      // Either assigned in the seating plan or enrolled in this exam/subject
      const assignedKeys = Array.from(assignments.keys());
      const students = await User.find({
        role: "student",
        disabled: { $ne: true },
        $or: [
          { rollNo: { $in: assignedKeys } },
          { id: { $in: assignedKeys } },
          { subject: exam.name },
          { subject: exam.subjectCode || "___NONE___" },
          { coursesList: exam.name },
          { coursesList: exam.subjectCode || "___NONE___" },
        ],
      });
      const endTime = calculateEndTime(exam.time, exam.duration);

      for (const student of students) {
        const studentRollUpper = String(student.rollNo || "").toUpperCase().trim();
        const studentId = student.id || student._id.toString();

        // 4. Check for ambiguous seating assignment
        const isAmbiguous = (studentRollUpper && ambiguousStudentRolls.has(studentRollUpper)) ||
          ambiguousStudentRolls.has(studentId);

        if (isAmbiguous) {
          await ExamReminder.findOneAndUpdate(
            { examId: exam.id, studentId },
            {
              $setOnInsert: {
                examName: exam.name,
                studentRoll: student.rollNo,
                studentName: student.name,
                studentEmail: student.email,
                status: "skipped_ambiguous_assignment",
                lastError: "Flagged for administrative review: Student is assigned to multiple conflicting seats.",
              },
            },
            { upsert: true, new: true }
          );
          report.remindersSkipped++;
          continue;
        }

        // 5. Look up student's own seat assignment from the finalized plan
        const assignment = (studentRollUpper && assignments.get(studentRollUpper)) ||
          assignments.get(studentId);

        if (!assignment || !assignment.seat || !assignment.roomNumber) {
          // If student is enrolled/registered but has no seat, record for admin review without sending incorrect details
          await ExamReminder.findOneAndUpdate(
            { examId: exam.id, studentId },
            {
              $setOnInsert: {
                examName: exam.name,
                studentRoll: student.rollNo,
                studentName: student.name,
                studentEmail: student.email,
                status: "skipped_missing_assignment",
                lastError: "Flagged for administrative review: Seating assignment missing from finalized plan.",
              },
            },
            { upsert: true, new: true }
          );
          report.remindersSkipped++;
          continue;
        }

        // 6. Validate student email address
        if (!student.email || !student.email.includes("@")) {
          await ExamReminder.findOneAndUpdate(
            { examId: exam.id, studentId },
            {
              $setOnInsert: {
                examName: exam.name,
                studentRoll: student.rollNo,
                studentName: student.name,
                studentEmail: student.email || "",
                roomNumber: assignment.roomNumber,
                seat: assignment.seat,
                status: "skipped_invalid_email",
                lastError: "Registered student email address is missing or invalid.",
              },
            },
            { upsert: true, new: true }
          );
          report.remindersSkipped++;
          continue;
        }

        // 7. Check if reminder has already been successfully sent
        const existing = await ExamReminder.findOne({ examId: exam.id, studentId });
        if (existing && existing.status === "sent") {
          // Absolute guarantee: Never resend a reminder that was confirmed sent!
          continue;
        }

        // 8. Atomic Claim with Recoverable Lock
        // Prevents duplicate processing across multiple backend instances or ticks
        const lockDurationMs = 5 * 60 * 1000; // 5-minute processing lock
        const lockExpiry = new Date(now.getTime() + lockDurationMs);

        const claimedReminder = await ExamReminder.findOneAndUpdate(
          {
            examId: exam.id,
            studentId,
            $or: [
              { status: "pending" },
              { status: "processing", lockExpiresAt: { $lt: now } }, // Recover crash
              { status: "failed", attemptCount: { $lt: maxRetries } },
              { status: { $exists: false } },
            ],
          },
          {
            $set: {
              examName: exam.name,
              studentRoll: student.rollNo || "",
              studentName: student.name || "",
              studentEmail: student.email || "",
              roomNumber: assignment.roomNumber,
              seat: assignment.seat,
              subject: assignment.subject || exam.subjectCode || "",
              status: "processing",
              lockExpiresAt: lockExpiry,
              lastAttemptAt: now,
            },
            $inc: { attemptCount: 1 },
          },
          {
            upsert: true,
            new: true,
            setDefaultsOnInsert: true,
          }
        );

        if (!claimedReminder || claimedReminder.status !== "processing") {
          // Another worker claimed it or it is already finalized
          continue;
        }

        // 9. Send individual email with ONLY student's own assignment
        const emailResult = await sendExamReminderEmail({
          toAddress: student.email,
          studentName: student.name,
          studentRoll: student.rollNo,
          examName: exam.name,
          subjectCode: assignment.subject || exam.subjectCode || "",
          subjectName: exam.name,
          examDate: exam.date,
          startTime: exam.time,
          endTime,
          duration: exam.duration,
          reportingTime: exam.reportingTime || "30 minutes prior to start",
          roomNumber: assignment.roomNumber,
          seat: assignment.seat,
          instructions: exam.instructions,
        });

        // 10. Durable confirmation update
        if (emailResult.ok) {
          claimedReminder.status = "sent";
          claimedReminder.sentAt = new Date();
          claimedReminder.messageId = emailResult.messageId || "confirmed";
          claimedReminder.lastError = "";
          claimedReminder.lockExpiresAt = null;
          await claimedReminder.save();
          report.remindersSent++;
        } else {
          claimedReminder.status = "failed";
          claimedReminder.lastError = (emailResult.error || "Email delivery failed").slice(0, 300);
          claimedReminder.lockExpiresAt = null;
          await claimedReminder.save();
          report.remindersFailed++;
        }
      }
    }
  } catch (err) {
    console.error("Error in checkAndDispatchReminders:", err.message);
    report.ok = false;
    report.error = err.message;
  }

  return report;
}

/**
 * Start the background periodic scheduler.
 * Enforces requirement: Only activates when persistent MongoDB is connected
 * and email configuration is present.
 */
function startReminderScheduler() {
  if (_schedulerTimer) return;

  const intervalMs = parseInt(process.env.REMINDER_CHECK_INTERVAL_MS || "60000", 10);

  if (!isPersistentDB()) {
    console.log("ℹ Reminder scheduler: Paused (durable reminder tracking requires persistent MongoDB).");
    return;
  }

  if (!isEmailConfigured()) {
    console.log("ℹ Reminder scheduler: Paused (SMTP email transport is not configured).");
    return;
  }

  console.log(`✓ Automated Exam Reminder Scheduler active (polling interval: ${intervalMs / 1000}s)`);

  const runSafeCycle = async () => {
    if (_isCycleRunning) return;
    _isCycleRunning = true;
    try {
      await checkAndDispatchReminders();
    } catch (err) {
      console.error("Scheduled reminder check error:", err.message);
    } finally {
      _isCycleRunning = false;
    }
  };

  // Run initial evaluation shortly after startup, then on interval
  setTimeout(runSafeCycle, 5000);
  _schedulerTimer = setInterval(runSafeCycle, intervalMs);
}

/**
 * Cleanly stop the reminder scheduler during backend shutdown.
 */
function stopReminderScheduler() {
  if (_schedulerTimer) {
    clearInterval(_schedulerTimer);
    _schedulerTimer = null;
    _isCycleRunning = false;
    console.log("✓ Automated Exam Reminder Scheduler stopped cleanly.");
  }
}

module.exports = {
  startReminderScheduler,
  stopReminderScheduler,
  checkAndDispatchReminders,
  getExamStartEpoch,
  calculateEndTime,
  extractPlanAssignments,
};
