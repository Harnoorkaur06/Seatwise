// /* ==========================================================================
//    seatingAlgorithm.js
//    ==========================================================================
//    THE ACADEMIC CORE OF THIS PROJECT.

//    PROBLEM STATEMENT
//    ------------------------------------------------------------------------
//    Given a list of students (each belonging to one subject/course code)
//    and a list of rooms (each a Rows x Columns grid of seats), assign every
//    student to exactly one seat such that:

//         No two students of the SAME subject sit in ADJACENT seats,
//         where "adjacent" = directly LEFT, RIGHT, FRONT (row above) or
//         BACK (row below). Diagonal neighbours are allowed.

//    This is a classic CONSTRAINT SATISFACTION problem, closely related to
//    graph colouring (subjects = colours, seats = graph nodes, edges =
//    adjacency). We solve it with a GREEDY, CONSTRAINT-CHECKING algorithm
//    with local look-back (checks already-placed neighbours before placing)
//    and a limited "look-ahead retry" (regeneration) strategy for
//    improvement across attempts.

//    HIGH-LEVEL STEPS (matches spec section 9)
//    ------------------------------------------------------------------------
//    1. Receive students
//    2. Receive rooms
//    3. Calculate total capacity
//    4. Attempt to distribute students (build an interleaved candidate queue)
//    5. Check constraints (left / right / front / back) before every placement
//    6. Place students seat by seat, room by room
//    7. Detect impossible placements (force-place + flag conflict)
//    8. Overflow remaining students into the next room automatically
//    9. Track conflicts in a structured list
//    10. Return the final seating plan + statistics
//    ========================================================================== */

// const SeatingAlgorithm = {
//   /**
//    * Main entry point.
//    * @param {Array}  students  [{rollNo, name, subject}, ...]
//    * @param {Array}  rooms     [{roomNumber, rows, cols, capacity}, ...]
//    * @param {Object} options   { generation: number }  (used to vary the
//    *                             ordering slightly across "Regenerate" calls)
//    * @returns {Object} seatingPlan
//    */
//   generate(students, rooms, options = {}) {
//     const generation = options.generation || 1;

//     // ---- STEP 3: capacity ------------------------------------------------
//     const roomsSorted = [...rooms]; // fill rooms in the order admin created them
//     const totalCapacity = roomsSorted.reduce((sum, r) => sum + r.rows * r.cols, 0);

//     // ---- STEP 4: build a smart candidate queue ---------------------------
//     // Group students by subject, then INTERLEAVE the groups (round-robin),
//     // largest group first. This "spreads out" any single subject across
//     // the queue, which drastically reduces the chance the greedy placer
//     // ever needs to force a conflicting placement.
//     const queue = this._buildInterleavedQueue(students, generation);

//     // ---- STEPS 5-8: place students room by room ---------------------------
//     const roomResults = [];
//     let pool = [...queue];

//     for (const room of roomsSorted) {
//       const { grid, placedCount } = this._fillRoom(room, pool);
//       pool = pool.slice(placedCount); // remove placed students from pool (overflow continues)
//       roomResults.push({
//         roomNumber: room.roomNumber,
//         rows: room.rows,
//         cols: room.cols,
//         capacity: room.rows * room.cols,
//         occupied: placedCount,
//         grid
//       });
//     }

//     const unassigned = pool; // anyone left after all rooms are full

//     // ---- STEP 9: independent conflict-detection pass ----------------------
//     // Re-scan the ENTIRE finished plan (not just what happened during
//     // placement) so conflicts are always accurate, including ones caused
//     // by forced placements when no legal subject was available.
//     const conflicts = this._detectConflicts(roomResults);

//     // ---- STEP 10: statistics + final plan object ---------------------------
//     const totalStudents = students.length;
//     const totalAssigned = totalStudents - unassigned.length;
//     const conflictRate = totalAssigned > 0 ? (conflicts.length / totalAssigned) * 100 : 0;
//     const validityPercentage = totalAssigned > 0
//       ? Math.max(0, 100 - (conflicts.length * 2 / totalAssigned) * 100)
//       : 100;
//     const seatUtilization = totalCapacity > 0 ? (totalAssigned / totalCapacity) * 100 : 0;

