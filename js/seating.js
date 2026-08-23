/* ==========================================================================
   seating.js — SEATWISE Multi-Exam Seating Manager
   Orchestration layer between the UI, STORAGE and SeatingAlgorithm.
   Handles per-exam plan generation, multi-generation tracking,
   manual override, and per-exam student seat lookups.
   ========================================================================== */

const Seating = {
  /** Run the algorithm fresh (Generation #1) for a specific exam and persist the result */
  generateNew(examId) {
    const exams = STORAGE.getExams();
    const exam = exams.find((e) => e.id === examId) || (typeof Exams !== "undefined" ? Exams.activeExam() : exams[0]);
    if (!exam) {
      throw new Error("Cannot generate seating: No valid examination selected.");
    }

    const students = STORAGE.getStudents();
    const rooms = STORAGE.getRooms();

    const plan = SeatingAlgorithm.generate(
      students,
      rooms,
      { generation: 1, examId: exam.id, examName: exam.name }
    );

    plan.id = typeof generateId === "function" ? generateId("plan") : "plan_" + Date.now();
    plan.examId = exam.id;
    plan.examName = exam.name;
    plan.generation = 1;
    plan.isActive = true;

    // Attach examId and seatingPlanId to each student assignment node
    this._stampAssignments(plan);

    STORAGE.setSeatingPlan(plan);
    STORAGE.logActivity(`Seating generated for ${exam.name} (Generation 1) — ${plan.stats.totalConflicts} conflicts`);

    return plan;
  },

  /** Re-run the algorithm with a new generation seed for a specific exam */
  regenerate(examId) {
    const exams = STORAGE.getExams();
    const exam = exams.find((e) => e.id === examId) || (typeof Exams !== "undefined" ? Exams.activeExam() : exams[0]);
    if (!exam) {
      throw new Error("Cannot regenerate seating: No valid examination selected.");
    }

    const allPlans = STORAGE.getSeatingPlans();
    const examPlans = allPlans.filter((p) => p.examId === exam.id);
    const maxGen = examPlans.reduce((max, p) => Math.max(max, p.generation || 1), 0);
    const nextGen = maxGen + 1;

    const students = STORAGE.getStudents();
    const rooms = STORAGE.getRooms();

    const plan = SeatingAlgorithm.generate(
      students,
      rooms,
      { generation: nextGen, examId: exam.id, examName: exam.name }
    );

    plan.id = typeof generateId === "function" ? generateId("plan") : "plan_" + Date.now();
    plan.examId = exam.id;
    plan.examName = exam.name;
    plan.generation = nextGen;
    plan.isActive = true;

    this._stampAssignments(plan);

    STORAGE.setSeatingPlan(plan);
    STORAGE.logActivity(`Seating regenerated for ${exam.name} (Generation ${nextGen}) — ${plan.stats.totalConflicts} conflicts`);

    return plan;
  },

  /** Stamp primary examId and seatingPlanId on every student assignment node */
  _stampAssignments(plan) {
    if (!plan || !Array.isArray(plan.rooms)) return;
    for (const room of plan.rooms) {
      if (!Array.isArray(room.grid)) continue;
      for (let r = 0; r < room.grid.length; r++) {
        for (let c = 0; c < room.grid[r].length; c++) {
          if (room.grid[r][c]) {
            room.grid[r][c].examId = plan.examId;
            room.grid[r][c].seatingPlanId = plan.id;
          }
        }
      }
    }
  },

  /** Get active plan or specific generation plan for an exam */
  getCurrentPlan(examId, generation) {
    return STORAGE.getSeatingPlan(examId, generation);
  },

  /** Get all generations list for an exam (sorted newest first) */
  getGenerationsForExam(examId) {
    if (!examId) return [];
    const plans = STORAGE.getSeatingPlans();
    return plans.filter((p) => p.examId === examId).sort((a, b) => (b.generation || 0) - (a.generation || 0));
  },

  /** Recompute stats + conflicts against the CURRENT grid (after an override) */
  _recalculate(plan) {
    const conflicts = SeatingAlgorithm._detectConflicts(plan.rooms);
    const totalAssigned = plan.stats.totalAssigned;

    const conflictRate = totalAssigned > 0 ? (conflicts.length / totalAssigned) * 100 : 0;
    const validityPercentage = totalAssigned > 0 ? Math.max(0, 100 - (conflicts.length * 2 / totalAssigned) * 100) : 100;

    plan.conflicts = conflicts;
    plan.stats.totalConflicts = conflicts.length;
    plan.stats.conflictRate = Number(conflictRate.toFixed(1));
    plan.stats.validityPercentage = Number(validityPercentage.toFixed(1));

    return plan;
  },

  /** Attempt to move `rollNo` into (roomNumber, row, col) for a specific plan */
  overrideSeat(roomNumber, row, col, rollNo, examId, generation) {
    const plan = STORAGE.getSeatingPlan(examId, generation);
    if (!plan) return { ok: false, message: "No seating plan exists for this examination." };

    const numericRow = Number(row);
    const numericCol = Number(col);

    if (!Number.isInteger(numericRow) || !Number.isInteger(numericCol) || numericRow < 0 || numericCol < 0) {
      return { ok: false, message: "Invalid seat coordinates." };
    }

    const destRoom = plan.rooms.find((r) => r.roomNumber === roomNumber);
    if (!destRoom) {
      return { ok: false, message: `Room ${roomNumber} not found in the current seating plan.` };
    }

    if (numericRow >= destRoom.grid.length || numericCol >= (destRoom.grid[numericRow]?.length || 0)) {
      return { ok: false, message: "Selected seat does not exist in this room." };
    }

    // Locate student's position in this specific plan
    let source = null;
    let student = null;

    for (const room of plan.rooms) {
      for (let r = 0; r < room.grid.length; r++) {
        for (let c = 0; c < room.grid[r].length; c++) {
          const seat = room.grid[r][c];
          if (seat && seat.rollNo === rollNo) {
            source = { roomNumber: room.roomNumber, row: r, col: c };
            student = seat;
            break;
          }
        }
        if (student) break;
      }
      if (student) break;
    }

    if (!student) {
      return { ok: false, message: "Student not found in this seating plan." };
    }

    const conflictsExist = SeatingAlgorithm.wouldConflict(plan, roomNumber, numericRow, numericCol, student.subject, rollNo);
    if (conflictsExist) {
      const suggestions = SeatingAlgorithm.suggestSeats(plan, student.subject, rollNo, 3);
      return {
        ok: false,
        conflict: true,
        message: `⚠ CONFLICT DETECTED — ${student.subject} cannot be placed next to another ${student.subject} student.`,
        suggestions
      };
    }

    const destOccupant = destRoom.grid[numericRow][numericCol];
    const srcRoom = plan.rooms.find((r) => r.roomNumber === source.roomNumber);

    destRoom.grid[numericRow][numericCol] = {
      ...student,
      seat: typeof seatLabel === "function" ? seatLabel(numericRow, numericCol) : `R${numericRow}C${numericCol}`,
      row: numericRow,
      col: numericCol,
      examId: plan.examId,
      seatingPlanId: plan.id
    };

    if (destOccupant) {
      srcRoom.grid[source.row][source.col] = {
        ...destOccupant,
        seat: typeof seatLabel === "function" ? seatLabel(source.row, source.col) : `R${source.row}C${source.col}`,
        row: source.row,
        col: source.col,
        examId: plan.examId,
        seatingPlanId: plan.id
      };
    } else {
      srcRoom.grid[source.row][source.col] = null;
    }

    this._recalculate(plan);
    STORAGE.setSeatingPlan(plan);
    STORAGE.logActivity(`Admin manually moved ${rollNo} to ${roomNumber} seat in ${plan.examName}`);

    return { ok: true, message: "Seat updated successfully.", plan };
  },

  /** Force-apply an override even if it conflicts */
  forceOverrideSeat(roomNumber, row, col, rollNo, examId, generation) {
    const plan = STORAGE.getSeatingPlan(examId, generation);
    if (!plan) return { ok: false, message: "No seating plan exists." };

    const numericRow = Number(row);
    const numericCol = Number(col);
    const destRoom = plan.rooms.find((r) => r.roomNumber === roomNumber);
    if (!destRoom) return { ok: false, message: "Room not found." };

    let source = null, student = null;
    for (const room of plan.rooms) {
      for (let r = 0; r < room.grid.length; r++) {
        for (let c = 0; c < room.grid[r].length; c++) {
          const seat = room.grid[r][c];
          if (seat && seat.rollNo === rollNo) {
            source = { roomNumber: room.roomNumber, row: r, col: c };
            student = seat;
            break;
          }
        }
        if (student) break;
      }
      if (student) break;
    }
    if (!student) return { ok: false, message: "Student not found." };

    const destOccupant = destRoom.grid[numericRow][numericCol];
    const srcRoom = plan.rooms.find((r) => r.roomNumber === source.roomNumber);

    destRoom.grid[numericRow][numericCol] = {
      ...student,
      seat: typeof seatLabel === "function" ? seatLabel(numericRow, numericCol) : `R${numericRow}C${numericCol}`,
      row: numericRow,
      col: numericCol,
      examId: plan.examId,
      seatingPlanId: plan.id
    };

    if (destOccupant) {
      srcRoom.grid[source.row][source.col] = {
        ...destOccupant,
        seat: typeof seatLabel === "function" ? seatLabel(source.row, source.col) : `R${source.row}C${source.col}`,
        row: source.row,
        col: source.col,
        examId: plan.examId,
        seatingPlanId: plan.id
      };
    } else {
      srcRoom.grid[source.row][source.col] = null;
    }

    this._recalculate(plan);
    STORAGE.setSeatingPlan(plan);
    STORAGE.logActivity(`Admin force-applied override for ${rollNo} in ${plan.examName}`);
    return { ok: true, message: "Override applied (conflict retained).", plan };
  },

  applySuggestion(rollNo, suggestion, examId, generation) {
    if (!suggestion) return { ok: false, message: "No suggestion provided." };
    return this.overrideSeat(suggestion.roomNumber, suggestion.row, suggestion.col, rollNo, examId, generation);
  },

  /** Find seat for a student for a SPECIFIC exam */
  findByRollNo(rollNo, examId) {
    if (!rollNo) return null;
    const plan = STORAGE.getSeatingPlan(examId);
    if (!plan || !Array.isArray(plan.rooms)) return null;

    const target = String(rollNo).toLowerCase();
    for (const room of plan.rooms) {
      if (!Array.isArray(room.grid)) continue;
      for (const row of room.grid) {
        for (const seat of row) {
          if (seat && String(seat.rollNo).toLowerCase() === target) {
            return {
              ...seat,
              roomNumber: room.roomNumber,
              examId: plan.examId,
              examName: plan.examName,
              seatingPlanId: plan.id,
              generation: plan.generation
            };
          }
        }
      }
    }
    return null;
  },

  /** Find ALL seat assignments across ALL active exam plans for a student */
  allSeatsForStudent(rollNo) {
    if (!rollNo) return [];
    const plans = STORAGE.getSeatingPlans().filter((p) => p.isActive === true);
    const results = [];
    const target = String(rollNo).toLowerCase();

    for (const plan of plans) {
      if (!Array.isArray(plan.rooms)) continue;
      let foundInPlan = false;
      for (const room of plan.rooms) {
        if (!Array.isArray(room.grid)) continue;
        for (const row of room.grid) {
          for (const seat of row) {
            if (seat && String(seat.rollNo).toLowerCase() === target) {
              results.push({
                ...seat,
                roomNumber: room.roomNumber,
                examId: plan.examId,
                examName: plan.examName,
                seatingPlanId: plan.id,
                generation: plan.generation
              });
              foundInPlan = true;
              break;
            }
          }
          if (foundInPlan) break;
        }
        if (foundInPlan) break;
      }
    }

    return results;
  }
};