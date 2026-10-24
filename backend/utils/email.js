/**
 * utils/email.js — SEATWISE Email Delivery Service
 *
 * Uses nodemailer to send OTP verification emails.
 * SMTP configuration is read from environment variables.
 * Never logs OTP codes, passwords, or secrets.
 */

const nodemailer = require("nodemailer");

// Cache the transporter instance
let _transporter = null;

/**
 * Build or return the cached nodemailer transporter.
 * Returns null if SMTP is not configured.
 */
function getTransporter() {
  if (_transporter) return _transporter;

  const host = process.env.SMTP_HOST;
  const port = parseInt(process.env.SMTP_PORT || "587", 10);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!host || !user || !pass) {
    if (process.env.NODE_ENV === "test") {
      _transporter = nodemailer.createTransport({ jsonTransport: true });
      return _transporter;
    }
    return null;
  }

  _transporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
    tls: {
      rejectUnauthorized: process.env.NODE_ENV === "production",
    },
  });

  return _transporter;
}

/**
 * Check whether SMTP is configured and ready.
 */
function isEmailConfigured() {
  if (process.env.NODE_ENV === "test") return true;
  return !!(_transporter || (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS));
}

/**
 * Send an OTP verification email.
 *
 * @param {string} toAddress - Recipient email
 * @param {string} otpCode - The 4-digit OTP code
 * @param {string} userName - Recipient display name (optional)
 * @returns {{ ok: boolean, error?: string }}
 */