//     return {
//       generation,
//       generatedAt: new Date().toISOString(),
//       rooms: roomResults,
//       unassigned,
//       conflicts,
//       stats: {
//         totalStudents,
//         totalAssigned,
//         totalConflicts: conflicts.length,
//         unassignedCount: unassigned.length,
//         conflictRate: Number(conflictRate.toFixed(1)),
//         validityPercentage: Number(validityPercentage.toFixed(1)),
//         seatUtilization: Number(seatUtilization.toFixed(1)),
//         totalCapacity,
//         roomsUsed: roomResults.filter((r) => r.occupied > 0).length
//       }
//     };
//   },

//   // -------------------------------------------------------------------------
//   // Build a round-robin interleaved queue of students, largest subject
//   // group first. Optionally rotate/shuffle per "generation" so calling
//   // Regenerate produces a different (hopefully better) attempt.
//   // -------------------------------------------------------------------------
//   _buildInterleavedQueue(students, generation) {
//     const groups = {};
//     students.forEach((s) => {
//       const key = s.subject || "UNKNOWN";
//       if (!groups[key]) groups[key] = [];
//       groups[key].push(s);
//     });

//     // simple deterministic pseudo-shuffle seeded by `generation`, so each
//     // regeneration attempt reorders students without full randomness
//     const seededShuffle = (arr, seed) => {
//       const a = [...arr];
//       let s = seed || 1;
//       for (let i = a.length - 1; i > 0; i--) {
//         s = (s * 9301 + 49297) % 233280;
//         const j = Math.floor((s / 233280) * (i + 1));
//         [a[i], a[j]] = [a[j], a[i]];
//       }
//       return a;
//     };

//     let subjectKeys = Object.keys(groups).sort((a, b) => groups[b].length - groups[a].length);
//     if (generation > 1) {
//       subjectKeys = seededShuffle(subjectKeys, generation * 17);
//       subjectKeys.forEach((k) => { groups[k] = seededShuffle(groups[k], generation * 31 + k.length); });
//     }

//     const queue = [];
//     let remaining = true;
//     while (remaining) {
//       remaining = false;
//       for (const key of subjectKeys) {
//         if (groups[key].length > 0) {
//           queue.push(groups[key].shift());
//           remaining = true;
//         }
//       }
//     }
//     return queue;
//   },

//   // -------------------------------------------------------------------------
//   // Fill a single room's grid row-major (row 0 = FRONT), respecting the
//   // LEFT and TOP (already-placed) neighbours at the moment of placement.
//   // If no legal candidate remains, force-place the best available option
//   // and let the later conflict-detection pass flag it.
//   // -------------------------------------------------------------------------
//   _fillRoom(room, pool) {
//     const { rows, cols } = room;
//     const grid = Array.from({ length: rows }, () => Array(cols).fill(null));
//     const available = [...pool];
//     let placedCount = 0;

//     for (let r = 0; r < rows; r++) {
//       for (let c = 0; c < cols; c++) {
//         if (available.length === 0) break;

//         const leftSubject = c > 0 && grid[r][c - 1] ? grid[r][c - 1].subject : null;
//         const topSubject = r > 0 && grid[r - 1][c] ? grid[r - 1][c].subject : null;
//         const excluded = new Set([leftSubject, topSubject].filter(Boolean));

//         // Try to find a candidate whose subject is NOT excluded
//         let candidateIndex = available.findIndex((s) => !excluded.has(s.subject));

//         // STEP 7: impossible placement -> force the first remaining
//         // candidate anyway (keeps every seat filled / no wasted capacity).
//         // The independent conflict pass below will correctly flag this.
//         if (candidateIndex === -1) candidateIndex = 0;

//         const student = available.splice(candidateIndex, 1)[0];
//         grid[r][c] = {
//           seat: seatLabel(r, c),
//           row: r,
//           col: c,
//           rollNo: student.rollNo,
//           name: student.name,
//           subject: student.subject
//         };
//         placedCount++;
//       }
//     }

//     return { grid, placedCount };
//   },

//   // -------------------------------------------------------------------------
//   // Scan every room's grid and report every LEFT/RIGHT/FRONT/BACK pair of
//   // same-subject neighbours. Each unordered pair is reported once.
//   // -------------------------------------------------------------------------
//   _detectConflicts(roomResults) {
//     const conflicts = [];
//     for (const room of roomResults) {
//       const { grid, rows, cols, roomNumber } = { ...room, rows: room.grid.length, cols: room.grid[0]?.length || 0 };
//       for (let r = 0; r < rows; r++) {
//         for (let c = 0; c < cols; c++) {
//           const seat = room.grid[r][c];
//           if (!seat) continue;

