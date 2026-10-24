/* ==========================================================================
   seating.js — SEATWISE Multi-Exam Seating Manager (MongoDB Edition)
   Orchestration layer between the UI, STORAGE and REST API.
   Handles per-exam plan generation, multi-generation tracking,
   manual override, and per-exam student seat lookups.
   ========================================================================== */

const Seating = {
  /** Run the algorithm fresh (Generation #1) for a specific exam and persist the result */
  async generateNew(examId) {
    if (typeof API !== "undefined" && API.seating) {
      const res = await API.seating.generate(examId);
      if (res.ok && res.plan) {
        await STORAGE.sync();
        return res.plan;
      }
      throw new Error(res.message || "Failed to generate seating plan.");
    }

    // Local fallback
    const exams = STORAGE.getExams();
    const exam = exams.find((e) => e.id === examId) || (typeof Exams !== "undefined" ? Exams.activeExam() : exams[0]);
    if (!exam) throw new Error("Cannot generate seating: No valid examination selected.");

    const students = STORAGE.getStudents();
    const rooms = STORAGE.getRooms();

    const plan = SeatingAlgorithm.generate(students, rooms, { generation: 1, examId: exam.id, examName: exam.name });
    plan.id = typeof generateId === "function" ? generateId("plan") : "plan_" + Date.now();
    plan.examId = exam.id;
    plan.examName = exam.name;
    plan.generation = 1;
    plan.isActive = true;

    this._stampAssignments(plan);
    STORAGE.setSeatingPlan(plan);
    STORAGE.logActivity(`Seating generated for ${exam.name} (Generation 1) — ${plan.stats.totalConflicts} conflicts`);
    return plan;
  },

  /** Re-run the algorithm with a new generation seed for a specific exam */
  async regenerate(examId) {
    if (typeof API !== "undefined" && API.seating) {
      const res = await API.seating.regenerate(examId);
      if (res.ok && res.plan) {
        await STORAGE.sync();
        return res.plan;
      }
      throw new Error(res.message || "Failed to regenerate seating plan.");
    }

    // Local fallback
    const exams = STORAGE.getExams();
    const exam = exams.find((e) => e.id === examId) || (typeof Exams !== "undefined" ? Exams.activeExam() : exams[0]);
    if (!exam) throw new Error("Cannot regenerate seating: No valid examination selected.");

    const allPlans = STORAGE.getSeatingPlans();
    const examPlans = allPlans.filter((p) => p.examId === exam.id);
    const maxGen = examPlans.reduce((max, p) => Math.max(max, p.generation || 1), 0);
    const nextGen = maxGen + 1;

    const students = STORAGE.getStudents();
    const rooms = STORAGE.getRooms();

    const plan = SeatingAlgorithm.generate(students, rooms, { generation: nextGen, examId: exam.id, examName: exam.name });
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

  async getCurrentPlanAsync(examId, generation) {
    return STORAGE.getSeatingPlanAsync(examId, generation);
  },

  /** Get all generations list for an exam (sorted newest first) */
  getGenerationsForExam(examId) {
    if (!examId) return [];
    const plans = STORAGE.getSeatingPlans();
    return plans.filter((p) => p.examId === examId || String(p.exam) === String(examId)).sort((a, b) => (b.generation || 0) - (a.generation || 0));
  },

  /** Attempt to move `rollNo` into (roomNumber, row, col) for a specific plan */
  async overrideSeat(roomNumber, row, col, rollNo, examId, generation) {
    if (typeof API !== "undefined" && API.seating) {
      const res = await API.seating.override({
        roomNumber,
        row,
        col,
        rollNo,
        examId,
        generation,
      });

      if (res.ok) {
        if (res.plan) {
          STORAGE.setSeatingPlan(res.plan);
        }
        await STORAGE.sync();
        return { ok: true, message: res.message || "Seat updated successfully.", plan: res.plan };
      } else if (res.conflict) {
        return {
          ok: false,
          conflict: true,
          message: res.message,
          suggestions: res.suggestions || [],
        };
      }
      return { ok: false, message: res.message || "Override failed." };
    }

    // Local fallback
    const plan = STORAGE.getSeatingPlan(examId, generation);
    if (!plan) return { ok: false, message: "No seating plan exists for this examination." };

    const numericRow = Number(row);
    const numericCol = Number(col);
    const destRoom = plan.rooms.find((r) => r.roomNumber === roomNumber);
    if (!destRoom) return { ok: false, message: `Room ${roomNumber} not found in the current seating plan.` };

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

    if (!student) return { ok: false, message: "Student not found in this seating plan." };

    const conflictsExist = SeatingAlgorithm.wouldConflict(plan, roomNumber, numericRow, numericCol, student.subject, rollNo);
    if (conflictsExist) {
      const suggestions = SeatingAlgorithm.suggestSeats(plan, student.subject, rollNo, 3);
      return {
        ok: false,
        conflict: true,
        message: `⚠ CONFLICT DETECTED — ${student.subject} cannot be placed next to another ${student.subject} student.`,
        suggestions,
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
      seatingPlanId: plan.id,
    };

    if (destOccupant) {
      srcRoom.grid[source.row][source.col] = {
        ...destOccupant,
        seat: typeof seatLabel === "function" ? seatLabel(source.row, source.col) : `R${source.row}C${source.col}`,
        row: source.row,
        col: source.col,
        examId: plan.examId,
        seatingPlanId: plan.id,
      };
    } else {
      srcRoom.grid[source.row][source.col] = null;
    }

    STORAGE.setSeatingPlan(plan);
    STORAGE.logActivity(`Admin manually moved ${rollNo} to ${roomNumber} seat in ${plan.examName}`);
    return { ok: true, message: "Seat updated successfully.", plan };
  },

  /** Force-apply an override even if it conflicts */
  async forceOverrideSeat(roomNumber, row, col, rollNo, examId, generation) {
    if (typeof API !== "undefined" && API.seating) {
      const res = await API.seating.forceOverride({
        roomNumber,
        row,
        col,
        rollNo,
        examId,
        generation,
      });

      if (res.ok) {
        if (res.plan) {
          STORAGE.setSeatingPlan(res.plan);
        }
        await STORAGE.sync();
        return { ok: true, message: res.message || "Override applied (conflict retained).", plan: res.plan };
      }
      return { ok: false, message: res.message || "Force override failed." };
    }

    return this.overrideSeat(roomNumber, row, col, rollNo, examId, generation);
  },

  async applySuggestion(rollNo, suggestion, examId, generation) {
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
              generation: plan.generation,
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
                generation: plan.generation,
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
  },
};