async function sendOtpEmail(toAddress, otpCode, userName = "") {
  const transporter = getTransporter();

  if (!transporter) {
    console.error("Email delivery failed: SMTP is not configured. Set SMTP_HOST, SMTP_USER, and SMTP_PASS in .env");
    return {
      ok: false,
      error: "Email service is not configured. Please contact the administrator.",
    };
  }

  const fromAddress = process.env.SMTP_FROM || process.env.SMTP_USER || "no-reply@seatwise.edu";
  const greeting = userName ? `Hello ${userName},` : "Hello,";

  const htmlBody = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
</head>
<body style="margin:0; padding:0; background:#f5f0fb; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
  <div style="max-width:480px; margin:40px auto; background:#ffffff; border-radius:16px; overflow:hidden; box-shadow:0 4px 24px rgba(54,24,69,0.08);">
    
    <!-- Header -->
    <div style="background:linear-gradient(135deg, #1a0f26 0%, #2b153e 48%, #3a1a50 100%); padding:32px 36px; text-align:center;">
      <div style="display:inline-block; width:40px; height:40px; background:linear-gradient(135deg,#9a3bb9,#7a229d); border-radius:10px; color:#fff; font-size:18px; font-weight:900; line-height:40px; text-align:center;">S</div>
      <div style="color:#ffffff; font-size:22px; font-weight:900; margin-top:10px; letter-spacing:-0.03em;">
        <strong>SEAT</strong><span style="color:#bb74d1;">WISE</span>
      </div>
      <div style="color:#c7bdcd; font-size:13px; margin-top:4px;">Examination Seating Platform</div>
    </div>

    <!-- Body -->
    <div style="padding:36px 36px 28px;">
      <p style="color:#1a0f26; font-size:15px; margin:0 0 16px; line-height:1.6;">${greeting}</p>
      
      <p style="color:#444; font-size:14px; margin:0 0 24px; line-height:1.6;">
        Your login verification code is:
      </p>

      <!-- OTP Display -->
      <div style="text-align:center; margin:0 0 24px;">
        <div style="display:inline-block; background:linear-gradient(135deg, rgba(154,59,185,0.08), rgba(122,34,157,0.06)); border:2px solid rgba(154,59,185,0.2); border-radius:12px; padding:18px 36px; letter-spacing:12px; font-size:36px; font-weight:900; color:#3a1a50; font-family:'Courier New', monospace;">
          ${otpCode}
        </div>
      </div>

      <p style="color:#888; font-size:13px; margin:0 0 8px; line-height:1.5;">
        ⏱ This code expires in <strong>5 minutes</strong>.
      </p>
      
      <p style="color:#c0392b; font-size:13px; margin:0 0 8px; line-height:1.5; font-weight:600;">
        🔒 Do not share this code with anyone.
      </p>

      <p style="color:#888; font-size:12px; margin:20px 0 0; line-height:1.5; border-top:1px solid #eee; padding-top:16px;">
        If you did not initiate this login, you can safely ignore this email. No action is needed.
      </p>
    </div>

    <!-- Footer -->
    <div style="background:#f8f5fb; padding:16px 36px; text-align:center; border-top:1px solid #ede8f2;">
      <p style="color:#9a8aa5; font-size:11px; margin:0; line-height:1.4;">
        SEATWISE — Smart Examination Seating &amp; Conflict Resolution Platform<br />
        This is an automated message. Please do not reply.
      </p>
    </div>
  </div>
</body>
</html>`;

  const textBody = `${greeting}

Your SEATWISE login verification code is: ${otpCode}

This code expires in 5 minutes.
Do not share this code with anyone.

If you did not initiate this login, you can safely ignore this email.

— SEATWISE Examination Seating Platform`;

  try {
    await transporter.sendMail({
      from: `"SEATWISE" <${fromAddress}>`,
      to: toAddress,
      subject: "Your SEATWISE Login Verification Code",
      text: textBody,
      html: htmlBody,
    });

    return { ok: true };
  } catch (err) {
    // Log error type but never log sensitive content
    console.error("Email delivery error:", err.code || err.message);
    return {
      ok: false,
      error: "Failed to send verification email. Please try again or contact the administrator.",
    };
  }
}

/**
 * Send an automated personalized examination reminder email.
 *
 * @param {Object} options
 * @param {string} options.toAddress - Recipient email
 * @param {string} options.studentName - Student name
 * @param {string} options.studentRoll - Student roll number
 * @param {string} options.examName - Examination name
 * @param {string} [options.subjectCode] - Subject/course code
 * @param {string} [options.subjectName] - Subject/course name
 * @param {string} options.examDate - Examination date
 * @param {string} options.startTime - Exam start time
 * @param {string} [options.endTime] - Exam end time
 * @param {string} [options.duration] - Exam duration
 * @param {string} [options.reportingTime] - Reporting time
 * @param {string} options.roomNumber - Assigned hall/room
 * @param {string} options.seat - Exact seat identifier
 * @param {string[]} [options.instructions] - Examination instructions
 * @returns {Promise<{ ok: boolean, messageId?: string, error?: string }>}
 */
async function sendExamReminderEmail(options) {
  const transporter = getTransporter();

  if (!transporter) {
    return {
      ok: false,
      error: "Email delivery failed: SMTP is not configured.",
    };
  }

  const {
    toAddress,
    studentName = "Student",
    studentRoll = "",
    examName = "Examination",
    subjectCode = "",
    subjectName = "",
    examDate = "",
    startTime = "",
    endTime = "",
    duration = "",
    reportingTime = "",
    roomNumber = "",
    seat = "",
    instructions = [],
  } = options;

  if (!toAddress || !toAddress.includes("@")) {
    return {
      ok: false,
      error: "Invalid recipient email address.",
    };
  }

  const fromAddress = process.env.SMTP_FROM || process.env.SMTP_USER || "no-reply@seatwise.edu";
  const displaySubject = [examName, subjectCode || subjectName].filter(Boolean).join(" - ");
  const emailSubject = `Examination Reminder: ${displaySubject} (${examDate})`;

  const defaultInstructions = [
    "Carrying your official Admit Card and University Identity Card is mandatory.",
    "Mobile phones, smartwatches, and unauthorized electronics are strictly prohibited.",
    "Deposit bags and unauthorized materials in the designated cloakroom prior to hall entry.",
    "No candidate is permitted to leave the examination hall before half time.",
    "Occupying any seat other than your allocated seat constitutes an examination offense.",
  ];

  const ruleList = (Array.isArray(instructions) && instructions.length > 0)
    ? instructions
    : defaultInstructions;

  const htmlInstructions = ruleList
    .map((inst) => `<li style="margin-bottom:6px; color:#444; line-height:1.5;">${inst}</li>`)
    .join("");

  const textInstructions = ruleList
    .map((inst, idx) => `  ${idx + 1}. ${inst}`)
    .join("\n");

  const htmlBody = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
</head>
<body style="margin:0; padding:0; background:#f5f0fb; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
  <div style="max-width:540px; margin:32px auto; background:#ffffff; border-radius:16px; overflow:hidden; box-shadow:0 4px 24px rgba(54,24,69,0.08);">
    
    <!-- Header -->
    <div style="background:linear-gradient(135deg, #1a0f26 0%, #2b153e 48%, #3a1a50 100%); padding:28px 32px; text-align:center;">
      <div style="display:inline-block; width:40px; height:40px; background:linear-gradient(135deg,#9a3bb9,#7a229d); border-radius:10px; color:#fff; font-size:18px; font-weight:900; line-height:40px; text-align:center;">S</div>
      <div style="color:#ffffff; font-size:22px; font-weight:900; margin-top:10px; letter-spacing:-0.03em;">
        <strong>SEAT</strong><span style="color:#bb74d1;">WISE</span>
      </div>
      <div style="color:#c7bdcd; font-size:13px; margin-top:4px;">Automated Examination Seating Notice</div>
    </div>

    <!-- Body -->
    <div style="padding:32px 32px 24px;">
      <p style="color:#1a0f26; font-size:16px; margin:0 0 12px; font-weight:600;">Dear ${studentName},</p>
      
      <p style="color:#444; font-size:14px; margin:0 0 20px; line-height:1.6;">
        This is an official reminder that your examination is scheduled to commence within the next <strong>24 hours</strong>. Please review your personalized seating allocation below:
      </p>

      <!-- Allocation Card -->
      <div style="background:linear-gradient(135deg, rgba(154,59,185,0.06), rgba(122,34,157,0.04)); border:1px solid rgba(154,59,185,0.22); border-radius:12px; padding:20px; margin:0 0 24px;">
        <div style="font-size:16px; font-weight:700; color:#2b153e; margin-bottom:12px; border-bottom:1px solid rgba(154,59,185,0.15); padding-bottom:8px;">
          ${displaySubject}
        </div>
        
        <table style="width:100%; border-collapse:collapse; font-size:13px; color:#333;">
          <tr>
            <td style="padding:6px 0; color:#777; width:40%;">Examination Date:</td>
            <td style="padding:6px 0; font-weight:600; color:#1a0f26;">${examDate}</td>
          </tr>
          <tr>
            <td style="padding:6px 0; color:#777;">Start Time:</td>
            <td style="padding:6px 0; font-weight:600; color:#1a0f26;">${startTime}${endTime ? ` &mdash; ${endTime}` : ""}</td>
          </tr>
          ${duration ? `<tr><td style="padding:6px 0; color:#777;">Duration:</td><td style="padding:6px 0; font-weight:600; color:#1a0f26;">${duration}</td></tr>` : ""}
          ${reportingTime ? `<tr><td style="padding:6px 0; color:#777;">Reporting Time:</td><td style="padding:6px 0; font-weight:700; color:#8e24aa;">${reportingTime}</td></tr>` : ""}
          ${studentRoll ? `<tr><td style="padding:6px 0; color:#777;">Roll Number:</td><td style="padding:6px 0; font-weight:600; color:#1a0f26;">${studentRoll}</td></tr>` : ""}
          <tr>
            <td style="padding:8px 0 6px; color:#777; border-top:1px dashed rgba(154,59,185,0.2);">Assigned Room / Hall:</td>
            <td style="padding:8px 0 6px; font-weight:800; font-size:15px; color:#6a1b9a; border-top:1px dashed rgba(154,59,185,0.2);">${roomNumber}</td>
          </tr>
          <tr>
            <td style="padding:6px 0; color:#777;">Assigned Seat Number:</td>
            <td style="padding:6px 0; font-weight:900; font-size:16px; color:#2e7d32;">${seat}</td>
          </tr>
        </table>
      </div>

      <!-- Instructions Section -->
      <div style="margin-bottom:20px;">
        <div style="font-size:14px; font-weight:700; color:#1a0f26; margin-bottom:10px;">
          Mandatory Examination Instructions:
        </div>
        <ul style="margin:0; padding-left:20px; font-size:13px;">
          ${htmlInstructions}
        </ul>
      </div>

      <p style="color:#777; font-size:12px; margin:20px 0 0; line-height:1.5; border-top:1px solid #eee; padding-top:14px;">
        This allocation has been finalized and recorded in your student portal. Do not alter or exchange your seat without authorization.
      </p>
    </div>

    <!-- Footer -->
    <div style="background:#f8f5fb; padding:16px 32px; text-align:center; border-top:1px solid #ede8f2;">
      <p style="color:#9a8aa5; font-size:11px; margin:0; line-height:1.4;">
        SEATWISE Examination Seating &amp; Conflict Resolution Platform<br />
        This is an automated personalized notification. Please do not reply directly to this email.
      </p>
    </div>
  </div>
</body>
</html>`;

  const textBody = `Dear ${studentName},

This is an official reminder that your examination is scheduled to commence within the next 24 hours.

==================================================
EXAMINATION SEATING ALLOCATION
==================================================
Examination: ${displaySubject}
Date: ${examDate}
Start Time: ${startTime}${endTime ? ` - ${endTime}` : ""}
${duration ? `Duration: ${duration}\n` : ""}${reportingTime ? `Reporting Time: ${reportingTime}\n` : ""}${studentRoll ? `Roll Number: ${studentRoll}\n` : ""}Assigned Room / Hall: ${roomNumber}
Assigned Seat Number: ${seat}
==================================================

MANDATORY EXAMINATION INSTRUCTIONS:
${textInstructions}

Please arrive promptly and remember to carry your Admit Card and University ID.

— SEATWISE Examination Platform`;

  try {
    const info = await transporter.sendMail({
      from: `"SEATWISE Examination Services" <${fromAddress}>`,
      to: toAddress,
      subject: emailSubject,
      text: textBody,
      html: htmlBody,
    });

    return {
      ok: true,
      messageId: info.messageId || "delivered",
    };
  } catch (err) {
    // Sanitized error logging: Never log credentials or sensitive data
    console.error("Exam reminder email delivery failed for recipient:", err.code || err.message);
    return {
      ok: false,
      error: err.message || "Email provider rejected delivery.",
    };
  }
}

/**
 * Explicitly set a transporter instance (useful for testing).
 */
function setTransporter(transporter) {
  _transporter = transporter;
}

/**
 * Reset transporter cache (useful for testing).
 */
function resetTransporter() {
  _transporter = null;
}

module.exports = {
  sendOtpEmail,
  sendExamReminderEmail,
  isEmailConfigured,
  getTransporter,
  setTransporter,
  resetTransporter,
};