//           // only check RIGHT and BACK to avoid double-reporting each pair
//           const right = c + 1 < cols ? room.grid[r][c + 1] : null;
//           const back = r + 1 < rows ? room.grid[r + 1][c] : null;

//           if (right && right.subject === seat.subject) {
//             conflicts.push(this._buildConflict(roomNumber, seat, right));
//           }
//           if (back && back.subject === seat.subject) {
//             conflicts.push(this._buildConflict(roomNumber, seat, back));
//           }
//         }
//       }
//     }
//     return conflicts;
//   },

//   _buildConflict(roomNumber, seatA, seatB) {
//     return {
//       id: generateId("conflict"),
//       roomNumber,
//       subject: seatA.subject,
//       seatA: seatA.seat,
//       seatB: seatB.seat,
//       studentA: { rollNo: seatA.rollNo, name: seatA.name },
//       studentB: { rollNo: seatB.rollNo, name: seatB.name }
//     };
//   },

//   // -------------------------------------------------------------------------
//   // Given a full plan, check whether placing `subject` at (roomNumber, r, c)
//   // would violate the adjacency constraint. Used both for manual overrides
//   // and for generating "suggested seats".
//   // -------------------------------------------------------------------------
//   wouldConflict(plan, roomNumber, r, c, subject, ignoreRollNo = null) {
//     const room = plan.rooms.find((rm) => rm.roomNumber === roomNumber);
//     if (!room) return false;
//     const neighbours = [
//       r > 0 ? room.grid[r - 1][c] : null,               // front
//       r + 1 < room.grid.length ? room.grid[r + 1][c] : null, // back
//       c > 0 ? room.grid[r][c - 1] : null,                // left
//       c + 1 < room.grid[0].length ? room.grid[r][c + 1] : null // right
//     ];
//     return neighbours.some((n) => n && n.subject === subject && n.rollNo !== ignoreRollNo);
//   },

//   /**
//    * Find up to `limit` seats across the whole plan where a student with
//    * the given subject COULD legally sit (empty seat, or a seat currently
//    * occupied by a student we're allowed to swap with).
//    */
//   suggestSeats(plan, subject, excludeRollNo = null, limit = 3) {
//     const suggestions = [];
//     for (const room of plan.rooms) {
//       for (let r = 0; r < room.grid.length; r++) {
//         for (let c = 0; c < room.grid[r].length; c++) {
//           const occupant = room.grid[r][c];
//           if (occupant && occupant.rollNo === excludeRollNo) continue;
//           if (occupant) continue; // for suggestions we only offer empty seats
//           if (!this.wouldConflict(plan, room.roomNumber, r, c, subject, excludeRollNo)) {
//             suggestions.push({ roomNumber: room.roomNumber, seat: seatLabel(r, c), row: r, col: c });
//             if (suggestions.length >= limit) return suggestions;
//           }
//         }
//       }
//     }
//     return suggestions;
//   }
// };


/* ==========================================================================
   seatingAlgorithm.js
   ==========================================================================
   THE ACADEMIC CORE OF THIS PROJECT.

   PROBLEM STATEMENT
   ------------------------------------------------------------------------
   Given a list of students (each belonging to one subject/course code)
   and a list of rooms (each a Rows x Columns grid of seats), assign every
   student to exactly one seat such that:

        No two students of the SAME subject sit in ADJACENT seats,
        where "adjacent" = directly LEFT, RIGHT, FRONT (row above) or
        BACK (row below). Diagonal neighbours are allowed.

   This is a classic CONSTRAINT SATISFACTION problem, closely related to
   graph colouring (subjects = colours, seats = graph nodes, edges =
   adjacency). We solve it with a GREEDY, CONSTRAINT-CHECKING algorithm
   with local look-back (checks already-placed neighbours before placing)
   and a limited "look-ahead retry" (regeneration) strategy for
   improvement across attempts.

   HIGH-LEVEL STEPS (matches spec section 9)
   ------------------------------------------------------------------------
   1. Receive students
   2. Receive rooms
   3. Calculate total capacity
   4. Attempt to distribute students (build an interleaved candidate queue)
   5. Check constraints (left / right / front / back) before every placement
   6. Place students seat by seat, room by room
   7. Detect impossible placements (force-place + flag conflict)
   8. Overflow remaining students into the next room automatically
   9. Track conflicts in a structured list
   10. Return the final seating plan + statistics
   ========================================================================== */

