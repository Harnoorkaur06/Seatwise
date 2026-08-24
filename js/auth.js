/* ==========================================================================
   auth.js — Centralized SEATWISE Authentication & Access Control (Phase 2)
   Single source of truth for:
   - Admin Authentication & Password Management
   - Student Authentication (Email OR Roll Number)
   - First-time Password Setup (Existing Admin-created students only)
   - Student Password Update
   - Role-based Route Protection & Session Management
   ========================================================================== */

const Auth = {
  /**
   * Public Student Signup is strictly DISABLED in a University-Controlled System.
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
   * Enforces: Email OR Roll Number + Password
   */
  loginStudent(credentials) {
    let rawIdentifier = "";
    let rawEmail = "";
    let rawRollNo = "";
    let password = "";

    if (typeof credentials === "object" && credentials !== null) {
      rawIdentifier = (credentials.identifier || credentials.username || "").toString().trim();
      rawEmail = (credentials.email || "").toString().trim();
      rawRollNo = (credentials.rollNo || "").toString().trim();
      password = (credentials.password || "").toString();
    }

    const students = STORAGE.getStudents();
    let student = null;

    if (rawEmail && rawRollNo) {
      const cleanEmail = rawEmail.toLowerCase();
      const cleanRollNo = rawRollNo.toUpperCase();
      const studentByEmail = students.find((s) => String(s.email || "").trim().toLowerCase() === cleanEmail);
      const studentByRoll = students.find((s) => String(s.rollNo || "").trim().toUpperCase() === cleanRollNo);

      if (!studentByEmail && !studentByRoll) {
        return { ok: false, message: "Account not available. Please contact the administrator." };
      }
      if (!studentByEmail || !studentByRoll || studentByEmail.id !== studentByRoll.id) {
        return { ok: false, message: "Email and roll number do not match." };
      }
      student = studentByEmail;
    } else {
      const targetStr = rawIdentifier || rawEmail || rawRollNo;
      if (!targetStr) {
        return { ok: false, message: "Please enter your email or roll number." };
      }

      const cleanInput = targetStr.toLowerCase();
      const upperInput = targetStr.toUpperCase();
      const isEmail = targetStr.includes("@");

      if (isEmail) {
        student = students.find((s) => String(s.email || "").trim().toLowerCase() === cleanInput);
      } else {
        student = students.find((s) =>
          String(s.rollNo || "").trim().toUpperCase() === upperInput ||
          String(s.rollNo || "").trim().toLowerCase() === cleanInput
        );
      }

      if (!student) {
        student = students.find((s) =>
          String(s.email || "").trim().toLowerCase() === cleanInput ||
          String(s.rollNo || "").trim().toUpperCase() === upperInput ||
          String(s.rollNo || "").trim().toLowerCase() === cleanInput
        );
      }
    }

    if (!student) {
      return {
        ok: false,
        message: "Account not available. Please contact the administrator."
      };
    }

    const isDisabled = student.status === "disabled" || student.disabled === true;
    if (isDisabled) {
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

    if (!password) {
      return { ok: false, message: "Please enter your password." };
    }

    if (student.password !== password) {
      return {
        ok: false,
        message: "Incorrect password."
      };
    }

    // Create session
    const session = {
      userId: student.id,
      role: "student"
    };

    STORAGE.setCurrentUser(session);
    STORAGE.clearAdminSession();
    STORAGE.logActivity(`Student logged in: ${student.name} (${student.rollNo})`);

    return {
      ok: true,
      message: "Login successful. Redirecting...",
      user: session
    };
  },

  /** Alias for loginStudent to support existing callers */
  login(credentials) {
    return this.loginStudent(credentials);
  },

  /**
   * Set Up Password Flow for First-Time Students
   * Accepts { identifier (email or rollNo), newPassword, confirmPassword }
   * MUST NOT create new students. Only updates existing Admin-created accounts.
   */
  setupPassword({ identifier, newPassword, confirmPassword }) {
    const targetKey = (identifier || "").toString().trim();

    if (!targetKey) {
      return { ok: false, message: "Please enter your email or roll number." };
    }

    const students = STORAGE.getStudents();
    const normKey = targetKey.toLowerCase();
    const upperKey = targetKey.toUpperCase();

    const idx = students.findIndex((s) =>
      String(s.email || "").trim().toLowerCase() === normKey ||
      String(s.rollNo || "").trim().toUpperCase() === upperKey ||
      String(s.rollNo || "").trim().toLowerCase() === normKey
    );

    if (idx === -1) {
      return {
        ok: false,
        message: "Account not available. Please contact the administrator."
      };
    }

    const student = students[idx];

    const isDisabled = student.status === "disabled" || student.disabled === true;
    if (isDisabled) {
      return {
        ok: false,
        message: "Your account is temporarily disabled. Please contact the administrator."
      };
    }

    if (!newPassword || !confirmPassword) {
      return { ok: false, message: "Please enter and confirm your new password." };
    }

    if (newPassword.length < 6) {
      return { ok: false, message: "Password must contain at least 6 characters." };
    }

    if (newPassword !== confirmPassword) {
      return { ok: false, message: "Passwords do not match." };
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

  /**
   * Student Password Update (from Profile)
   */
  updateStudentPassword({ currentPassword, newPassword, confirmPassword }) {
    const user = this.getCurrentUser();
    if (!user || user.role !== "student") {
      return { ok: false, message: "Unauthorized." };
    }

    const students = STORAGE.getStudents();
    const idx = students.findIndex((s) => s.id === user.id || s.id === user.userId || s.rollNo === user.rollNo);

    if (idx === -1) {
      return { ok: false, message: "Student record not found." };
    }

    const student = students[idx];

    if (student.password !== currentPassword) {
      return { ok: false, message: "Current password is incorrect." };
    }

    if (!newPassword || newPassword.length < 6) {
      return { ok: false, message: "New password must be at least 6 characters." };
    }

    if (newPassword !== confirmPassword) {
      return { ok: false, message: "New passwords do not match." };
    }

    student.password = newPassword;
    student.passwordSet = true;
    students[idx] = student;

    STORAGE.setStudents(students);
    STORAGE.logActivity(`Password updated by student: ${student.name} (${student.rollNo})`);

    return {
      ok: true,
      message: "Password updated successfully."
    };
  },

  /** Log in as administrator */
  loginAdmin({ username, password }) {
    const creds = STORAGE.getAdminCredentials();
    const inputUser = (username || "").toString().trim();
    const inputPass = (password || "").toString();

    if (!inputUser || !inputPass) {
      return { ok: false, message: "Please enter your username and password." };
    }

    if (inputUser !== creds.username || inputPass !== creds.password) {
      return { ok: false, message: "Invalid admin credentials." };
    }

    const session = {
      userId: "ADMIN",
      role: "admin"
    };

    STORAGE.setCurrentUser(session);
    STORAGE.setAdminSession(true);
    STORAGE.logActivity("Administrator logged in");

    return {
      ok: true,
      message: "Welcome back, Administrator.",
      user: session
    };
  },

  /** Alias for loginAdmin to support existing callers */
  adminLogin(credentials) {
    return this.loginAdmin(credentials);
  },

  /** Get authoritative admin credentials */
  getAdminCredentials() {
    return STORAGE.getAdminCredentials();
  },

  /** Update admin password with verification */
  updateAdminPassword(arg1, arg2, arg3) {
    let currentPassword, newPassword, confirmPassword;
    if (typeof arg1 === "object" && arg1 !== null) {
      currentPassword = arg1.currentPassword || arg1.current;
      newPassword = arg1.newPassword || arg1.new;
      confirmPassword = arg1.confirmPassword || arg1.confirm;
    } else {
      currentPassword = arg1;
      newPassword = arg2;
      confirmPassword = arg3;
    }

    currentPassword = (currentPassword || "").toString();
    newPassword = (newPassword || "").toString();
    confirmPassword = (confirmPassword || "").toString();

    if (!currentPassword || !newPassword || !confirmPassword) {
      return { ok: false, message: "Please fill all password fields." };
    }

    const creds = STORAGE.getAdminCredentials();
    if (currentPassword !== creds.password) {
      return { ok: false, message: "Current password is incorrect." };
    }

    if (newPassword.length < 6) {
      return { ok: false, message: "New password must be at least 6 characters." };
    }

    if (newPassword !== confirmPassword) {
      return { ok: false, message: "Passwords do not match." };
    }

    STORAGE.setAdminPassword(newPassword);
    STORAGE.logActivity("Administrator password updated");

    return {
      ok: true,
      message: "Password updated successfully."
    };
  },

  /** Log out current session */
  logout() {
    const current = this.getCurrentUser();
    if (current) {
      STORAGE.logActivity(`${current.name || "User"} logged out`);
    }
    STORAGE.clearCurrentUser();
    STORAGE.clearAdminSession();
  },

  /** Resolves the fresh user object from authoritative storage using active session */
  getCurrentUser() {
    const session = STORAGE.getCurrentUser();
    if (!session) return null;

    if (session.role === "admin" && STORAGE.isAdminSession()) {
      return {
        id: "admin",
        userId: "ADMIN",
        name: "Administrator",
        email: "admin@seatwise.local",
        role: "admin"
      };
    }

    if (session.role === "student" || (!session.role && (session.userId || session.id || session.rollNo))) {
      const targetId = session.userId || session.id;
      const targetRoll = session.rollNo;
      const targetEmail = session.email;

      const students = STORAGE.getStudents();
      const student = students.find((s) =>
        (targetId && s.id === targetId) ||
        (targetRoll && String(s.rollNo).toUpperCase() === String(targetRoll).toUpperCase()) ||
        (targetEmail && String(s.email).toLowerCase() === String(targetEmail).toLowerCase())
      );

      if (!student) {
        return null;
      }

      const isDisabled = student.status === "disabled" || student.disabled === true;
      if (isDisabled) {
        return null;
      }

      return {
        ...student,
        userId: student.id,
        role: "student"
      };
    }

    return null;
  },

  /** Alias for getCurrentUser */
  currentUser() {
    return this.getCurrentUser();
  },

  isAuthenticated() {
    return Boolean(this.getCurrentUser());
  },

  isLoggedIn() {
    return this.isAuthenticated();
  },

  isAdmin() {
    const session = STORAGE.getCurrentUser();
    return Boolean(session && session.role === "admin" && STORAGE.isAdminSession());
  },

  isStudent() {
    const user = this.getCurrentUser();
    return Boolean(user && user.role === "student");
  },

  /** Guard student-only pages */
  requireUser() {
    if (!this.isStudent()) {
      window.location.href = "login.html";
    }
  },

  requireStudent() {
    this.requireUser();
  },

  /** Guard admin-only pages */
  requireAdmin() {
    if (!this.isAdmin()) {
      window.location.href = "admin-login.html";
    }
  },

  /** Redirect logged-in users away from login pages */
  redirectIfLoggedIn() {
    if (this.isStudent()) {
      window.location.href = "user-dashboard.html";
    } else if (this.isAdmin()) {
      window.location.href = "admin-dashboard.html";
    }
  }
};
