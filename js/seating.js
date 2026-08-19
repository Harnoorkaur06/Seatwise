// /* ==========================================================================
//    seating.js
//    Orchestration layer between the UI, STORAGE and SeatingAlgorithm.
//    Handles: generate, regenerate, manual override + revalidation, search,
//    and lookups used by user-facing "My Seat".
//    ========================================================================== */

// const Seating = {
//   /** Run the algorithm fresh (Generation #1) and persist the result */
//   generateNew() {
//     const students = STORAGE.getStudents();
//     const rooms = STORAGE.getRooms();
//     const plan = SeatingAlgorithm.generate(students, rooms, { generation: 1 });
//     STORAGE.setSeatingPlan(plan);
//     STORAGE.logActivity(`Seating generated (Generation 1) — ${plan.stats.totalConflicts} conflicts`);
//     return plan;
//   },

//   /** Re-run the algorithm with a new generation seed, on top of same data */
//   regenerate() {
//     const current = STORAGE.getSeatingPlan();
//     const nextGen = current ? current.generation + 1 : 1;
//     const students = STORAGE.getStudents();
//     const rooms = STORAGE.getRooms();
//     const plan = SeatingAlgorithm.generate(students, rooms, { generation: nextGen });
//     STORAGE.setSeatingPlan(plan);
//     STORAGE.logActivity(`Seating regenerated (Generation ${nextGen}) — ${plan.stats.totalConflicts} conflicts`);
//     return plan;
//   },

//   getCurrentPlan() {
//     return STORAGE.getSeatingPlan();
//   },

//   /** Recompute stats + conflicts against the CURRENT grid (after an override) */
//   _recalculate(plan) {
//     const conflicts = SeatingAlgorithm._detectConflicts(plan.rooms);
//     const totalAssigned = plan.stats.totalAssigned; // unchanged by an override (swap only)
//     const conflictRate = totalAssigned > 0 ? (conflicts.length / totalAssigned) * 100 : 0;
//     const validityPercentage = totalAssigned > 0
//       ? Math.max(0, 100 - (conflicts.length * 2 / totalAssigned) * 100)
//       : 100;
//     plan.conflicts = conflicts;
//     plan.stats.totalConflicts = conflicts.length;
//     plan.stats.conflictRate = Number(conflictRate.toFixed(1));
//     plan.stats.validityPercentage = Number(validityPercentage.toFixed(1));
//     return plan;
//   },

//   /**
//    * Attempt to move `rollNo` into (roomNumber, row, col).
//    * Returns { ok, conflict, suggestions, plan }
//    */
//   overrideSeat(roomNumber, row, col, rollNo) {
//     const plan = STORAGE.getSeatingPlan();
//     if (!plan) return { ok: false, message: "No seating plan exists yet." };

//     // locate student's current position (may be in a different room)
//     let source = null;
//     let student = null;
//     for (const room of plan.rooms) {
//       for (let r = 0; r < room.grid.length; r++) {
//         for (let c = 0; c < room.grid[r].length; c++) {
//           const seat = room.grid[r][c];
//           if (seat && seat.rollNo === rollNo) {
//             source = { roomNumber: room.roomNumber, row: r, col: c };
//             student = seat;
//           }
//         }
//       }
//     }
//     if (!student) return { ok: false, message: "Student not found in current seating plan." };

//     const conflictsExist = SeatingAlgorithm.wouldConflict(plan, roomNumber, row, col, student.subject, rollNo);
//     if (conflictsExist) {
//       const suggestions = SeatingAlgorithm.suggestSeats(plan, student.subject, rollNo, 3);
//       return {
//         ok: false,
//         conflict: true,
//         message: `⚠ CONFLICT DETECTED — ${student.subject} cannot be placed next to another ${student.subject} student.`,
//         suggestions
//       };
//     }

//     const destRoom = plan.rooms.find((r) => r.roomNumber === roomNumber);
//     const destOccupant = destRoom.grid[row][col];
//     const srcRoom = plan.rooms.find((r) => r.roomNumber === source.roomNumber);