const SeatingAlgorithm = {
  /**
   * Main entry point.
   * @param {Array}  students  [{rollNo, name, subject}, ...]
   * @param {Array}  rooms     [{roomNumber, rows, cols, capacity}, ...]
   * @param {Object} options   { generation: number }  (used to vary the
   *                             ordering slightly across "Regenerate" calls)
   * @returns {Object} seatingPlan
   */
  generate(students, rooms, options = {}) {
    const generation = options.generation || 1;

    // ---- STEP 3: capacity ------------------------------------------------
    const roomsSorted = [...rooms]; // fill rooms in the order admin created them
    const totalCapacity = roomsSorted.reduce(
      (sum, r) => sum + Number(r.rows) * Number(r.cols),
      0
    );

    // ---- STEP 4: build a smart candidate queue ---------------------------
    // Group students by subject, then INTERLEAVE the groups (round-robin),
    // largest group first. This "spreads out" any single subject across
    // the queue, which drastically reduces the chance the greedy placer
    // ever needs to force a conflicting placement.
    const queue = this._buildInterleavedQueue(students, generation);

    // ---- STEPS 5-8: place students room by room --------------------------
    const roomResults = [];
    let pool = [...queue];

    for (const room of roomsSorted) {
      const { grid, placedCount, remaining } = this._fillRoom(room, pool);

      // IMPORTANT:
      // Do NOT use pool.slice(placedCount) here.
      //
      // _fillRoom() may select a student from the middle of the available
      // pool because it searches for a subject that does not conflict with
      // the current left/top neighbours. Therefore the first `placedCount`
      // entries of the original pool are NOT necessarily the students that
      // were placed.
      //
      // `remaining` is the actual set of students not placed in this room.
      pool = remaining;

      roomResults.push({
        roomNumber: room.roomNumber,
        rows: room.rows,
        cols: room.cols,
        capacity: Number(room.rows) * Number(room.cols),
        occupied: placedCount,
        grid
      });

      if (pool.length === 0) break;
    }

    const unassigned = pool;

    // ---- STEP 9: independent conflict-detection pass --------------------
    // Re-scan the ENTIRE finished plan (not just what happened during
    // placement) so conflicts are always accurate, including ones caused
    // by forced placements when no legal subject was available.
    const conflicts = this._detectConflicts(roomResults);

    // ---- STEP 10: statistics + final plan object --------------------------
    const totalStudents = students.length;
    const totalAssigned = totalStudents - unassigned.length;

    const conflictRate =
      totalAssigned > 0
        ? (conflicts.length / totalAssigned) * 100
        : 0;

    const validityPercentage =
      totalAssigned > 0
        ? Math.max(
            0,
            100 - (conflicts.length * 2 / totalAssigned) * 100
          )
        : 100;

    const seatUtilization =
      totalCapacity > 0
        ? (totalAssigned / totalCapacity) * 100
        : 0;

    return {
      generation,
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
        roomsUsed: roomResults.filter((r) => r.occupied > 0).length
      }
    };
  },

  // -------------------------------------------------------------------------
  // Build a round-robin interleaved queue of students, largest subject
  // group first. Optionally rotate/shuffle per "generation" so calling
  // Regenerate produces a different (hopefully better) attempt.
  // -------------------------------------------------------------------------
  _buildInterleavedQueue(students, generation) {
    const groups = {};

    students.forEach((s) => {
      const key = s.subject || "UNKNOWN";
      if (!groups[key]) groups[key] = [];
      groups[key].push(s);
    });

    // simple deterministic pseudo-shuffle seeded by `generation`, so each
    // regeneration attempt reorders students without full randomness
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

    let subjectKeys = Object.keys(groups).sort(
      (a, b) => groups[b].length - groups[a].length
    );

    if (generation > 1) {
      subjectKeys = seededShuffle(subjectKeys, generation * 17);

      subjectKeys.forEach((k) => {
        groups[k] = seededShuffle(
          groups[k],
          generation * 31 + k.length
        );
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

  // -------------------------------------------------------------------------
  // Fill a single room's grid row-major (row 0 = FRONT), respecting the
  // LEFT and TOP (already-placed) neighbours at the moment of placement.
  // If no legal candidate remains, force-place the best available option
  // and let the later conflict-detection pass flag it.
  // -------------------------------------------------------------------------
  _fillRoom(room, pool) {
    const rows = Number(room.rows);
    const cols = Number(room.cols);

    const grid = Array.from(
      { length: rows },
      () => Array(cols).fill(null)
    );

    // This is the actual remaining pool for this room.
    // It is modified as students are selected.
    const available = [...pool];

    let placedCount = 0;

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (available.length === 0) break;

        const leftSubject =
          c > 0 && grid[r][c - 1]
            ? grid[r][c - 1].subject
            : null;

        const topSubject =
          r > 0 && grid[r - 1][c]
            ? grid[r - 1][c].subject
            : null;

        const excluded = new Set(
          [leftSubject, topSubject].filter(Boolean)
        );

        // Try to find a candidate whose subject is NOT excluded.
        let candidateIndex = available.findIndex(
          (s) => !excluded.has(s.subject)
        );

        // STEP 7: impossible placement -> force the first remaining
        // candidate anyway. The independent conflict pass below will
        // correctly flag the conflict.
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
          subject: student.subject
        };

        placedCount++;
      }
    }

    // IMPORTANT:
    // Return the ACTUAL remaining students instead of relying on
    // pool.slice(placedCount), because selected students may have come
    // from anywhere in the original pool.
    return {
      grid,
      placedCount,
      remaining: available
    };
  },

  // -------------------------------------------------------------------------
  // Scan every room's grid and report every LEFT/RIGHT/FRONT/BACK pair of
  // same-subject neighbours. Each unordered pair is reported once.
  // -------------------------------------------------------------------------
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

          // Only check RIGHT and BACK to avoid double-reporting each pair.
          const right =
            c + 1 < cols
              ? room.grid[r][c + 1]
              : null;

          const back =
            r + 1 < rows
              ? room.grid[r + 1][c]
              : null;

          if (right && right.subject === seat.subject) {
            conflicts.push(
              this._buildConflict(roomNumber, seat, right)
            );
          }

          if (back && back.subject === seat.subject) {
            conflicts.push(
              this._buildConflict(roomNumber, seat, back)
            );
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
        name: seatA.name
      },
      studentB: {
        rollNo: seatB.rollNo,
        name: seatB.name
      }
    };
  },

  // -------------------------------------------------------------------------
  // Given a full plan, check whether placing `subject` at (roomNumber, r, c)
  // would violate the adjacency constraint. Used both for manual overrides
  // and for generating "suggested seats".
  // -------------------------------------------------------------------------
  wouldConflict(
    plan,
    roomNumber,
    r,
    c,
    subject,
    ignoreRollNo = null
  ) {
    if (!plan || !Array.isArray(plan.rooms)) return false;

    const room = plan.rooms.find(
      (rm) => rm.roomNumber === roomNumber
    );

    if (!room || !Array.isArray(room.grid)) return false;

    if (
      r < 0 ||
      r >= room.grid.length ||
      c < 0 ||
      c >= (room.grid[0]?.length || 0)
    ) {
      return false;
    }

    const neighbours = [
      r > 0 ? room.grid[r - 1][c] : null, // front
      r + 1 < room.grid.length
        ? room.grid[r + 1][c]
        : null, // back
      c > 0 ? room.grid[r][c - 1] : null, // left
      c + 1 < room.grid[0].length
        ? room.grid[r][c + 1]
        : null // right
    ];

    return neighbours.some(
      (n) =>
        n &&
        n.subject === subject &&
        n.rollNo !== ignoreRollNo
    );
  },

  /**
   * Find up to `limit` seats across the whole plan where a student with
   * the given subject COULD legally sit.
   *
   * Current behavior intentionally remains unchanged:
   * only EMPTY seats are suggested.
   */
  suggestSeats(
    plan,
    subject,
    excludeRollNo = null,
    limit = 3
  ) {
    const suggestions = [];

    if (!plan || !Array.isArray(plan.rooms)) {
      return suggestions;
    }

    for (const room of plan.rooms) {
      for (let r = 0; r < room.grid.length; r++) {
        for (let c = 0; c < room.grid[r].length; c++) {
          const occupant = room.grid[r][c];

          if (
            occupant &&
            occupant.rollNo === excludeRollNo
          ) {
            continue;
          }

          // Preserve existing behavior:
          // suggestions are only empty seats.
          if (occupant) continue;

          if (
            !this.wouldConflict(
              plan,
              room.roomNumber,
              r,
              c,
              subject,
              excludeRollNo
            )
          ) {
            suggestions.push({
              roomNumber: room.roomNumber,
              seat: seatLabel(r, c),
              row: r,
              col: c
            });

            if (suggestions.length >= limit) {
              return suggestions;
            }
          }
        }
      }
    }

    return suggestions;
  }
};









