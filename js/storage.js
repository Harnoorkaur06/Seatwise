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
  ACTIVITY: "examseat_activity",
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

  getStudents() { return this.get(STORAGE_KEYS.STUDENTS, []); },
  setStudents(students) { return this.set(STORAGE_KEYS.STUDENTS, students); },

  getRooms() { return this.get(STORAGE_KEYS.ROOMS, []); },
  setRooms(rooms) { return this.set(STORAGE_KEYS.ROOMS, rooms); },

  getSeatingPlan() { return this.get(STORAGE_KEYS.SEATING_PLAN, null); },
  setSeatingPlan(plan) { return this.set(STORAGE_KEYS.SEATING_PLAN, plan); },
  clearSeatingPlan() { this.remove(STORAGE_KEYS.SEATING_PLAN); },

  getActivity() { return this.get(STORAGE_KEYS.ACTIVITY, []); },
  logActivity(message) {
    const activity = this.getActivity();
    activity.unshift({ message, time: new Date().toISOString() });
    // keep only the most recent 30 entries
    this.set(STORAGE_KEYS.ACTIVITY, activity.slice(0, 30));
  }
};
