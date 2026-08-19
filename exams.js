/* ==========================================================================
   exams.js
   CRUD for examinations. Each exam:
   { id, name, date, time, semester, duration }
   ========================================================================== */

const Exams = {
  all() { return STORAGE.getExams(); },

  add({ name, date, time, semester, duration }) {
    const exams = STORAGE.getExams();
    const exam = { id: generateId("exam"), name, date, time, semester, duration };
    exams.push(exam);
    STORAGE.setExams(exams);
    STORAGE.logActivity(`Exam created: ${name}`);
    return { ok: true, exam };
  },

  update(id, updates) {
    const exams = STORAGE.getExams();
    const idx = exams.findIndex((e) => e.id === id);
    if (idx === -1) return { ok: false, message: "Exam not found." };
    exams[idx] = { ...exams[idx], ...updates };
    STORAGE.setExams(exams);
    STORAGE.logActivity(`Exam updated: ${exams[idx].name}`);
    return { ok: true };
  },

  remove(id) {
    const exams = STORAGE.getExams();
    const exam = exams.find((e) => e.id === id);
    STORAGE.setExams(exams.filter((e) => e.id !== id));
    if (exam) STORAGE.logActivity(`Exam removed: ${exam.name}`);
    return { ok: true };
  },

  /** The exam admin should treat as "active" -- the earliest upcoming one */
  activeExam() {
    const exams = STORAGE.getExams();
    if (exams.length === 0) return null;
    const sorted = [...exams].sort((a, b) => new Date(a.date) - new Date(b.date));
    const now = new Date();
    return sorted.find((e) => new Date(e.date) >= now) || sorted[0];
  }
};