//     // Swap (or move into an empty seat)
//     destRoom.grid[row][col] = {
//       ...student,
//       seat: seatLabel(row, col),
//       row, col
//     };
//     if (destOccupant) {
//       srcRoom.grid[source.row][source.col] = {
//         ...destOccupant,
//         seat: seatLabel(source.row, source.col),
//         row: source.row, col: source.col
//       };
//     } else {
//       srcRoom.grid[source.row][source.col] = null;
//     }

//     this._recalculate(plan);
//     STORAGE.setSeatingPlan(plan);
//     STORAGE.logActivity(`Admin manually moved ${rollNo} to ${roomNumber} seat ${seatLabel(row, col)}`);
//     return { ok: true, message: "Seat updated successfully.", plan };
//   },

//   /** Force-apply an override even if it conflicts (admin override power) */
//   forceOverrideSeat(roomNumber, row, col, rollNo) {
//     const plan = STORAGE.getSeatingPlan();
//     if (!plan) return { ok: false, message: "No seating plan exists yet." };

//     let source = null, student = null;
//     for (const room of plan.rooms) {
//       for (let r = 0; r < room.grid.length; r++) {
//         for (let c = 0; c < room.grid[r].length; c++) {
//           const seat = room.grid[r][c];
//           if (seat && seat.rollNo === rollNo) { source = { roomNumber: room.roomNumber, row: r, col: c }; student = seat; }
//         }
//       }
//     }
//     if (!student) return { ok: false, message: "Student not found." };

//     const destRoom = plan.rooms.find((r) => r.roomNumber === roomNumber);
//     const destOccupant = destRoom.grid[row][col];
//     const srcRoom = plan.rooms.find((r) => r.roomNumber === source.roomNumber);

//     destRoom.grid[row][col] = { ...student, seat: seatLabel(row, col), row, col };
//     if (destOccupant) {
//       srcRoom.grid[source.row][source.col] = { ...destOccupant, seat: seatLabel(source.row, source.col), row: source.row, col: source.col };
//     } else {
//       srcRoom.grid[source.row][source.col] = null;
//     }

//     this._recalculate(plan);
//     STORAGE.setSeatingPlan(plan);
//     STORAGE.logActivity(`Admin force-applied override for ${rollNo} despite conflict warning`);
//     return { ok: true, message: "Override applied (conflict retained).", plan };
//   },

//   /** Apply one of the suggested seats directly */
//   applySuggestion(rollNo, suggestion) {
//     return this.overrideSeat(suggestion.roomNumber, suggestion.row, suggestion.col, rollNo);
//   },

//   /** Search the current plan for a roll number, returns seat info or null */
//   findByRollNo(rollNo) {
//     const plan = STORAGE.getSeatingPlan();
//     if (!plan) return null;
//     for (const room of plan.rooms) {
//       for (const row of room.grid) {
//         for (const seat of row) {
//           if (seat && seat.rollNo.toLowerCase() === rollNo.toLowerCase()) {
//             return { ...seat, roomNumber: room.roomNumber };
//           }
//         }
//       }
//     }
//     return null;
//   }
// };


/* ==========================================================================
   seating.js
   Orchestration layer between the UI, STORAGE and SeatingAlgorithm.
   Handles: generate, regenerate, manual override + revalidation, search,
   and lookups used by user-facing "My Seat".
   ========================================================================== */

