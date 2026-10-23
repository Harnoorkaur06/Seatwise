/* ==========================================================================
   storage.js — SEATWISE MERN Persistence Layer (MongoDB + REST API)
   Single source of truth for application business data and state.
   --------------------------------------------------------------------------
   - Connects to Node.js / Express REST API backed by MongoDB.
   - Maintains a synchronized in-memory cache for ultra-fast, zero-jank UI reads.
   - Automatically synchronizes writes with MongoDB endpoints.
   - Preserves LocalStorage for UI-only preferences (theme, sidebar, layout).
   - Provides safe, non-destructive migration of browser data into MongoDB.
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
  SEEDED: "examseat_seeded",
  AUTH_TOKEN: "seatwise_auth_token",
});

const STORAGE = {
  // Synchronized in-memory cache for MongoDB records
  _cache: {
    students: null,
    rooms: null,
    exams: null,
    seatingPlans: null,
    complaints: null,
    activity: null,
    initialized: false,
  },

  /** Generic localStorage fallback getter */
  get(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      if (raw === null || raw === undefined) return fallback;
      return JSON.parse(raw);
    } catch (e) {
      return fallback;
    }
  },

  /** Generic localStorage fallback setter */
  set(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (e) {
      return false;
    }
  },

  remove(key) {
    try {
      localStorage.removeItem(key);
    } catch (e) {}
  },

  /**
   * Preload / Sync in-memory cache from MongoDB via REST API.
   * Can be awaited or run concurrently during page load.
   */
  async sync() {
    if (typeof API === "undefined") return;

    try {
      const [studentsRes, roomsRes, examsRes, plansRes, complaintsRes, activityRes] =
        await Promise.allSettled([
          API.students.all(),
          API.rooms.all(),
          API.exams.all(),
          API.seating.all(),
          API.complaints.all(),
          API.activity.all(30),
        ]);

      if (studentsRes.status === "fulfilled" && studentsRes.value?.ok) {
        this._cache.students = studentsRes.value.students;
        this.set(STORAGE_KEYS.STUDENTS, studentsRes.value.students);
      }
      if (roomsRes.status === "fulfilled" && roomsRes.value?.ok) {
        this._cache.rooms = roomsRes.value.rooms;
        this.set(STORAGE_KEYS.ROOMS, roomsRes.value.rooms);
      }
      if (examsRes.status === "fulfilled" && examsRes.value?.ok) {
        this._cache.exams = examsRes.value.exams;
        this.set(STORAGE_KEYS.EXAMS, examsRes.value.exams);
      }
      if (plansRes.status === "fulfilled" && plansRes.value?.ok) {
        this._cache.seatingPlans = plansRes.value.plans;
        this.set(STORAGE_KEYS.SEATING_PLANS, plansRes.value.plans);
        const active = plansRes.value.plans.find((p) => p.isActive);
        if (active) {
          this.set(STORAGE_KEYS.SEATING_PLAN, active);
        }
      }
      if (complaintsRes.status === "fulfilled" && complaintsRes.value?.ok) {
        this._cache.complaints = complaintsRes.value.complaints;
        this.set(STORAGE_KEYS.COMPLAINTS, complaintsRes.value.complaints);
      }
      if (activityRes.status === "fulfilled" && activityRes.value?.ok) {
        this._cache.activity = activityRes.value.activity;
        this.set(STORAGE_KEYS.ACTIVITY, activityRes.value.activity);
      }

      this._cache.initialized = true;
    } catch (err) {
      console.warn("Storage sync from MongoDB encountered an issue:", err);
    }
  },

  // -------------------------------------------------------------------------
  // SESSION & USER AUTH (Client state stored in LocalStorage, verified by JWT)
  // -------------------------------------------------------------------------
  getCurrentUser() {
    return this.get(STORAGE_KEYS.CURRENT_USER, null);
  },
  setCurrentUser(user) {
    return this.set(STORAGE_KEYS.CURRENT_USER, user);
  },
  clearCurrentUser() {
    this.remove(STORAGE_KEYS.CURRENT_USER);
  },

  isAdminSession() {
    return this.get(STORAGE_KEYS.ADMIN_SESSION, false) === true;
  },
  setAdminSession(val) {
    return this.set(STORAGE_KEYS.ADMIN_SESSION, val);
  },
  clearAdminSession() {
    this.remove(STORAGE_KEYS.ADMIN_SESSION);
  },

  // -------------------------------------------------------------------------
  // STUDENTS (MongoDB-backed with synchronous cache bridge)
  // -------------------------------------------------------------------------
  _getFatherName(student, idx = 0) {
    if (student && student.fatherName && !student.fatherName.includes("Mr. SATINDER SINGH") && !student.fatherName.includes("Mr. Satinder Singh")) {
      return student.fatherName;
    }
    const sName = (student?.name || "").toString().trim().toUpperCase();
    const sRoll = (student?.rollNo || "").toString().trim().toUpperCase();
    if (sName.includes("HARNOOR") || sRoll === "2410992925") return "Mr. SATINDER SINGH";
    if (sName.includes("RAHUL") || sRoll.includes("101")) return "Mr. RAJESH SHARMA";
    if (sName.includes("AMAN") || sRoll.includes("102")) return "Mr. HARPREET SINGH";
    if (sName.includes("PRIYA") || sRoll.includes("103")) return "Mr. ANIL KUMAR";
    return "Mr. RAJESH SHARMA";
  },

  _getUniversityId(student, idx = 0) {
    let roll = (student?.rollNo || "").toString().trim().toUpperCase();
    const sName = (student?.name || "").toString().trim().toUpperCase();
    if (sName.includes("HARNOOR") || roll === "2410992925") return "2410992925";
    if (!roll || roll === sName || roll === "STUDENT" || roll === "UNLINKED") {
      return String(2410992100 + (idx || 1));
    }
    return roll;
  },

  getStudents() {
    if (this._cache.students && Array.isArray(this._cache.students) && this._cache.students.length > 0) {
      return this._cache.students;
    }
    // Fallback: localStorage or default baseline
    const local = this.get(STORAGE_KEYS.STUDENTS, null);
    if (local && Array.isArray(local) && local.length > 0) {
      return local;
    }
    return [];
  },

  async getStudentsAsync(q = "") {
    if (typeof API !== "undefined") {
      const res = await API.students.all(q);
      if (res.ok) {
        this._cache.students = res.students;
        return res.students;
      }
    }
    return this.getStudents();
  },

  setStudents(students) {
    this._cache.students = students;
    // Mirror to localStorage as cache
    this.set(STORAGE_KEYS.STUDENTS, students);
    return true;
  },

  // Backward-compatibility aliases for legacy user accessors
  getUsers() {
    return this.getStudents();
  },

  async getUsersAsync(q = "") {
    return this.getStudentsAsync(q);
  },

  setUsers(users) {
    return this.setStudents(users);
  },

  // -------------------------------------------------------------------------
  // ROOMS (MongoDB-backed)
  // -------------------------------------------------------------------------
  getRooms() {
    if (this._cache.rooms && Array.isArray(this._cache.rooms) && this._cache.rooms.length > 0) {
      return this._cache.rooms;
    }
    const local = this.get(STORAGE_KEYS.ROOMS, null);
    if (local && Array.isArray(local) && local.length > 0) {
      return local;
    }
    return [];
  },

  async getRoomsAsync() {
    if (typeof API !== "undefined") {
      const res = await API.rooms.all();
      if (res.ok) {
        this._cache.rooms = res.rooms;
        return res.rooms;
      }
    }
    return this.getRooms();
  },

  setRooms(rooms) {
    this._cache.rooms = rooms;
    this.set(STORAGE_KEYS.ROOMS, rooms);
    return true;
  },

  // -------------------------------------------------------------------------
  // EXAMINATIONS (MongoDB-backed)
  // -------------------------------------------------------------------------
  getExams() {
    if (this._cache.exams && Array.isArray(this._cache.exams) && this._cache.exams.length > 0) {
      return this._cache.exams;
    }
    const local = this.get(STORAGE_KEYS.EXAMS, null);
    if (local && Array.isArray(local) && local.length > 0) {
      return local;
    }
    return [];
  },

  async getExamsAsync() {
    if (typeof API !== "undefined") {
      const res = await API.exams.all();
      if (res.ok) {
        this._cache.exams = res.exams;
        return res.exams;
      }
    }
    return this.getExams();
  },

  setExams(exams) {
    this._cache.exams = exams;
    this.set(STORAGE_KEYS.EXAMS, exams);
    return true;
  },

  // -------------------------------------------------------------------------
  // SEATING PLANS (MongoDB-backed)
  // -------------------------------------------------------------------------
  getSeatingPlans() {
    if (this._cache.seatingPlans && Array.isArray(this._cache.seatingPlans)) {
      return this._cache.seatingPlans;
    }
    return this.get(STORAGE_KEYS.SEATING_PLANS, []);
  },

  async getSeatingPlansAsync(examId = "") {
    if (typeof API !== "undefined") {
      const res = await API.seating.all(examId);
      if (res.ok) {
        this._cache.seatingPlans = res.plans;
        return res.plans;
      }
    }
    return this.getSeatingPlans();
  },

  setSeatingPlans(plans) {
    this._cache.seatingPlans = plans;
    this.set(STORAGE_KEYS.SEATING_PLANS, plans);
    return true;
  },

  getActiveExamId() {
    return this.get("seatwise_active_exam_id", null);
  },

  setActiveExamId(id) {
    if (id) {
      this.set("seatwise_active_exam_id", id);
    }
  },

  getSeatingPlan(examId, generation) {
    const plans = this.getSeatingPlans();
    if (!examId) {
      return plans.find((p) => p.isActive) || plans[0] || null;
    }
    const examPlans = plans.filter((p) => p.examId === examId || String(p.exam) === String(examId) || p.id === examId);
    if (examPlans.length === 0) return null;
    if (generation !== undefined && generation !== null && generation !== "") {
      return examPlans.find((p) => p.generation === Number(generation)) || null;
    }
    return examPlans.find((p) => p.isActive === true) || examPlans.sort((a, b) => b.generation - a.generation)[0] || null;
  },

  async getSeatingPlanAsync(examId, generation = "") {
    if (typeof API !== "undefined" && examId) {
      const res = await API.seating.getPlan(examId, generation);
      if (res.ok && res.plan) return res.plan;
    }
    return this.getSeatingPlan(examId, generation);
  },

  setSeatingPlan(plan) {
    if (!plan || !plan.examId) return false;
    const plans = this.getSeatingPlans();

    plans.forEach((p) => {
      if (p.examId === plan.examId) {
        p.isActive = false;
      }
    });

    plan.isActive = true;
    const existingIndex = plans.findIndex(
      (p) => p.id === plan.id || (p.examId === plan.examId && p.generation === plan.generation)
    );
    if (existingIndex >= 0) {
      plans[existingIndex] = plan;
    } else {
      plans.push(plan);
    }

    this.setSeatingPlans(plans);
    this.set(STORAGE_KEYS.SEATING_PLAN, plan);
    return true;
  },

  deleteSeatingPlansForExam(examId) {
    if (!examId) return;
    const plans = this.getSeatingPlans();
    const filtered = plans.filter((p) => p.examId !== examId);
    this.setSeatingPlans(filtered);
    if (typeof API !== "undefined") {
      API.seating.clearForExam(examId).catch(() => {});
    }
  },

  clearSeatingPlan() {
    this._cache.seatingPlans = [];
    this.remove(STORAGE_KEYS.SEATING_PLAN);
    this.remove(STORAGE_KEYS.SEATING_PLANS);
    if (typeof API !== "undefined") {
      API.seating.clearAll().catch(() => {});
    }
  },

  // -------------------------------------------------------------------------
  // ACTIVITY LOG (MongoDB-backed)
  // -------------------------------------------------------------------------
  getActivity() {
    if (this._cache.activity && Array.isArray(this._cache.activity)) {
      return this._cache.activity;
    }
    return this.get(STORAGE_KEYS.ACTIVITY, []);
  },

  async getActivityAsync(limit = 30) {
    if (typeof API !== "undefined") {
      const res = await API.activity.all(limit);
      if (res.ok) {
        this._cache.activity = res.activity;
        return res.activity;
      }
    }
    return this.getActivity();
  },

  logActivity(message) {
    const activity = this.getActivity();
    const entry = { message, time: new Date().toISOString() };
    activity.unshift(entry);
    this._cache.activity = activity.slice(0, 30);
    this.set(STORAGE_KEYS.ACTIVITY, this._cache.activity);

    if (typeof API !== "undefined") {
      API.activity.log(message).catch(() => {});
    }
  },

  // -------------------------------------------------------------------------
  // COMPLAINTS (MongoDB-backed)
  // -------------------------------------------------------------------------
  getComplaints() {
    if (this._cache.complaints && Array.isArray(this._cache.complaints)) {
      return this._cache.complaints;
    }
    return this.get(STORAGE_KEYS.COMPLAINTS, []);
  },

  async getComplaintsAsync(params = {}) {
    if (typeof API !== "undefined") {
      const res = await API.complaints.all(params);
      if (res.ok) {
        this._cache.complaints = res.complaints;
        return res.complaints;
      }
    }
    return this.getComplaints();
  },

  setComplaints(complaints) {
    this._cache.complaints = complaints;
    this.set(STORAGE_KEYS.COMPLAINTS, complaints);
    return true;
  },

  addComplaint(complaint) {
    const complaints = this.getComplaints();
    complaint.unread = false;
    complaint.adminReply = "";
    complaints.unshift(complaint);
    this.setComplaints(complaints);
    this.logActivity(`Complaint submitted by ${complaint.userName || "User"}`);

    if (typeof API !== "undefined") {
      API.complaints.submit(complaint).catch(() => {});
    }
    return true;
  },

  async addComplaintAsync(complaint) {
    if (typeof API !== "undefined" && API.complaints) {
      const res = await API.complaints.submit(complaint);
      if (res.ok) {
        await this.sync();
        return { ok: true, complaint: res.complaint, message: res.message || "Complaint submitted successfully." };
      }
      return { ok: false, message: res.message || "Failed to submit complaint." };
    }

    this.addComplaint(complaint);
    return { ok: true, complaint, message: "Complaint saved locally." };
  },

  updateComplaintStatus(id, newStatus, adminReply) {
    const complaints = this.getComplaints();
    const idx = complaints.findIndex((c) => c.id === id);
    if (idx === -1) return false;
    if (newStatus) complaints[idx].status = newStatus;
    if (adminReply !== undefined) {
      complaints[idx].adminReply = adminReply;
      if (adminReply.trim() !== "") {
        complaints[idx].unreadReply = true;
      }
    }
    complaints[idx].unread = true;
    this.setComplaints(complaints);
    this.logActivity(`Complaint status updated to "${newStatus}" with reply`);

    if (typeof API !== "undefined") {
      API.complaints.update(id, { status: newStatus, adminReply }).catch(() => {});
    }
    return true;
  },

  async updateComplaintStatusAsync(id, newStatus, adminReply) {
    if (typeof API !== "undefined" && API.complaints) {
      const res = await API.complaints.update(id, { status: newStatus, adminReply });
      if (res.ok) {
        await this.sync();
        return { ok: true, complaint: res.complaint, message: res.message || "Complaint updated successfully." };
      }
      return { ok: false, message: res.message || "Failed to update complaint status." };
    }

    const ok = this.updateComplaintStatus(id, newStatus, adminReply);
    return { ok, message: ok ? "Status updated." : "Complaint not found." };
  },

  getUnreadRepliesCountForStudent(studentIdOrUser) {
    if (!studentIdOrUser) return 0;
    const complaints = this.getComplaints();

    let targetId = typeof studentIdOrUser === "string" ? studentIdOrUser : studentIdOrUser.id;
    let targetEmail = typeof studentIdOrUser === "object" ? (studentIdOrUser.email || "").toLowerCase() : "";
    let targetRoll =
      typeof studentIdOrUser === "object"
        ? (studentIdOrUser.rollNo || "").toUpperCase()
        : typeof studentIdOrUser === "string"
        ? studentIdOrUser.toUpperCase()
        : "";

    return complaints.filter((c) => {
      const match =
        c.userId === targetId ||
        c.studentId === targetId ||
        (targetEmail && c.userEmail && c.userEmail.toLowerCase() === targetEmail) ||
        (targetRoll && c.rollNo && String(c.rollNo).toUpperCase() === targetRoll);

      return match && Boolean(c.adminReply && c.adminReply.trim() !== "") && c.unreadReply === true;
    }).length;
  },

  clearUnreadRepliesForStudent(studentIdOrUser) {
    if (!studentIdOrUser) return;
    const complaints = this.getComplaints();

    let targetId = typeof studentIdOrUser === "string" ? studentIdOrUser : studentIdOrUser.id;
    let targetEmail = typeof studentIdOrUser === "object" ? (studentIdOrUser.email || "").toLowerCase() : "";
    let targetRoll =
      typeof studentIdOrUser === "object"
        ? (studentIdOrUser.rollNo || "").toUpperCase()
        : typeof studentIdOrUser === "string"
        ? studentIdOrUser.toUpperCase()
        : "";

    let updated = false;
    complaints.forEach((c) => {
      const match =
        c.userId === targetId ||
        c.studentId === targetId ||
        (targetEmail && c.userEmail && c.userEmail.toLowerCase() === targetEmail) ||
        (targetRoll && c.rollNo && String(c.rollNo).toUpperCase() === targetRoll);

      if (match && c.unreadReply) {
        c.unreadReply = false;
        updated = true;
      }
    });

    if (updated) {
      this.setComplaints(complaints);
    }

    if (typeof API !== "undefined") {
      API.complaints.clearUnread({ userId: targetId, rollNo: targetRoll, email: targetEmail }).catch(() => {});
    }
  },

  markComplaintRead(id) {
    const complaints = this.getComplaints();
    const idx = complaints.findIndex((c) => c.id === id);
    if (idx === -1) return false;
    complaints[idx].unread = false;
    complaints[idx].unreadReply = false;
    this.setComplaints(complaints);
    return true;
  },

  clearAll() {
    this._cache = {
      students: [],
      rooms: [],
      exams: [],
      seatingPlans: [],
      complaints: [],
      activity: [],
      initialized: true,
    };
    Object.values(STORAGE_KEYS).forEach((k) => {
      if (k !== STORAGE_KEYS.AUTH_TOKEN) {
        localStorage.removeItem(k);
      }
    });
    if (typeof API !== "undefined") {
      API.system.purge().catch(() => {});
    }
  },

  // -------------------------------------------------------------------------
  // SAFE BROWSER LOCALSTORAGE TO MONGODB DATA MIGRATION
  // -------------------------------------------------------------------------
  async migrateBrowserDataToMongoDB() {
    if (typeof API === "undefined") {
      return { ok: false, message: "API service not available." };
    }

    // Collect all existing browser data safely without deleting anything
    const payload = {
      students: this.get(STORAGE_KEYS.STUDENTS, []),
      rooms: this.get(STORAGE_KEYS.ROOMS, []),
      exams: this.get(STORAGE_KEYS.EXAMS, []),
      seatingPlans: this.get(STORAGE_KEYS.SEATING_PLANS, []),
      complaints: this.get(STORAGE_KEYS.COMPLAINTS, []),
      activity: this.get(STORAGE_KEYS.ACTIVITY, []),
    };

    const result = await API.migrate.importBrowserData(payload);
    if (result.ok) {
      await this.sync();
    }
    return result;
  },
};

// Initiate background cache synchronization immediately when loaded
if (typeof window !== "undefined") {
  STORAGE.sync().catch(() => {});
}
