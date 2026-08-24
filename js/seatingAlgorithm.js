/* ==========================================================================
   seatingAlgorithm.js — SEATWISE Selection-Based Constraint Engine
   ==========================================================================
   Assigns every eligible student to exactly one seat so that no two students
   of the SAME subject AND SAME stream (course) sit in ADJACENT seats (Left,
   Right, Front, Back).

   If only 1 exam/subject conflict group is active/present, adjacency checks
   are automatically skipped (no conflicts are generated since they must
   seat together).

   Always keeps 2 seats marked as RESERVED in every plan.
   ========================================================================== */

const SeatingAlgorithm = {

  MAX_ATTEMPTS: 15,
  RESERVED_SEATS: 2,

  generate(students, rooms, options = {}) {
    const generation = options.generation || 1;

    // Normalize student items with exact stream+subject conflict key
    const normalizedStudents = students.map((s) => ({
      ...s,
      _conflictKey: this._conflictKey(s)
    }));

    const roomsSorted = [...rooms];
    const totalCapacity = roomsSorted.reduce(
      (sum, r) => sum + Number(r.rows) * Number(r.cols), 0
    );

    const RESERVED_COUNT = this.RESERVED_SEATS;
    const usableCapacity = Math.max(0, totalCapacity - RESERVED_COUNT);

    let bestPlan = null;
    const maxAttempts = generation === 1 ? this.MAX_ATTEMPTS : Math.min(generation + 5, this.MAX_ATTEMPTS);

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const seed = generation * 1000 + attempt;
      const plan = this._runSingleAttempt(normalizedStudents, roomsSorted, usableCapacity, totalCapacity, RESERVED_COUNT, seed);
      if (!bestPlan || plan.stats.totalConflicts < bestPlan.stats.totalConflicts) {
        bestPlan = plan;
        if (bestPlan.stats.totalConflicts === 0) break;
      }
    }

    bestPlan.generation = generation;
    bestPlan.generatedAt = new Date().toISOString();
    return bestPlan;
  },

  _runSingleAttempt(students, roomsSorted, usableCapacity, totalCapacity, reservedCount, seed) {
    const queue = this._buildInterleavedQueue(students, seed);

    const toPlace = queue.slice(0, usableCapacity);
    const overflow = queue.slice(usableCapacity);

    const roomResults = [];
    let pool = [...toPlace];
    let cumulativeCapacity = 0;

    for (let rmIdx = 0; rmIdx < roomsSorted.length; rmIdx++) {
      const room = roomsSorted[rmIdx];
      const rows = Number(room.rows);
      const cols = Number(room.cols);
      const grid = Array.from({ length: rows }, () => Array(cols).fill(null));
      let placedCount = 0;

      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const globalSeatIndex = cumulativeCapacity + (r * cols + c);

          // Reserve the last 2 seats of total room capacity
          if (globalSeatIndex >= totalCapacity - reservedCount) {
            grid[r][c] = {
              seat: seatLabel(r, c),
              row: r,
              col: c,
              isReserved: true,
              rollNo: "RESERVED",
              name: "RESERVED SEAT",
              subject: "RESERVED"
            };
            continue;
          }

          if (pool.length === 0) break;

          const leftKey = c > 0 && grid[r][c - 1] && !grid[r][c - 1].isReserved ? grid[r][c - 1]._conflictKey : null;
          const topKey  = r > 0 && grid[r - 1][c] && !grid[r - 1][c].isReserved ? grid[r - 1][c]._conflictKey : null;

          const excluded = new Set([leftKey, topKey].filter(Boolean));

          let candidateIndex = pool.findIndex((s) => !excluded.has(s._conflictKey));

          if (candidateIndex === -1) {
            let minConflicts = Infinity;
            pool.forEach((s, i) => {
              const count = this._countNeighbourConflicts(grid, r, c, rows, cols, s._conflictKey);
              if (count < minConflicts) {
                minConflicts = count;
                candidateIndex = i;
              }
            });
            if (candidateIndex === -1) candidateIndex = 0;
          }

          const student = pool.splice(candidateIndex, 1)[0];
          grid[r][c] = {
            seat: seatLabel(r, c),
            row: r,
            col: c,
            rollNo: student.rollNo,
            name: student.name,
            subject: student.subject,
            course: student.course || "",
            _conflictKey: student._conflictKey
          };
          placedCount++;
        }
      }

      cumulativeCapacity += (rows * cols);

      roomResults.push({
        roomNumber: room.roomNumber,
        rows,
        cols,
        capacity: rows * cols,
        occupied: placedCount,
        grid
      });
    }

    const unassigned = [...pool, ...overflow];
    const conflicts = this._detectConflicts(roomResults);

    const totalStudents = students.length;
    const totalAssigned = totalStudents - unassigned.length;
    const conflictRate = totalAssigned > 0 ? (conflicts.length / totalAssigned) * 100 : 0;
    const validityPercentage = totalAssigned > 0
      ? Math.max(0, 100 - (conflicts.length * 2 / totalAssigned) * 100) : 100;
    const seatUtilization = totalCapacity > 0
      ? (totalAssigned / totalCapacity) * 100 : 0;

    return {
      rooms: roomResults,
      unassigned,
      conflicts,
      stats: {
        totalStudents,
        totalAssigned,
        totalConflicts: conflicts.length,
        unassignedCount: unassigned.length,
        reservedSeats: reservedCount,
        conflictRate: Number(conflictRate.toFixed(1)),
        validityPercentage: Number(validityPercentage.toFixed(1)),
        seatUtilization: Number(seatUtilization.toFixed(1)),
        totalCapacity,
        roomsUsed: roomResults.filter((r) => r.occupied > 0).length
      }
    };
  },

  _buildInterleavedQueue(students, seed) {
    const groups = {};
    students.forEach((s) => {
      const key = s._conflictKey || s.subject || "UNKNOWN";
      if (!groups[key]) groups[key] = [];
      groups[key].push(s);
    });

    const seededShuffle = (arr, s) => {
      const a = [...arr];
      let st = (s || 1) + 1;
      for (let i = a.length - 1; i > 0; i--) {
        st = (st * 9301 + 49297) % 233280;
        const j = Math.floor((st / 233280) * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
      }
      return a;
    };

    let groupKeys = Object.keys(groups).sort(
      (a, b) => groups[b].length - groups[a].length
    );

    if (seed > 1) {
      groupKeys = seededShuffle(groupKeys, seed * 17);
      groupKeys.forEach((k) => {
        groups[k] = seededShuffle(groups[k], seed * 31 + k.length);
      });
    }

    const queue = [];
    let hasMore = true;
    while (hasMore) {
      hasMore = false;
      for (const key of groupKeys) {
        if (groups[key].length > 0) {
          queue.push(groups[key].shift());
          hasMore = true;
        }
      }
    }
    return queue;
  },

  _countNeighbourConflicts(grid, r, c, rows, cols, conflictKey) {
    let count = 0;
    const dirs = [[r - 1, c], [r + 1, c], [r, c - 1], [r, c + 1]];
    for (const [nr, nc] of dirs) {
      if (nr >= 0 && nr < rows && nc >= 0 && nc < cols) {
        const n = grid[nr][nc];
        if (n && !n.isReserved && n._conflictKey === conflictKey) count++;
      }
    }
    return count;
  },

  _detectConflicts(roomResults) {
    // Count unique conflict keys present across all placed students (excluding reserved)
    const uniqueKeys = new Set();
    for (const room of roomResults) {
      for (let r = 0; r < room.grid.length; r++) {
        for (let c = 0; c < room.grid[r].length; c++) {
          const seat = room.grid[r][c];
          if (seat && !seat.isReserved && seat._conflictKey) {
            uniqueKeys.add(seat._conflictKey);
          }
        }
      }
    }

    const conflicts = [];
    // If only 1 conflict key/exam/subject group is present, adjacency conflict check is skipped
    if (uniqueKeys.size <= 1) {
      return conflicts;
    }

    for (const room of roomResults) {
      const rows = room.grid.length;
      const cols = room.grid[0]?.length || 0;
      const roomNumber = room.roomNumber;

      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const seat = room.grid[r][c];
          if (!seat || seat.isReserved) continue;

          const right = c + 1 < cols ? room.grid[r][c + 1] : null;
          const back  = r + 1 < rows ? room.grid[r + 1][c] : null;

          if (right && !right.isReserved && right._conflictKey === seat._conflictKey) {
            conflicts.push(this._buildConflict(roomNumber, seat, right));
          }
          if (back && !back.isReserved && back._conflictKey === seat._conflictKey) {
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
      course: seatA.course || "",
      seatA: seatA.seat,
      seatB: seatB.seat,
      studentA: { rollNo: seatA.rollNo, name: seatA.name },
      studentB: { rollNo: seatB.rollNo, name: seatB.name }
    };
  },

  _conflictKey(student) {
    const subject = (student.subject || "UNKNOWN").toString().trim().toUpperCase();
    const stream  = (student.course  || "").toString().trim().toUpperCase();
    return stream ? `${subject}||${stream}` : subject;
  },

  wouldConflict(plan, roomNumber, r, c, subject, ignoreRollNo = null, course = "") {
    if (!plan || !Array.isArray(plan.rooms)) return false;

    // Count unique conflict keys in the plan to determine if we check conflicts
    const uniqueKeys = new Set();
    for (const room of plan.rooms) {
      for (let row = 0; row < room.grid.length; row++) {
        for (let col = 0; col < room.grid[row].length; col++) {
          const seat = room.grid[row][col];
          if (seat && !seat.isReserved && seat._conflictKey) {
            uniqueKeys.add(seat._conflictKey);
          }
        }
      }
    }
    if (uniqueKeys.size <= 1) return false;

    const room = plan.rooms.find((rm) => rm.roomNumber === roomNumber);
    if (!room || !Array.isArray(room.grid)) return false;
    if (r < 0 || r >= room.grid.length || c < 0 || c >= (room.grid[0]?.length || 0)) return false;

    const candidateKey = this._conflictKey({ subject, course });
    const neighbours = [
      r > 0                    ? room.grid[r - 1][c] : null,
      r + 1 < room.grid.length ? room.grid[r + 1][c] : null,
      c > 0                    ? room.grid[r][c - 1] : null,
      c + 1 < (room.grid[0]?.length || 0) ? room.grid[r][c + 1] : null
    ];

    return neighbours.some(
      (n) => n && !n.isReserved && n._conflictKey === candidateKey && n.rollNo !== ignoreRollNo
    );
  },

  suggestSeats(plan, subject, excludeRollNo = null, limit = 3, course = "") {
    const suggestions = [];
    if (!plan || !Array.isArray(plan.rooms)) return suggestions;

    for (const room of plan.rooms) {
      for (let r = 0; r < room.grid.length; r++) {
        for (let c = 0; c < room.grid[r].length; c++) {
          const occupant = room.grid[r][c];
          if (occupant && occupant.rollNo === excludeRollNo) continue;
          if (occupant) continue;

          if (!this.wouldConflict(plan, room.roomNumber, r, c, subject, excludeRollNo, course)) {
            suggestions.push({ roomNumber: room.roomNumber, seat: seatLabel(r, c), row: r, col: c });
            if (suggestions.length >= limit) return suggestions;
          }
        }
      }
    }
    return suggestions;
  }
};
