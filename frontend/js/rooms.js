/* ==========================================================================
   rooms.js — SEATWISE Lecture Hall & Room Manager (MongoDB Edition)
   CRUD for exam rooms. Each room: { roomNumber, rows, cols, capacity }
   ========================================================================== */

const Rooms = {
  all() {
    return STORAGE.getRooms();
  },

  async allAsync() {
    return STORAGE.getRoomsAsync();
  },

  async add({ roomNumber, rows, cols }) {
    if (!roomNumber || !rows || !cols) {
      return { ok: false, message: "Room number, rows and columns are required." };
    }

    const numericRows = Number(rows);
    const numericCols = Number(cols);

    if (!Number.isInteger(numericRows) || !Number.isInteger(numericCols) || numericRows <= 0 || numericCols <= 0) {
      return { ok: false, message: "Rows and columns must be positive whole numbers." };
    }

    if (typeof API !== "undefined" && API.rooms) {
      const res = await API.rooms.create({
        roomNumber: roomNumber.trim().toUpperCase(),
        rows: numericRows,
        cols: numericCols,
      });

      if (res.ok) {
        await STORAGE.sync();
        return { ok: true, message: "Room added successfully.", room: res.room };
      }
      return { ok: false, message: res.message || "Failed to add room." };
    }

    // Local fallback
    const rooms = STORAGE.getRooms();
    if (rooms.some((r) => r.roomNumber.toLowerCase() === roomNumber.toLowerCase())) {
      return { ok: false, message: `Room ${roomNumber} already exists.` };
    }

    rooms.push({
      roomNumber: roomNumber.trim().toUpperCase(),
      rows: numericRows,
      cols: numericCols,
      capacity: numericRows * numericCols,
    });
    STORAGE.setRooms(rooms);
    STORAGE.logActivity(`Room added: ${roomNumber} (${numericRows}x${numericCols})`);
    return { ok: true, message: "Room added successfully." };
  },

  async update(roomNumber, { rows, cols }) {
    const numericRows = Number(rows);
    const numericCols = Number(cols);

    if (!Number.isInteger(numericRows) || !Number.isInteger(numericCols) || numericRows <= 0 || numericCols <= 0) {
      return { ok: false, message: "Rows and columns must be positive whole numbers." };
    }

    if (typeof API !== "undefined" && API.rooms) {
      const res = await API.rooms.update(roomNumber, { rows: numericRows, cols: numericCols });
      if (res.ok) {
        await STORAGE.sync();
        return { ok: true, message: "Room updated successfully.", room: res.room };
      }
      return { ok: false, message: res.message || "Failed to update room." };
    }

    const rooms = STORAGE.getRooms();
    const idx = rooms.findIndex((r) => r.roomNumber.toUpperCase() === roomNumber.toUpperCase());
    if (idx === -1) return { ok: false, message: "Room not found." };

    rooms[idx].rows = numericRows;
    rooms[idx].cols = numericCols;
    rooms[idx].capacity = numericRows * numericCols;
    STORAGE.setRooms(rooms);
    STORAGE.clearSeatingPlan();
    STORAGE.logActivity(`Room updated: ${roomNumber}`);
    return { ok: true, message: "Room updated successfully." };
  },

  async remove(roomNumber) {
    if (typeof API !== "undefined" && API.rooms) {
      const res = await API.rooms.delete(roomNumber);
      if (res.ok) {
        await STORAGE.sync();
        return { ok: true, message: "Room removed successfully." };
      }
      return { ok: false, message: res.message || "Failed to delete room." };
    }

    const rooms = STORAGE.getRooms();
    STORAGE.setRooms(rooms.filter((r) => r.roomNumber.toUpperCase() !== roomNumber.toUpperCase()));
    STORAGE.clearSeatingPlan();
    STORAGE.logActivity(`Room removed: ${roomNumber}`);
    return { ok: true, message: "Room removed successfully." };
  },

  totalCapacity() {
    return this.all().reduce((sum, r) => sum + (r.capacity || 0), 0);
  },
};