const Seating = {
  /** Run the algorithm fresh (Generation #1) and persist the result */
  generateNew() {
    const students = STORAGE.getStudents();
    const rooms = STORAGE.getRooms();

    const plan = SeatingAlgorithm.generate(
      students,
      rooms,
      { generation: 1 }
    );

    STORAGE.setSeatingPlan(plan);

    STORAGE.logActivity(
      `Seating generated (Generation 1) — ${plan.stats.totalConflicts} conflicts`
    );

    return plan;
  },

  /** Re-run the algorithm with a new generation seed, on top of same data */
  regenerate() {
    const current = STORAGE.getSeatingPlan();
    const nextGen = current
      ? current.generation + 1
      : 1;

    const students = STORAGE.getStudents();
    const rooms = STORAGE.getRooms();

    const plan = SeatingAlgorithm.generate(
      students,
      rooms,
      { generation: nextGen }
    );

    STORAGE.setSeatingPlan(plan);

    STORAGE.logActivity(
      `Seating regenerated (Generation ${nextGen}) — ${plan.stats.totalConflicts} conflicts`
    );

    return plan;
  },

  getCurrentPlan() {
    return STORAGE.getSeatingPlan();
  },

  /** Recompute stats + conflicts against the CURRENT grid (after an override) */
  _recalculate(plan) {
    const conflicts =
      SeatingAlgorithm._detectConflicts(plan.rooms);

    // A manual override only moves/swaps existing students, so the
    // number of assigned students remains unchanged.
    const totalAssigned = plan.stats.totalAssigned;

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

    plan.conflicts = conflicts;

    plan.stats.totalConflicts = conflicts.length;
    plan.stats.conflictRate =
      Number(conflictRate.toFixed(1));

    plan.stats.validityPercentage =
      Number(validityPercentage.toFixed(1));

    return plan;
  },

  /**
   * Attempt to move `rollNo` into (roomNumber, row, col).
   * Returns { ok, conflict, suggestions, plan }
   */
  overrideSeat(roomNumber, row, col, rollNo) {
    const plan = STORAGE.getSeatingPlan();

    if (!plan) {
      return {
        ok: false,
        message: "No seating plan exists yet."
      };
    }

    const numericRow = Number(row);
    const numericCol = Number(col);

    if (
      !Number.isInteger(numericRow) ||
      !Number.isInteger(numericCol) ||
      numericRow < 0 ||
      numericCol < 0
    ) {
      return {
        ok: false,
        message: "Invalid seat coordinates."
      };
    }

    // Validate destination room before accessing its grid.
    const destRoom = plan.rooms.find(
      (r) => r.roomNumber === roomNumber
    );

    if (!destRoom) {
      return {
        ok: false,
        message: `Room ${roomNumber} not found in the current seating plan.`
      };
    }

    if (
      numericRow >= destRoom.grid.length ||
      numericCol >= (destRoom.grid[numericRow]?.length || 0)
    ) {
      return {
        ok: false,
        message: "Selected seat does not exist in this room."
      };
    }

    // Locate student's current position.
    let source = null;
    let student = null;

    for (const room of plan.rooms) {
      for (let r = 0; r < room.grid.length; r++) {
        for (let c = 0; c < room.grid[r].length; c++) {
          const seat = room.grid[r][c];

          if (seat && seat.rollNo === rollNo) {
            source = {
              roomNumber: room.roomNumber,
              row: r,
              col: c
            };

            student = seat;
            break;
          }
        }

        if (student) break;
      }

      if (student) break;
    }

    if (!student) {
      return {
        ok: false,
        message: "Student not found in current seating plan."
      };
    }

    const conflictsExist =
      SeatingAlgorithm.wouldConflict(
        plan,
        roomNumber,
        numericRow,
        numericCol,
        student.subject,
        rollNo
      );

    if (conflictsExist) {
      const suggestions =
        SeatingAlgorithm.suggestSeats(
          plan,
          student.subject,
          rollNo,
          3
        );

      return {
        ok: false,
        conflict: true,
        message:
          `⚠ CONFLICT DETECTED — ${student.subject} cannot be placed next to another ${student.subject} student.`,
        suggestions
      };
    }

    const destOccupant =
      destRoom.grid[numericRow][numericCol];

    const srcRoom = plan.rooms.find(
      (r) => r.roomNumber === source.roomNumber
    );

    if (!srcRoom) {
      return {
        ok: false,
        message: "Source room not found in the current seating plan."
      };
    }

    // Swap (or move into an empty seat)
    destRoom.grid[numericRow][numericCol] = {
      ...student,
      seat: seatLabel(numericRow, numericCol),
      row: numericRow,
      col: numericCol
    };

    if (destOccupant) {
      srcRoom.grid[source.row][source.col] = {
        ...destOccupant,
        seat: seatLabel(source.row, source.col),
        row: source.row,
        col: source.col
      };
    } else {
      srcRoom.grid[source.row][source.col] = null;
    }

    this._recalculate(plan);

    STORAGE.setSeatingPlan(plan);

    STORAGE.logActivity(
      `Admin manually moved ${rollNo} to ${roomNumber} seat ${seatLabel(numericRow, numericCol)}`
    );

    return {
      ok: true,
      message: "Seat updated successfully.",
      plan
    };
  },

  /** Force-apply an override even if it conflicts (admin override power) */
  forceOverrideSeat(roomNumber, row, col, rollNo) {
    const plan = STORAGE.getSeatingPlan();

    if (!plan) {
      return {
        ok: false,
        message: "No seating plan exists yet."
      };
    }

    const numericRow = Number(row);
    const numericCol = Number(col);

    if (
      !Number.isInteger(numericRow) ||
      !Number.isInteger(numericCol) ||
      numericRow < 0 ||
      numericCol < 0
    ) {
      return {
        ok: false,
        message: "Invalid seat coordinates."
      };
    }

    const destRoom = plan.rooms.find(
      (r) => r.roomNumber === roomNumber
    );

    if (!destRoom) {
      return {
        ok: false,
        message: `Room ${roomNumber} not found in the current seating plan.`
      };
    }

    if (
      numericRow >= destRoom.grid.length ||
      numericCol >= (destRoom.grid[numericRow]?.length || 0)
    ) {
      return {
        ok: false,
        message: "Selected seat does not exist in this room."
      };
    }

    let source = null;
    let student = null;

    for (const room of plan.rooms) {
      for (let r = 0; r < room.grid.length; r++) {
        for (let c = 0; c < room.grid[r].length; c++) {
          const seat = room.grid[r][c];

          if (seat && seat.rollNo === rollNo) {
            source = {
              roomNumber: room.roomNumber,
              row: r,
              col: c
            };

            student = seat;
            break;
          }
        }

        if (student) break;
      }

      if (student) break;
    }

    if (!student) {
      return {
        ok: false,
        message: "Student not found."
      };
    }

    const destOccupant =
      destRoom.grid[numericRow][numericCol];

    const srcRoom = plan.rooms.find(
      (r) => r.roomNumber === source.roomNumber
    );

    if (!srcRoom) {
      return {
        ok: false,
        message: "Source room not found in the current seating plan."
      };
    }

    destRoom.grid[numericRow][numericCol] = {
      ...student,
      seat: seatLabel(numericRow, numericCol),
      row: numericRow,
      col: numericCol
    };

    if (destOccupant) {
      srcRoom.grid[source.row][source.col] = {
        ...destOccupant,
        seat: seatLabel(source.row, source.col),
        row: source.row,
        col: source.col
      };
    } else {
      srcRoom.grid[source.row][source.col] = null;
    }

    this._recalculate(plan);

    STORAGE.setSeatingPlan(plan);

    STORAGE.logActivity(
      `Admin force-applied override for ${rollNo} despite conflict warning`
    );

    return {
      ok: true,
      message: "Override applied (conflict retained).",
      plan
    };
  },

  /** Apply one of the suggested seats directly */
  applySuggestion(rollNo, suggestion) {
    if (!suggestion) {
      return {
        ok: false,
        message: "No seat suggestion was provided."
      };
    }

    return this.overrideSeat(
      suggestion.roomNumber,
      suggestion.row,
      suggestion.col,
      rollNo
    );
  },

  /** Search the current plan for a roll number, returns seat info or null */
  findByRollNo(rollNo) {
    const plan = STORAGE.getSeatingPlan();

    if (!plan || !rollNo) return null;

    const target = String(rollNo).toLowerCase();

    for (const room of plan.rooms) {
      for (const row of room.grid) {
        for (const seat of row) {
          if (
            seat &&
            String(seat.rollNo).toLowerCase() === target
          ) {
            return {
              ...seat,
              roomNumber: room.roomNumber
            };
          }
        }
      }
    }

    return null;
  }
};