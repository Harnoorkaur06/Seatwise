const express = require("express");
const router = express.Router();
const Room = require("../models/Room");
const SeatingPlan = require("../models/SeatingPlan");
const Activity = require("../models/Activity");
const { requireAdmin, requireAuth } = require("../middleware/auth");

/**
 * GET /api/rooms
 */
router.get("/", requireAuth, async (req, res) => {
  try {
    const rooms = await Room.find().sort({ roomNumber: 1 });
    return res.json({
      ok: true,
      rooms: rooms.map((r) => r.toSafeObject()),
    });
  } catch (err) {
    console.error("Get rooms error:", err);
    return res.status(500).json({ ok: false, message: "Error fetching rooms." });
  }
});

/**
 * POST /api/rooms
 * Admin only: Add a new room
 */
router.post("/", requireAdmin, async (req, res) => {
  try {
    const { roomNumber, rows, cols } = req.body;
    if (!roomNumber || !rows || !cols) {
      return res.status(400).json({ ok: false, message: "Room number, rows, and columns are required." });
    }

    const cleanRoom = roomNumber.trim().toUpperCase();
    const numRows = Number(rows);
    const numCols = Number(cols);

    if (!Number.isInteger(numRows) || !Number.isInteger(numCols) || numRows <= 0 || numCols <= 0) {
      return res.status(400).json({ ok: false, message: "Rows and columns must be positive whole numbers." });
    }

    const existing = await Room.findOne({ roomNumber: cleanRoom });
    if (existing) {
      return res.status(400).json({ ok: false, message: `Room ${cleanRoom} already exists.` });
    }

    const room = new Room({
      roomNumber: cleanRoom,
      rows: numRows,
      cols: numCols,
      capacity: numRows * numCols,
    });
    await room.save();

    await Activity.create({ message: `Room added: ${cleanRoom} (${numRows}x${numCols})` });

    return res.status(201).json({
      ok: true,
      message: "Room created successfully.",
      room: room.toSafeObject(),
    });
  } catch (err) {
    console.error("Create room error:", err);
    return res.status(500).json({ ok: false, message: "Error creating room." });
  }
});

/**
 * PUT /api/rooms/:roomNumber
 * Admin only: Update room dimensions
 */
router.put("/:roomNumber", requireAdmin, async (req, res) => {
  try {
    const target = req.params.roomNumber.trim().toUpperCase();
    const { rows, cols } = req.body;

    const numRows = Number(rows);
    const numCols = Number(cols);

    if (!Number.isInteger(numRows) || !Number.isInteger(numCols) || numRows <= 0 || numCols <= 0) {
      return res.status(400).json({ ok: false, message: "Rows and columns must be positive whole numbers." });
    }

    let room = await Room.findOne({ roomNumber: target });
    if (!room) {
      room = new Room({
        roomNumber: target,
        rows: numRows,
        cols: numCols,
        capacity: numRows * numCols,
      });
    } else {
      room.rows = numRows;
      room.cols = numCols;
      room.capacity = numRows * numCols;
    }
    await room.save();

    // Invalidate current seating plans because room dimensions changed
    await SeatingPlan.updateMany({ isActive: true }, { isActive: false });
    await Activity.create({ message: `Room updated: ${target} (${numRows}x${numCols})` });

    return res.json({
      ok: true,
      message: "Room updated successfully.",
      room: room.toSafeObject(),
    });
  } catch (err) {
    console.error("Update room error:", err);
    return res.status(500).json({ ok: false, message: "Error updating room." });
  }
});

/**
 * DELETE /api/rooms/:roomNumber
 * Admin only: Delete room
 */
router.delete("/:roomNumber", requireAdmin, async (req, res) => {
  try {
    const target = req.params.roomNumber.trim().toUpperCase();
    const room = await Room.findOneAndDelete({ roomNumber: target });
    if (!room) {
      return res.status(404).json({ ok: false, message: "Room not found." });
    }

    // Invalidate seating plans containing this room
    await SeatingPlan.updateMany({ isActive: true }, { isActive: false });
    await Activity.create({ message: `Room removed: ${target}` });

    return res.json({ ok: true, message: "Room deleted successfully." });
  } catch (err) {
    console.error("Delete room error:", err);
    return res.status(500).json({ ok: false, message: "Error deleting room." });
  }
});

module.exports = router;
