/* ==========================================================================
   exams.js — SEATWISE Examination Manager
   CRUD and validation for examinations.
   Each exam: { id, name, date, time, semester, duration }
   ========================================================================== */

const Exams = {
  all() {
    const exams = STORAGE.getExams();
    let updated = false;
    exams.forEach((e) => {
      const normSem = this.formatSemester(e.semester);
      const normDur = this.formatDuration(e.duration);
      if (e.semester !== normSem) {
        e.semester = normSem;
        updated = true;
      }
      if (e.duration !== normDur) {
        e.duration = normDur;
        updated = true;
      }
    });
    if (updated) STORAGE.setExams(exams);
    return exams;
  },

  /**
   * Formats raw semester input string into canonical "SEMESTER X" format.
   * Examples:
   *   "5 sem"        -> "SEMESTER 5"
   *   "5"            -> "SEMESTER 5"
   *   "5th"          -> "SEMESTER 5"
   *   "5th Semester" -> "SEMESTER 5"
   */
  formatSemester(raw) {
    if (!raw && raw !== 0) return "";
    const str = String(raw).trim();
    const match = str.match(/\d+/);
    if (match) {
      return `SEMESTER ${match[0]}`;
    }
    return str.toUpperCase();
  },

  /**
   * Formats raw duration input string into canonical "X HOURS YY MINS" format.
   * Examples:
   *   "2"           -> "2 HOURS 00 MINS"
   *   "2 hrs"       -> "2 HOURS 00 MINS"
   *   "2 hours"     -> "2 HOURS 00 MINS"
   *   "2:30"        -> "2 HOURS 30 MINS"
   *   "2.5"         -> "2 HOURS 30 MINS"
   *   "3"           -> "3 HOURS 00 MINS"
   *   "3 hours"     -> "3 HOURS 00 MINS"
   */
  formatDuration(raw) {
    if (!raw && raw !== 0) return "2 HOURS 00 MINS";
    const str = String(raw).trim().toLowerCase();

    // Check HH:MM format like "02:30" or "2:00"
    const timeMatch = str.match(/^(\d{1,2}):(\d{2})$/);
    if (timeMatch) {
      const h = parseInt(timeMatch[1], 10);
      const m = parseInt(timeMatch[2], 10);
      return m > 0 ? `${h} HOURS ${String(m).padStart(2, "0")} MINS` : `${h} HOURS 00 MINS`;
    }

    // Check decimal format like "2.5" -> 2 hours 30 mins
    const decMatch = str.match(/^(\d+(?:\.\d+)?)$/);
    if (decMatch) {
      const val = parseFloat(decMatch[1]);
      const h = Math.floor(val);
      const m = Math.round((val - h) * 60);
      return m > 0 ? `${h} HOURS ${String(m).padStart(2, "0")} MINS` : `${h} HOURS 00 MINS`;
    }

    // Extract hours and minutes from text like "2 hours 30 mins" or "2 hrs"
    const hMatch = str.match(/(\d+)\s*(?:h|hr|hrs|hour|hours)/i);
    const mMatch = str.match(/(\d+)\s*(?:m|min|mins|minute|minutes)/i);

    let h = hMatch ? parseInt(hMatch[1], 10) : null;
    let m = mMatch ? parseInt(mMatch[1], 10) : 0;

    if (h === null) {
      const anyNum = str.match(/\d+/);
      h = anyNum ? parseInt(anyNum[0], 10) : 2;
    }

    return m > 0 ? `${h} HOURS ${String(m).padStart(2, "0")} MINS` : `${h} HOURS 00 MINS`;
  },

  /**
   * Checks if an exam with the same name, semester, date, and time already exists.
   */
  isDuplicate({ name, date, time, semester }, excludeId = null) {
    const exams = STORAGE.getExams();
    const normName = String(name || "").trim().toLowerCase();
    const normSem  = this.formatSemester(semester);
    const normDate = String(date || "").trim();
    const normTime = String(time || "").trim();

    return exams.some((e) => {
      if (excludeId && e.id === excludeId) return false;
      const eName = String(e.name || "").trim().toLowerCase();
      const eSem  = this.formatSemester(e.semester);
      const eDate = String(e.date || "").trim();
      const eTime = String(e.time || "").trim();

      return eName === normName && eSem === normSem && eDate === normDate && eTime === normTime;
    });
  },

  add({ name, date, time, semester, duration }) {
    const normSem = this.formatSemester(semester);
    const normDur = this.formatDuration(duration);

    if (this.isDuplicate({ name, date, time, semester: normSem })) {
      return {
        ok: false,
        message: `⚠ Duplicate Examination Error: Examination "${name}" for ${normSem || 'this semester'} is already scheduled on ${date} at ${time}.`
      };
    }

    const exams = STORAGE.getExams();
    const exam = {
      id: generateId("exam"),
      name: String(name || "").trim(),
      date: String(date || "").trim(),
      time: String(time || "").trim(),
      semester: normSem,
      duration: normDur
    };

    exams.push(exam);
    STORAGE.setExams(exams);
    STORAGE.logActivity(`Exam created: ${exam.name} (${normSem})`);
    return { ok: true, exam };
  },

  update(id, updates) {
    const exams = STORAGE.getExams();
    const idx = exams.findIndex((e) => e.id === id);
    if (idx === -1) return { ok: false, message: "Exam not found." };

    const current = exams[idx];
    const newName = updates.name !== undefined ? String(updates.name).trim() : current.name;
    const newDate = updates.date !== undefined ? String(updates.date).trim() : current.date;
    const newTime = updates.time !== undefined ? String(updates.time).trim() : current.time;
    const newSem  = updates.semester !== undefined ? this.formatSemester(updates.semester) : current.semester;
    const newDur  = updates.duration !== undefined ? this.formatDuration(updates.duration) : current.duration;

    if (this.isDuplicate({ name: newName, date: newDate, time: newTime, semester: newSem }, id)) {
      return {
        ok: false,
        message: `⚠ Duplicate Examination Error: Examination "${newName}" for ${newSem || 'this semester'} is already scheduled on ${newDate} at ${newTime}.`
      };
    }

    exams[idx] = {
      ...current,
      ...updates,
      name: newName,
      date: newDate,
      time: newTime,
      semester: newSem,
      duration: newDur
    };

    STORAGE.setExams(exams);

    // Update examName in seating plans tied to this examId
    const plans = STORAGE.getSeatingPlans();
    let updatedPlans = false;
    plans.forEach((p) => {
      if (p.examId === id && updates.name) {
        p.examName = updates.name;
        updatedPlans = true;
      }
    });
    if (updatedPlans) STORAGE.setSeatingPlans(plans);

    STORAGE.logActivity(`Exam updated: ${exams[idx].name}`);
    return { ok: true, exam: exams[idx] };
  },

  remove(id) {
    const exams = STORAGE.getExams();
    const exam = exams.find((e) => e.id === id);
    STORAGE.setExams(exams.filter((e) => e.id !== id));
    STORAGE.deleteSeatingPlansForExam(id);
    if (exam) STORAGE.logActivity(`Exam removed: ${exam.name}`);
    return { ok: true };
  },

  activeExam() {
    const exams = STORAGE.getExams();
    if (exams.length === 0) return null;
    const sorted = [...exams].sort((a, b) => new Date(a.date) - new Date(b.date));
    const now = new Date();
    return sorted.find((e) => new Date(e.date) >= now) || sorted[0];
  },

  getExamsForStudent(user) {
    if (!user) return [];
    const allExams = this.all();
    const students = STORAGE.getStudents().filter((s) => s.status !== "disabled" && !s.disabled);
    
    const studentDept = String(user.course || user.stream || user.department || "").trim().toUpperCase();
    
    return allExams.filter((exam) => {
      // 1. Check if semester matches using robust digit overlap check
      let semMatch = false;
      if (typeof Seating !== "undefined" && typeof Seating._semestersMatch === "function") {
        semMatch = Seating._semestersMatch(exam.semester, user.semester);
      } else {
        const extractNums = (raw) => {
          if (raw === null || raw === undefined || raw === "") return [];
          const matches = String(raw).trim().match(/\d+/g);
          return matches ? matches.map((m) => parseInt(m, 10)) : [];
        };
        const filterNums = extractNums(exam.semester);
        const studentNums = extractNums(user.semester);
        semMatch = filterNums.length === 0 || studentNums.length === 0 || filterNums.some((n) => studentNums.includes(n));
      }

      if (!semMatch) return false;

      // 2. Check if student's rollNo is directly assigned a seat in this exam's plan
      let hasSeat = false;
      let planMatchesDept = false;
      if (typeof Seating !== "undefined" && typeof Seating.getCurrentPlan === "function") {
        const plan = Seating.getCurrentPlan(exam.id);
        if (plan) {
          hasSeat = plan.rooms.some(r => r.grid.some(row => row.some(seat => seat && seat.rollNo === user.rollNo)));
          planMatchesDept = plan.rooms.some(r => r.grid.some(row => row.some(seat => seat && !seat.isReserved && String(seat.course || "").trim().toUpperCase() === studentDept)));
        }
      }
      if (hasSeat) return true;

      // 3. Check if any student of the same Dept + Semester has this subject/exam name
      const hasStudentWithSubject = students.some((s) => {
        const sDept = String(s.course || s.stream || s.department || "").trim().toUpperCase();
        let sSemMatch = false;
        if (typeof Seating !== "undefined" && typeof Seating._semestersMatch === "function") {
          sSemMatch = Seating._semestersMatch(exam.semester, s.semester);
        } else {
          const extractNums = (raw) => {
            if (raw === null || raw === undefined || raw === "") return [];
            const matches = String(raw).trim().match(/\d+/g);
            return matches ? matches.map((m) => parseInt(m, 10)) : [];
          };
          const filterNums = extractNums(exam.semester);
          const studentNums = extractNums(s.semester);
          sSemMatch = filterNums.length === 0 || studentNums.length === 0 || filterNums.some((n) => studentNums.includes(n));
        }

        const sSubMatch = String(s.subject || "").trim().toUpperCase() === String(exam.name || "").trim().toUpperCase();
        return sDept === studentDept && sSemMatch && sSubMatch;
      });

      if (hasStudentWithSubject || planMatchesDept) return true;

      // 4. Fallback: If no students have subjects set, show exams of their semester if no other dept matches
      const otherDeptsHaveSubject = students.some((s) => {
        const sDept = String(s.course || s.stream || s.department || "").trim().toUpperCase();
        const sSubMatch = String(s.subject || "").trim().toUpperCase() === String(exam.name || "").trim().toUpperCase();
        return sDept !== studentDept && sSubMatch;
      });

      return !otherDeptsHaveSubject;
    });
  }
};
