/**
 * seatingEngine.js
 * Backend Seating Algorithm & Conflict Resolution Engine for Node.js / MongoDB
 * Preserves the exact 4-way adjacency rules, round-robin interleaving,
 * multi-generation variation, and smart suggestion mechanics.
 */

function seatLabel(row, col) {
  const rowLetter = String.fromCharCode(65 + row);
  return `${rowLetter}${col + 1}`;
}

function generateId(prefix = "id") {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function normalizeSubject(subject) {
  return String(subject || "").trim().toUpperCase();
}

const SeatingEngine = {
  generate(students, rooms, options = {}) {
    const generation = options.generation || 1;
    const examId = options.examId || "exam_default";
    const examName = options.examName || "Examination";

    const roomsSorted = [...rooms];
    const totalCapacity = roomsSorted.reduce((sum, r) => sum + Number(r.rows) * Number(r.cols), 0);

    const queue = this._buildInterleavedQueue(students, generation);

    const roomResults = [];
    let pool = [...queue];

    for (const room of roomsSorted) {
      const { grid, placedCount, remaining } = this._fillRoom(room, pool);
      pool = remaining;
      roomResults.push({
        roomNumber: room.roomNumber,
        rows: Number(room.rows),
        cols: Number(room.cols),
        capacity: Number(room.rows) * Number(room.cols),
        occupied: placedCount,
        grid,
      });
    }

    const unassigned = pool;
    const conflicts = this._detectConflicts(roomResults);

    const totalStudents = students.length;
    const totalAssigned = totalStudents - unassigned.length;
    const conflictRate = totalAssigned > 0 ? (conflicts.length / totalAssigned) * 100 : 0;
    const validityPercentage =
      totalAssigned > 0
        ? Math.max(0, 100 - ((conflicts.length * 2) / totalAssigned) * 100)
        : 100;
    const seatUtilization = totalCapacity > 0 ? (totalAssigned / totalCapacity) * 100 : 0;

    return {
      id: generateId("plan"),
      examId,
      examName,
      generation,
      isActive: true,
      generatedAt: new Date().toISOString(),
      rooms: roomResults,
      unassigned,
      conflicts,
      stats: {
        totalStudents,
        totalAssigned,
        totalConflicts: conflicts.length,
        unassignedCount: unassigned.length,
        conflictRate: Number(conflictRate.toFixed(1)),
        validityPercentage: Number(validityPercentage.toFixed(1)),
        seatUtilization: Number(seatUtilization.toFixed(1)),
        totalCapacity,
        roomsUsed: roomResults.filter((r) => r.occupied > 0).length,
      },
    };
  },

  _buildInterleavedQueue(students, generation) {
    const groups = {};
    students.forEach((s) => {
      const key = normalizeSubject(s.subject) || "UNKNOWN";
      if (!groups[key]) groups[key] = [];
      groups[key].push(s);
    });

    const seededShuffle = (arr, seed) => {
      const a = [...arr];
      let s = seed || 1;
      for (let i = a.length - 1; i > 0; i--) {
        s = (s * 9301 + 49297) % 233280;
        const j = Math.floor((s / 233280) * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
      }
      return a;
    };

    let subjectKeys = Object.keys(groups).sort((a, b) => groups[b].length - groups[a].length);

    if (generation > 1) {
      subjectKeys = seededShuffle(subjectKeys, generation * 17);
      subjectKeys.forEach((k) => {
        groups[k] = seededShuffle(groups[k], generation * 31 + k.length);
      });
    }

    const queue = [];
    let remaining = true;

    while (remaining) {
      remaining = false;
      for (const key of subjectKeys) {
        if (groups[key].length > 0) {
          queue.push(groups[key].shift());
          remaining = true;
        }
      }
    }

    return queue;
  },

  _fillRoom(room, pool) {
    const rows = Number(room.rows);
    const cols = Number(room.cols);

    const grid = Array.from({ length: rows }, () => Array(cols).fill(null));
    const available = [...pool];
    let placedCount = 0;

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (available.length === 0) break;

        const leftSubject = c > 0 && grid[r][c - 1] ? normalizeSubject(grid[r][c - 1].subject) : null;
        const topSubject = r > 0 && grid[r - 1][c] ? normalizeSubject(grid[r - 1][c].subject) : null;

        const excluded = new Set([leftSubject, topSubject].filter(Boolean));

        let candidateIndex = available.findIndex((s) => !excluded.has(normalizeSubject(s.subject)));
        if (candidateIndex === -1) {
          candidateIndex = 0;
        }

        const student = available.splice(candidateIndex, 1)[0];
        grid[r][c] = {
          seat: seatLabel(r, c),
          row: r,
          col: c,
          rollNo: student.rollNo,
          name: student.name,
          subject: student.subject,
        };
        placedCount++;
      }
    }

    return {
      grid,
      placedCount,
      remaining: available,
    };
  },

  _detectConflicts(roomResults) {
    const conflicts = [];
    for (const room of roomResults) {
      const rows = room.grid.length;
      const cols = room.grid[0]?.length || 0;
      const roomNumber = room.roomNumber;

      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const seat = room.grid[r][c];
          if (!seat) continue;

          const right = c + 1 < cols ? room.grid[r][c + 1] : null;
          const back = r + 1 < rows ? room.grid[r + 1][c] : null;

          const seatSub = normalizeSubject(seat.subject);
          if (right && normalizeSubject(right.subject) === seatSub) {
            conflicts.push(this._buildConflict(roomNumber, seat, right));
          }
          if (back && normalizeSubject(back.subject) === seatSub) {
            conflicts.push(this._buildConflict(roomNumber, seat, back));
          }
        }
      }
    }
    return conflicts;
  },

  _buildConflict(roomNumber, seatA, seatB) {
    return {
      id: generateId("conflict"),
      roomNumber,
      subject: seatA.subject,
      seatA: seatA.seat,
      seatB: seatB.seat,
      studentA: {
        rollNo: seatA.rollNo,
        name: seatA.name,
      },
      studentB: {
        rollNo: seatB.rollNo,
        name: seatB.name,
      },
    };
  },

  wouldConflict(plan, roomNumber, r, c, subject, ignoreRollNo = null) {
    if (!plan || !Array.isArray(plan.rooms)) return false;
    const room = plan.rooms.find((rm) => rm.roomNumber === roomNumber);
    if (!room || !Array.isArray(room.grid)) return false;

    if (r < 0 || r >= room.grid.length || c < 0 || c >= (room.grid[0]?.length || 0)) {
      return false;
    }

    const neighbours = [
      r > 0 ? room.grid[r - 1][c] : null,
      r + 1 < room.grid.length ? room.grid[r + 1][c] : null,
      c > 0 ? room.grid[r][c - 1] : null,
      c + 1 < room.grid[0].length ? room.grid[r][c + 1] : null,
    ];

    const targetSub = normalizeSubject(subject);
    return neighbours.some(
      (n) => n && normalizeSubject(n.subject) === targetSub && n.rollNo !== ignoreRollNo
    );
  },

  suggestSeats(plan, subject, excludeRollNo = null, limit = 3) {
    const suggestions = [];
    if (!plan || !Array.isArray(plan.rooms)) return suggestions;

    for (const room of plan.rooms) {
      for (let r = 0; r < room.grid.length; r++) {
        for (let c = 0; c < room.grid[r].length; c++) {
          const occupant = room.grid[r][c];
          if (occupant && occupant.rollNo === excludeRollNo) continue;
          if (occupant) continue;

          if (!this.wouldConflict(plan, room.roomNumber, r, c, subject, excludeRollNo)) {
            suggestions.push({
              roomNumber: room.roomNumber,
              seat: seatLabel(r, c),
              row: r,
              col: c,
            });
            if (suggestions.length >= limit) return suggestions;
          }
        }
      }
    }
    return suggestions;
  },

  recalculate(plan) {
    const conflicts = this._detectConflicts(plan.rooms);
    const totalAssigned = plan.stats ? plan.stats.totalAssigned : 0;
    const conflictRate = totalAssigned > 0 ? (conflicts.length / totalAssigned) * 100 : 0;
    const validityPercentage =
      totalAssigned > 0
        ? Math.max(0, 100 - ((conflicts.length * 2) / totalAssigned) * 100)
        : 100;

    plan.conflicts = conflicts;
    if (plan.stats) {
      plan.stats.totalConflicts = conflicts.length;
      plan.stats.conflictRate = Number(conflictRate.toFixed(1));
      plan.stats.validityPercentage = Number(validityPercentage.toFixed(1));
    }
    return plan;
  },
};

module.exports = {
  SeatingEngine,
  seatLabel,
  generateId,
  normalizeSubject,
};
