const express = require("express");
const router = express.Router();
const Complaint = require("../models/Complaint");
const Activity = require("../models/Activity");
const { requireAuth, requireAdmin } = require("../middleware/auth");

function generateId(prefix = "cmpl") {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * GET /api/complaints
 * - Admin: view all complaints (with filtering)
 * - Student: strictly own complaints only
 */
router.get("/", requireAuth, async (req, res) => {
  try {
    const { category, status, search } = req.query;
    let query = {};

    if (req.user.role === "student") {
      query.$or = [
        { userId: req.user.id },
        { rollNo: req.user.rollNo },
        { userEmail: req.user.email },
      ];
    } else if (req.query.userId || req.query.rollNo || req.query.email) {
      query.$or = [];
      if (req.query.userId) query.$or.push({ userId: req.query.userId });
      if (req.query.rollNo) query.$or.push({ rollNo: String(req.query.rollNo).toUpperCase() });
      if (req.query.email) query.$or.push({ userEmail: String(req.query.email).toLowerCase() });
    }

    if (category && category !== "ALL") query.category = category;
    if (status && status !== "ALL") query.status = status;

    if (search) {
      const regex = new RegExp(search, "i");
      query.$and = query.$and || [];
      query.$and.push({
        $or: [
          { userName: regex },
          { userEmail: regex },
          { subject: regex },
          { message: regex },
        ],
      });
    }

    const complaints = await Complaint.find(query).sort({ createdAt: -1 });
    return res.json({
      ok: true,
      complaints: complaints.map((c) => c.toSafeObject()),
    });
  } catch (err) {
    console.error("Get complaints error:", err);
    return res.status(500).json({ ok: false, message: "Error fetching complaints." });
  }
});

/**
 * GET /api/complaints/unread-count
 * - Student: unread replies count
 * - Admin: total pending complaints count
 */
router.get("/unread-count", requireAuth, async (req, res) => {
  try {
    if (req.user.role === "admin") {
      const count = await Complaint.countDocuments({
        $or: [{ unread: true }, { status: "Pending" }],
      });
      return res.json({ ok: true, count });
    }

    // Student identity from token
    const conditions = [
      { userId: req.user.id },
      { rollNo: req.user.rollNo },
      { userEmail: req.user.email },
    ];

    const count = await Complaint.countDocuments({
      $or: conditions,
      unreadReply: true,
      adminReply: { $exists: true, $ne: "" },
    });

    return res.json({ ok: true, count });
  } catch (err) {
    console.error("Unread count error:", err);
    return res.status(500).json({ ok: false, message: "Error fetching unread count." });
  }
});

/**
 * POST /api/complaints
 * Student complaint submission (requires authentication, identity bound from JWT)
 */
router.post("/", requireAuth, async (req, res) => {
  try {
    const { category, subject, message } = req.body;

    if (!subject || !message) {
      return res.status(400).json({ ok: false, message: "Please provide both subject and complaint message." });
    }

    const complaint = new Complaint({
      id: generateId("cmpl"),
      userId: req.user.id,
      userName: req.user.name,
      userEmail: req.user.email,
      rollNo: req.user.rollNo || "",
      category: category || "Other",
      subject: subject.trim(),
      message: message.trim(),
      status: "Pending",
      adminReply: "",
      unread: true,
      unreadReply: false,
    });

    await complaint.save();
    await Activity.create({ message: `Complaint submitted by ${req.user.name}` });

    return res.status(201).json({
      ok: true,
      message: "Complaint submitted successfully.",
      complaint: complaint.toSafeObject(),
    });
  } catch (err) {
    console.error("Submit complaint error:", err);
    return res.status(500).json({ ok: false, message: "Error submitting complaint." });
  }
});

/**
 * PUT /api/complaints/:id
 * Admin only: update status and send reply
 */
router.put("/:id", requireAdmin, async (req, res) => {
  try {
    const target = req.params.id.trim();
    const { status, adminReply } = req.body;

    const complaint = await Complaint.findOne({ id: target });
    if (!complaint) {
      return res.status(404).json({ ok: false, message: "Complaint not found." });
    }

    if (status) complaint.status = status;
    if (adminReply !== undefined) {
      complaint.adminReply = adminReply.trim();
      if (adminReply.trim() !== "") {
        complaint.unreadReply = true;
      }
    }
    complaint.unread = false;

    await complaint.save();
    await Activity.create({ message: `Complaint status updated to "${complaint.status}" with reply` });

    return res.json({
      ok: true,
      message: "Complaint updated successfully.",
      complaint: complaint.toSafeObject(),
    });
  } catch (err) {
    console.error("Update complaint error:", err);
    return res.status(500).json({ ok: false, message: "Error updating complaint." });
  }
});

/**
 * POST /api/complaints/clear-unread
 * Student clears unread replies badge
 */
router.post("/clear-unread", requireAuth, async (req, res) => {
  try {
    const conditions = [
      { userId: req.user.id },
      { rollNo: req.user.rollNo },
      { userEmail: req.user.email },
    ];

    await Complaint.updateMany({ $or: conditions, unreadReply: true }, { unreadReply: false });

    return res.json({ ok: true, message: "Unread indicators cleared." });
  } catch (err) {
    console.error("Clear unread error:", err);
    return res.status(500).json({ ok: false, message: "Error clearing notifications." });
  }
});

module.exports = router;
