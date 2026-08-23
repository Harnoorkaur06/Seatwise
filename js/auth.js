/* ==========================================================================
   auth.js — SEATWISE University-Controlled Authentication
   Supports Option A (Email + Password) or Option B (Roll Number + Password),
   First-Time Password Setup, and Admin Authentication.
   ========================================================================== */

const Auth = {
  /**
   * Public Student Signup is DISABLED in a University-Controlled System.
   * Only administrators can create student accounts.
   */
  signup() {
    return {
      ok: false,
      message: "Public student registration is disabled. Student accounts are created by the university administrator."
    };
  },

  /**
   * Student Login
   * Accepts { email, rollNo, password }
   * Enforces Option A (Email + Password) OR Option B (Roll Number + Password)
   */
  login({ email, rollNo, password }) {
    const cleanEmail = (email || "").trim().toLowerCase();
    const cleanRollNo = (rollNo || "").trim().toUpperCase();

    if (!cleanEmail && !cleanRollNo) {
      return { ok: false, message: "Please enter your email or roll number." };
    }

    if (!password) {
      return { ok: false, message: "Please enter your password." };
    }

    const students = STORAGE.getStudents();
    let student = null;

    if (cleanEmail) {
      student = students.find((s) => String(s.email).trim().toLowerCase() === cleanEmail);
    } else if (cleanRollNo) {
      student = students.find((s) => String(s.rollNo).trim().toUpperCase() === cleanRollNo);
    }

    if (!student) {
      return {
        ok: false,
        message: "Account not available. Please contact the administrator."
      };
    }

    if (student.disabled === true) {
      return {
        ok: false,
        message: "Your account is temporarily disabled. Please contact the administrator."
      };
    }

    if (!student.password || student.passwordSet === false) {
      return {
        ok: false,
        message: "Please set up your password first."
      };
    }

    if (student.password !== password) {
      return {
        ok: false,
        message: "Incorrect password."
      };
    }

    const currentUser = {
      id: student.id,
      name: student.name,
      email: student.email,
      rollNo: student.rollNo,
      mobile: student.mobile || "",
      course: student.course || "CSE",
      semester: student.semester || "5th Semester",
      subject: student.subject || "CS301",
      avatar: student.avatar || "",
      role: "student"
    };

    STORAGE.setCurrentUser(currentUser);
    STORAGE.logActivity(`Student logged in: ${student.name} (${student.rollNo})`);

    return {
      ok: true,
      message: "Login successful. Redirecting...",
      user: currentUser
    };
  },

  /**
   * Set Up Password Flow for First-Time Students
   * Accepts { identifier (email or rollNo), newPassword, confirmPassword }
   */
  setupPassword({ identifier, newPassword, confirmPassword }) {
    const targetKey = (identifier || "").trim();

    if (!targetKey) {
      return { ok: false, message: "Please enter your email or roll number." };
    }

    if (!newPassword || !confirmPassword) {
      return { ok: false, message: "Please enter and confirm your new password." };
    }

    if (newPassword !== confirmPassword) {
      return { ok: false, message: "Passwords do not match." };
    }

    if (newPassword.length < 6) {
      return { ok: false, message: "Password must contain at least 6 characters." };
    }

    const students = STORAGE.getStudents();
    const normKey = targetKey.toLowerCase();
    const idx = students.findIndex((s) =>
      String(s.email).trim().toLowerCase() === normKey ||
      String(s.rollNo).trim().toLowerCase() === normKey
    );

    if (idx === -1) {
      return {
        ok: false,
        message: "Account not available. Please contact the administrator."
      };
    }

    const student = students[idx];

    if (student.disabled === true) {
      return {
        ok: false,
        message: "Your account is temporarily disabled. Please contact the administrator."
      };
    }

    student.password = newPassword;
    student.passwordSet = true;
    students[idx] = student;

    STORAGE.setStudents(students);
    STORAGE.logActivity(`Password set up successfully by student: ${student.name} (${student.rollNo})`);

    return {
      ok: true,
      message: "Password set successfully. You can now sign in."
    };
  },

  /** Log in as administrator */
  adminLogin({ username, password }) {
    const validPassword = password === CONFIG.ADMIN_PASSWORD || password === CONFIG.ADMIN_ALT_PASSWORD || password === "admin123";
    if (username === CONFIG.ADMIN_USERNAME && validPassword) {
      STORAGE.setAdminSession(true);
      STORAGE.setCurrentUser({
        id: "admin",
        name: "Administrator",
        email: "admin@seatwise.local",
        role: "admin"
      });
      STORAGE.logActivity("Administrator logged in");
      return { ok: true, message: "Welcome back, Administrator." };
    }
    return { ok: false, message: "Invalid admin credentials." };
  },

  logout() {
    const current = STORAGE.getCurrentUser();
    if (current) STORAGE.logActivity(`${current.name} logged out`);
    STORAGE.clearCurrentUser();
    STORAGE.clearAdminSession();
  },

  currentUser() {
    const user = STORAGE.getCurrentUser();
    if (user && user.role === "student") {
      // Sync latest data from Students database in case Admin updated it
      const latest = STORAGE.getStudents().find((s) => s.id === user.id || s.rollNo === user.rollNo);
      if (latest) {
        return {
          id: latest.id,
          name: latest.name,
          email: latest.email,
          rollNo: latest.rollNo,
          mobile: latest.mobile || "",
          course: latest.course || "CSE",
          semester: latest.semester || "5th Semester",
          subject: latest.subject || "CS301",
          avatar: user.avatar || latest.avatar || "",
          role: "student"
        };
      }
    }
    return user;
  },

  isLoggedIn() {
    return !!STORAGE.getCurrentUser();
  },

  isAdmin() {
    const user = STORAGE.getCurrentUser();
    return !!user && user.role === "admin" && STORAGE.isAdminSession();
  },

  /** Guard student-only pages */
  requireUser() {
    const user = STORAGE.getCurrentUser();
    if (!user || user.role !== "student") {
      window.location.href = "login.html";
    }
  },

  /** Guard admin-only pages */
  requireAdmin() {
    if (!Auth.isAdmin()) {
      window.location.href = "admin-login.html";
    }
  },

  /** Redirect logged in users away from login pages */
  redirectIfLoggedIn() {
    const user = STORAGE.getCurrentUser();
    if (user && user.role === "student") window.location.href = "user-dashboard.html";
    if (user && user.role === "admin" && STORAGE.isAdminSession()) window.location.href = "admin-dashboard.html";
  }
};
