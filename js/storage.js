/* ==========================================================================
   storage.js
   Single source of truth for all LocalStorage reads/writes.
   -------------------------------------------------------------------------
   Every other module (auth.js, students.js, rooms.js, seating.js, ...)
   must go through the STORAGE object instead of calling
   localStorage.getItem / setItem directly. This keeps the persistence
   layer swappable -- in Phase 2 (MERN) these functions become fetch()
   calls to Express/MongoDB REST endpoints without touching UI code.
   ========================================================================== */

const STORAGE_KEYS = Object.freeze({
  USERS: "examseat_users",
  CURRENT_USER: "examseat_current_user",
  ADMIN_SESSION: "examseat_admin_session",
  EXAMS: "examseat_exams",
  STUDENTS: "examseat_students",
  ROOMS: "examseat_rooms",
  SEATING_PLAN: "examseat_seating_plan",
  SEATING_PLANS: "examseat_seating_plans",
  ACTIVITY: "examseat_activity",
  COMPLAINTS: "examseat_complaints",
  SEEDED: "examseat_seeded"
});

const STORAGE = {
  /** Generic get with JSON parsing + fallback default */
  get(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      if (raw === null || raw === undefined) return fallback;
      return JSON.parse(raw);
    } catch (e) {
      console.error(`STORAGE.get failed for key "${key}"`, e);
      return fallback;
    }
  },

  /** Generic set with JSON serialization */
  set(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (e) {
      console.error(`STORAGE.set failed for key "${key}"`, e);
      return false;
    }
  },

  remove(key) {
    localStorage.removeItem(key);
  },

  clearAll() {
    Object.values(STORAGE_KEYS).forEach((k) => localStorage.removeItem(k));
  },

  // ---- convenience accessors -------------------------------------------
  getUsers() { return this.get(STORAGE_KEYS.USERS, []); },
  setUsers(users) { return this.set(STORAGE_KEYS.USERS, users); },

  getCurrentUser() { return this.get(STORAGE_KEYS.CURRENT_USER, null); },
  setCurrentUser(user) { return this.set(STORAGE_KEYS.CURRENT_USER, user); },
  clearCurrentUser() { this.remove(STORAGE_KEYS.CURRENT_USER); },

  isAdminSession() { return this.get(STORAGE_KEYS.ADMIN_SESSION, false) === true; },
  setAdminSession(val) { return this.set(STORAGE_KEYS.ADMIN_SESSION, val); },
  clearAdminSession() { this.remove(STORAGE_KEYS.ADMIN_SESSION); },

  getExams() { return this.get(STORAGE_KEYS.EXAMS, []); },
  setExams(exams) { return this.set(STORAGE_KEYS.EXAMS, exams); },

  getStudents() {
    const list = this.get(STORAGE_KEYS.STUDENTS, []);
    return list.map((s, idx) => ({
      ...s,
      id: s.id || `student_${s.rollNo || idx}`,
      rollNo: (s.rollNo || "").toString().trim().toUpperCase(),
      email: (s.email || `${s.rollNo || idx}@student.com`).toString().trim(),
      name: (s.name || "Student").toString().trim(),
      password: s.password || "student123",
      role: "student",
      disabled: s.disabled === true
    }));
  },
  setStudents(students) { return this.set(STORAGE_KEYS.STUDENTS, students); },

  getRooms() { return this.get(STORAGE_KEYS.ROOMS, []); },
  setRooms(rooms) { return this.set(STORAGE_KEYS.ROOMS, rooms); },

  // ---- multi-exam seating plan storage ---------------------------------
  getSeatingPlans() {
    let plans = this.get(STORAGE_KEYS.SEATING_PLANS, null);
    if (!plans) {
      plans = [];
      // Safe migration for legacy single plan
      const oldPlan = this.get(STORAGE_KEYS.SEATING_PLAN, null);
      if (oldPlan) {
        const exams = this.getExams();
        const exam = exams[0] || { id: "exam_default", name: "Examination" };
        oldPlan.examId = oldPlan.examId || exam.id;
        oldPlan.examName = oldPlan.examName || exam.name;
        oldPlan.generation = oldPlan.generation || 1;
        oldPlan.isActive = true;
        plans.push(oldPlan);
        this.set(STORAGE_KEYS.SEATING_PLANS, plans);
      }
    }
    return plans;
  },

  setSeatingPlans(plans) {
    return this.set(STORAGE_KEYS.SEATING_PLANS, plans);
  },

  getSeatingPlan(examId, generation) {
    const plans = this.getSeatingPlans();
    if (!examId) {
      return plans.find((p) => p.isActive) || plans[0] || null;
    }
    const examPlans = plans.filter((p) => p.examId === examId);
    if (examPlans.length === 0) return null;
    if (generation !== undefined && generation !== null && generation !== "") {
      return examPlans.find((p) => p.generation === Number(generation)) || null;
    }
    return examPlans.find((p) => p.isActive === true) || examPlans.sort((a, b) => b.generation - a.generation)[0] || null;
  },

  setSeatingPlan(plan) {
    if (!plan || !plan.examId) return false;
    const plans = this.getSeatingPlans();
    
    // Archive previous active plans for this examId
    plans.forEach((p) => {
      if (p.examId === plan.examId) {
        p.isActive = false;
      }
    });

    plan.isActive = true;
    const existingIndex = plans.findIndex((p) => p.id === plan.id || (p.examId === plan.examId && p.generation === plan.generation));
    if (existingIndex >= 0) {
      plans[existingIndex] = plan;
    } else {
      plans.push(plan);
    }

    this.set(STORAGE_KEYS.SEATING_PLANS, plans);
    this.set(STORAGE_KEYS.SEATING_PLAN, plan);
    return true;
  },

  deleteSeatingPlansForExam(examId) {
    if (!examId) return;
    const plans = this.getSeatingPlans();
    const filtered = plans.filter((p) => p.examId !== examId);
    this.setSeatingPlans(filtered);
  },

  clearSeatingPlan() {
    this.remove(STORAGE_KEYS.SEATING_PLAN);
    this.remove(STORAGE_KEYS.SEATING_PLANS);
  },

  getActivity() { return this.get(STORAGE_KEYS.ACTIVITY, []); },
  logActivity(message) {
    const activity = this.getActivity();
    activity.unshift({ message, time: new Date().toISOString() });
    // keep only the most recent 30 entries
    this.set(STORAGE_KEYS.ACTIVITY, activity.slice(0, 30));
  },

  getComplaints() { return this.get(STORAGE_KEYS.COMPLAINTS, []); },
  setComplaints(complaints) { return this.set(STORAGE_KEYS.COMPLAINTS, complaints); },
  addComplaint(complaint) {
    const complaints = this.getComplaints();
    complaint.unread = false;
    complaint.adminReply = "";
    complaints.unshift(complaint);
    this.setComplaints(complaints);
    this.logActivity(`Complaint submitted by ${complaint.userName || "User"}`);
    return true;
  },
  updateComplaintStatus(id, newStatus, adminReply) {
    const complaints = this.getComplaints();
    const idx = complaints.findIndex((c) => c.id === id);
    if (idx === -1) return false;
    if (newStatus) complaints[idx].status = newStatus;
    if (adminReply !== undefined) complaints[idx].adminReply = adminReply;
    complaints[idx].unread = true; // Flag as unread for the student notification badge
    this.setComplaints(complaints);
    this.logActivity(`Complaint status updated to "${newStatus}" with reply`);
    return true;
  },
  markComplaintRead(id) {
    const complaints = this.getComplaints();
    const idx = complaints.findIndex((c) => c.id === id);
    if (idx === -1) return false;
    complaints[idx].unread = false;
    this.setComplaints(complaints);
    return true;
  }
};
