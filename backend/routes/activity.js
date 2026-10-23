const express = require("express");
const router = express.Router();
const Activity = require("../models/Activity");
const { requireAuth, requireAdmin } = require("../middleware/auth");

/**
 * GET /api/activity
 */
router.get("/", requireAuth, async (req, res) => {
  try {
    const limit = Number(req.query.limit) || 30;
    const activities = await Activity.find().sort({ createdAt: -1 }).limit(limit);
    return res.json({
      ok: true,
      activity: activities.map((a) => a.toSafeObject()),
    });
  } catch (err) {
    console.error("Get activity error:", err);
    return res.status(500).json({ ok: false, message: "Error fetching activity stream." });
  }
});

/**
 * POST /api/activity
 */
router.post("/", requireAuth, async (req, res) => {
  try {
    const { message } = req.body;
    if (!message || !message.trim()) {
      return res.status(400).json({ ok: false, message: "Message is required." });
    }
    const item = await Activity.create({ message: message.trim() });
    return res.status(201).json({ ok: true, activity: item.toSafeObject() });
  } catch (err) {
    return res.status(500).json({ ok: false, message: "Error logging activity." });
  }
});

/**
 * DELETE /api/activity
 * Admin only: Clear activity log
 */
router.delete("/", requireAdmin, async (req, res) => {
  try {
    await Activity.deleteMany({});
    return res.json({ ok: true, message: "Activity log cleared." });
  } catch (err) {
    return res.status(500).json({ ok: false, message: "Error clearing activity log." });
  }
});

module.exports = router;
