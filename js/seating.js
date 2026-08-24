/* ==========================================================================
   seating.js — SEATWISE Multi-Exam Seating Manager
   Orchestration layer between the UI, STORAGE and SeatingAlgorithm.
   Handles per-exam plan generation, multi-generation tracking,
   manual override, and per-exam student seat lookups.

   STUDENT FILTERING RULE:
   Students are filtered by DEPARTMENT + SEMESTER only.
   The Exam/Subject selection identifies the paper, NOT the student filter.
   ========================================================================== */

const Seating = {

  /**
   * Extracts all digit numbers from a raw semester string.
   * "5"           -> [5]
   * "5/6"         -> [5, 6]
   * "SEMESTER 5"  -> [5]
   * "4th Semester" -> [4]
   */
  _extractSemesterNumbers(raw) {
    if (raw === null || raw === undefined || raw === "") return [];
    const str = String(raw).trim();
    const matches = str.match(/\d+/g);
    return matches ? matches.map((m) => parseInt(m, 10)) : [];
  },

  /**
   * Returns true if filterSem and studentSem share at least one digit.
   * "SEMESTER 5" matches "5", "5/6", "5th", "SEMESTER 5"
   */
  _semestersMatch(filterSem, studentSem) {
    if (!filterSem) return true;
    if (!studentSem && studentSem !== 0) return true;

    const filterNums = this._extractSemesterNumbers(filterSem);
    const studentNums = this._extractSemesterNumbers(studentSem);

    if (filterNums.length === 0 || studentNums.length === 0) return true;

    return filterNums.some((fNum) => studentNums.includes(fNum));
  },

  _getEligibleStudents() {
    const allStudents = STORAGE.getStudents();
    return allStudents
      .filter((s) => s.status !== "disabled" && !s.disabled)
      .map((s) => ({
        ...s,
        course: String(s.course || s.stream || s.department || "").trim().toUpperCase(),
        semester: s.semester
      }));
  },

  /**
   * Filter students by DEPARTMENT + SEMESTER only.
   * The 'subject' field in combos is NOT used for student filtering —
   * it is only metadata to label the seating plan.
   */
  _filterByDeptAndSemester(students, combos) {
    const activeCombos = (combos || []).filter((c) =>
      (c.dept && c.dept.trim()) || (c.semester && c.semester.trim())
    );

    if (activeCombos.length === 0) return students;

    const seen = new Set();
    const result = [];

    for (const student of students) {
      if (seen.has(student.id)) continue;

      const studentDept = String(student.course || student.stream || student.department || "").trim().toUpperCase();

      const matchesAny = activeCombos.some((combo) => {
        const comboDept = String(combo.dept || combo.stream || combo.course || "").trim().toUpperCase();
        const comboSem = combo.semester;

        const deptMatch = !comboDept || studentDept === comboDept;
        const semMatch = this._semestersMatch(comboSem, student.semester);

        return deptMatch && semMatch;
      });

      if (matchesAny) {
        result.push(student);
        seen.add(student.id);
      }
    }

    return result;
  },

  // Keep old name as alias for backward compat with generate-seating.html
  _filterBySubjectStreamCombos(students, combos, targetExam) {
    return this._filterByDeptAndSemester(students, combos);
  },

  _validateCapacity(students, rooms) {
    const totalCapacity = rooms.reduce(
      (sum, r) => sum + Number(r.rows) * Number(r.cols), 0
    );
    const reserved = SeatingAlgorithm.RESERVED_SEATS || 2;
    const usable = totalCapacity - reserved;

    if (students.length === 0) {
      return { ok: false, message: "No eligible active students match the selected Department + Semester criteria." };
    }
    if (totalCapacity === 0) {
      return { ok: false, message: "No classrooms configured/selected. Please select at least one classroom." };
    }
    if (students.length > usable) {
      return {
        ok: false,
        insufficient: true,
        message: `Not enough seats.\n\nStudents selected: ${students.length}\nAvailable seats after ${reserved} reserved seats: ${usable}\n\nPlease allocate more classrooms or refine the selection.`
      };
    }
    return { ok: true };
  },

  generateNew(examId, filterCombos = [], selectedRoomNumbers = []) {
    return this._generate(examId, filterCombos, selectedRoomNumbers, 1);
  },

  regenerate(examId, filterCombos = [], selectedRoomNumbers = []) {
    const allPlans = STORAGE.getSeatingPlans();
    const examPlans = allPlans.filter((p) => p.examId === examId);
    const maxGen = examPlans.reduce((max, p) => Math.max(max, p.generation || 1), 0);
    const nextGen = maxGen + 1;
    return this._generate(examId, filterCombos, selectedRoomNumbers, nextGen);
  },

  _generate(examId, combos, selectedRoomNumbers, generation) {
    const exams = STORAGE.getExams();
    const exam = exams.find((e) => e.id === examId) || (typeof Exams !== "undefined" ? Exams.activeExam() : exams[0]);

    if (!exam) {
      throw new Error("Cannot generate seating: No valid examination selected.");
    }

    let rooms = STORAGE.getRooms();
    if (selectedRoomNumbers && selectedRoomNumbers.length > 0) {
      rooms = rooms.filter((r) => selectedRoomNumbers.includes(r.roomNumber));
    }

    if (rooms.length === 0) {
      throw new Error("Cannot generate seating: No classrooms selected. Please select at least one classroom.");
    }

    let students = this._getEligibleStudents();
    students = this._filterByDeptAndSemester(students, combos);

    // Stamp the exam subject onto all filtered students so the algorithm can use it
    const examSubject = String(exam.name || "").trim().toUpperCase();
    students = students.map((s) => ({
      ...s,
      subject: examSubject || String(s.subject || s.course || "").trim().toUpperCase()
    }));

    const capacityCheck = this._validateCapacity(students, rooms);
    if (!capacityCheck.ok) {
      throw new Error(capacityCheck.message);
    }

    const plan = SeatingAlgorithm.generate(
      students,
      rooms,
      { generation, examId: exam.id, examName: exam.name }
    );

    plan.id = typeof generateId === "function" ? generateId("plan") : "plan_" + Date.now();
    plan.examId = exam.id;
    plan.examName = exam.name;
    plan.generation = generation;
    plan.isActive = true;

    if (combos && combos.length > 0) {
      plan.filterCombos = combos;
    }
    if (selectedRoomNumbers && selectedRoomNumbers.length > 0) {
      plan.allocatedRooms = selectedRoomNumbers;
    }

    this._stampAssignments(plan);

    STORAGE.setSeatingPlan(plan);
    STORAGE.logActivity(`Seating generated for ${exam.name} (Gen ${generation}) in ${rooms.length} classroom(s) — ${plan.stats.totalStudents} students, ${plan.stats.totalConflicts} conflicts, ${SeatingAlgorithm.RESERVED_SEATS} seats reserved`);

    return plan;
  },

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

  getCurrentPlan(examId, generation) {
    return STORAGE.getSeatingPlan(examId, generation);
  },

  getGenerationsForExam(examId) {
    if (!examId) return [];
    const plans = STORAGE.getSeatingPlans();
    return plans.filter((p) => p.examId === examId).sort((a, b) => (b.generation || 0) - (a.generation || 0));
  },

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

    const conflictsExist = SeatingAlgorithm.wouldConflict(plan, roomNumber, numericRow, numericCol, student.subject, rollNo, student.course || "");
    if (conflictsExist) {
      const suggestions = SeatingAlgorithm.suggestSeats(plan, student.subject, rollNo, 3, student.course || "");
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