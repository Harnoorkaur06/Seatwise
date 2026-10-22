/* ==========================================================================
   exams.js — SEATWISE Examination Record Manager (MongoDB Edition)
   CRUD for examinations. Each exam:
   { id, name, date, time, semester, duration }
   ========================================================================== */

const Exams = {
  all() {
    return STORAGE.getExams();
  },

  async allAsync() {
    return STORAGE.getExamsAsync();
  },

  async add({ name, date, time, semester, duration }) {
    if (!name || !date || !time) {
      return { ok: false, message: "Exam name, date and time are required." };
    }

    const payload = {
      name: name.trim(),
      date,
      time,
      semester: (semester || "5th Semester").trim(),
      duration: (duration || "2 Hours").trim(),
    };

    if (typeof API !== "undefined" && API.exams) {
      const res = await API.exams.create(payload);
      if (res.ok) {
        await STORAGE.sync();
        return { ok: true, message: "Exam created successfully.", exam: res.exam };
      }
      return { ok: false, message: res.message || "Failed to create examination." };
    }

    const exams = STORAGE.getExams();
    const exam = { id: typeof generateId === "function" ? generateId("exam") : "exam_" + Date.now(), ...payload };
    exams.push(exam);
    STORAGE.setExams(exams);
    STORAGE.logActivity(`Exam created: ${name}`);
    return { ok: true, exam };
  },

  async update(id, updates) {
    if (typeof API !== "undefined" && API.exams) {
      const res = await API.exams.update(id, updates);
      if (res.ok) {
        await STORAGE.sync();
        return { ok: true, message: "Exam updated successfully.", exam: res.exam };
      }
      return { ok: false, message: res.message || "Failed to update examination." };
    }

    const exams = STORAGE.getExams();
    const idx = exams.findIndex((e) => e.id === id);
    if (idx === -1) return { ok: false, message: "Exam not found." };
    exams[idx] = { ...exams[idx], ...updates };
    STORAGE.setExams(exams);
    STORAGE.logActivity(`Exam updated: ${exams[idx].name}`);
    return { ok: true };
  },

  async remove(id) {
    if (typeof API !== "undefined" && API.exams) {
      const res = await API.exams.delete(id);
      if (res.ok) {
        await STORAGE.sync();
        return { ok: true, message: "Exam removed successfully." };
      }
      return { ok: false, message: res.message || "Failed to delete examination." };
    }

    const exams = STORAGE.getExams();
    const exam = exams.find((e) => e.id === id);
    STORAGE.setExams(exams.filter((e) => e.id !== id));
    STORAGE.deleteSeatingPlansForExam(id);
    if (exam) STORAGE.logActivity(`Exam removed: ${exam.name}`);
    return { ok: true };
  },

  activeExam(rollNo) {
    const exams = this.all();
    if (!exams || exams.length === 0) return null;

    // 1. If an active exam ID is saved in STORAGE and valid, prioritize it
    if (typeof STORAGE !== "undefined" && typeof STORAGE.getActiveExamId === "function") {
      const savedId = STORAGE.getActiveExamId();
      if (savedId) {
        const found = exams.find((e) => e.id === savedId || String(e._id) === String(savedId));
        if (found) return found;
      }
    }

    // Sort chronologically (earliest to latest)
    const sorted = [...exams].sort((a, b) => {
      const dtA = new Date(`${a.date}T${(a.time || "00:00").trim()}`).getTime() || 0;
      const dtB = new Date(`${b.date}T${(b.time || "00:00").trim()}`).getTime() || 0;
      return dtA - dtB;
    });

    const now = Date.now();
    // Consider exams happening today or upcoming (with a 3-hour window for active session)
    const upcoming = sorted.filter((e) => {
      const examTime = new Date(`${e.date}T${(e.time || "23:59").trim()}`).getTime();
      return isNaN(examTime) ? true : examTime >= (now - 3 * 3600 * 1000);
    });

    // 2. If student roll number provided, check if candidate has an upcoming allocated exam
    if (rollNo && typeof Seating !== "undefined" && typeof Seating.findByRollNo === "function") {
      const allocatedUpcoming = upcoming.find((e) => Seating.findByRollNo(rollNo, e.id));
      if (allocatedUpcoming) return allocatedUpcoming;
    }

    // 3. Otherwise return the earliest upcoming/today exam
    if (upcoming.length > 0) {
      return upcoming[0];
    }

    // 4. Fallback to latest scheduled exam if all are past
    return sorted[sorted.length - 1];
  },
};

