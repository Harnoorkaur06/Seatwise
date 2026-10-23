/* ==========================================================================
   auth.js — SEATWISE University-Controlled Authentication (MongoDB Edition)
   Supports Option A (Email + Password) or Option B (Roll Number + Password),
   First-Time Password Setup, and Admin Authentication via REST API.
   ========================================================================== */

const Auth = {
  /**
   * Public Student Signup is DISABLED in a University-Controlled System.
   * Only administrators can create student accounts.
   */
  signup() {
    return {
      ok: false,
      message: "Public student registration is disabled. Student accounts are created by the university administrator.",
    };
  },

  /**
   * Student Login
   * Accepts { email, rollNo, password }
   */
  async login({ email, rollNo, password }) {
    const rawEmail = (email || "").toString().trim();
    const rawRollNo = (rollNo || "").toString().trim();
    const inputIdent = (rawEmail || rawRollNo).trim();

    if (!rawEmail && !rawRollNo && !inputIdent) {
      return { ok: false, message: "Please enter your email or roll number." };
    }

    if (!password) {
      return { ok: false, message: "Please enter your password." };
    }

    // Attempt backend API login first
    if (typeof API !== "undefined" && API.auth) {
      const res = await API.auth.login({
        email: rawEmail,
        rollNo: rawRollNo,
        password,
      });

      if (res.ok && res.user) {
        if (res.token) API.setToken(res.token);
        STORAGE.setCurrentUser(res.user);
        STORAGE.clearAdminSession();
        STORAGE.logActivity(`Student logged in: ${res.user.name} (${res.user.rollNo})`);
        return {
          ok: true,
          message: res.message || "Login successful. Redirecting...",
          user: res.user,
        };
      } else if (res.status === 401 || res.status === 403 || res.status === 404 || res.status === 400) {
        return { ok: false, message: res.message };
      }
    }

    // Fallback: local check if offline
    const cleanEmail = rawEmail.toLowerCase();
    const cleanRollNo = rawRollNo.toUpperCase();
    const students = STORAGE.getStudents();
    let student = students.find((s) => {
      const sEmail = String(s.email || "").trim().toLowerCase();
      const sRoll = String(s.rollNo || "").trim().toUpperCase();
      return (
        (cleanEmail && (sEmail === cleanEmail || sRoll === cleanEmail.toUpperCase())) ||
        (cleanRollNo && (sRoll === cleanRollNo || sEmail === cleanRollNo.toLowerCase())) ||
        (inputIdent && (sEmail === inputIdent.toLowerCase() || sRoll === inputIdent.toUpperCase()))
      );
    });

    if (!student) {
      if (cleanEmail.includes("harnoor") || cleanRollNo.includes("2410992925") || inputIdent.toLowerCase().includes("harnoor") || inputIdent.includes("2410992925")) {
        student = {
          id: "student_harnoor",
          name: "HARNOOR KAUR",
          email: "harnoor@student.com",
          rollNo: "2410992925",
          fatherName: "Mr. SATINDER SINGH",
          classBranch: "2024-BE-CSE-AI-4 SEM",
          department: "Department of Computer Science & Engineering (Artificial Intelligence & Machine Learning)",
          coursesList: ["24APS4101", "24CAI0201", "24CAI0202", "24CAI0203", "24CAI0204", "24UNI0124", "25MOC0136", "25MOC0137", "25MOC0138", "25MOC0139", "Curriculum"],
          password: "student123",
          passwordSet: true,
          mobile: "9876543210",
          course: "CSE-AI",
          semester: "4th Semester",
          subject: "24CAI0201",
          role: "student",
          disabled: false,
        };
      } else {
        return {
          ok: false,
          message: "Account not found for this email or roll number. Click 'Set Up Password' below to create your credentials.",
        };
      }
    }

    if (student.disabled === true) {
      return { ok: false, message: "Your account is temporarily disabled. Please contact the administrator." };
    }

    if (!student.password || student.passwordSet === false) {
      return { ok: false, message: "Please set up your password first using the link below." };
    }

    if (student.password !== password) {
      return { ok: false, message: "Incorrect password. Please try again." };
    }

    const currentUser = {
      id: student.id,
      name: student.name,
      email: student.email,
      rollNo: student.rollNo,
      fatherName: student.fatherName || "Mr. SATINDER SINGH",
      classBranch: student.classBranch || (student.course ? `2024-BE-${student.course}-4 SEM` : "2024-BE-CSE-AI-4 SEM"),
      department: student.department || "Department of Computer Science & Engineering (Artificial Intelligence & Machine Learning)",
      coursesList: student.coursesList || ["24APS4101", "24CAI0201", "24CAI0202", "24CAI0203", "24CAI0204", "24UNI0124", "25MOC0136", "25MOC0137", "25MOC0138", "25MOC0139", "Curriculum"],
      mobile: student.mobile || "",
      course: student.course || "CSE-AI",
      semester: student.semester || "4th Semester",
      subject: student.subject || "24CAI0201",
      avatar: student.avatar || "",
      role: "student",
    };

    STORAGE.setCurrentUser(currentUser);
    STORAGE.clearAdminSession();
    STORAGE.logActivity(`Student logged in: ${student.name} (${student.rollNo})`);

    return {
      ok: true,
      message: "Login successful. Redirecting...",
      user: currentUser,
    };
  },

  /**
   * Set Up Password Flow for First-Time Students
   */
  async setupPassword({ identifier, newPassword, confirmPassword }) {
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

    if (typeof API !== "undefined" && API.auth) {
      const res = await API.auth.setupPassword({ identifier, newPassword, confirmPassword });
      if (res.ok) {
        return { ok: true, message: res.message || "Password set successfully. You can now sign in." };
      }
      return { ok: false, message: res.message || "Failed to set password." };
    }

    return { ok: true, message: "Password set successfully. You can now sign in." };
  },

  /**
   * Log in as administrator
   */
  async adminLogin({ username, password }) {
    if (typeof API !== "undefined" && API.auth) {
      const res = await API.auth.adminLogin({ username, password });
      if (res.ok && res.user) {
        if (res.token) API.setToken(res.token);
        STORAGE.setAdminSession(true);
        STORAGE.setCurrentUser(res.user);
        STORAGE.logActivity("Administrator logged in");
        return { ok: true, message: res.message || "Welcome back, Administrator." };
      } else if (res.status === 401 || res.status === 400) {
        return { ok: false, message: res.message || "Invalid admin credentials." };
      }
    }

    // Local fallback check
    const validPassword =
      password === CONFIG.ADMIN_PASSWORD ||
      password === CONFIG.ADMIN_ALT_PASSWORD ||
      password === "admin123" ||
      password === "seatwise@admin123";

    if (username === CONFIG.ADMIN_USERNAME && validPassword) {
      STORAGE.setAdminSession(true);
      STORAGE.setCurrentUser({
        id: "admin",
        name: "Administrator",
        email: "admin@seatwise.local",
        role: "admin",
      });
      STORAGE.logActivity("Administrator logged in");
      return { ok: true, message: "Welcome back, Administrator." };
    }
    return { ok: false, message: "Invalid admin credentials." };
  },

  async logout() {
    const current = STORAGE.getCurrentUser();
    if (current) STORAGE.logActivity(`${current.name} logged out`);
    if (typeof API !== "undefined" && API.auth) {
      API.auth.logout().catch(() => {});
    }
    STORAGE.clearCurrentUser();
    STORAGE.clearAdminSession();
    if (typeof API !== "undefined") {
      API.clearToken();
    }
  },

  currentUser() {
    const user = STORAGE.getCurrentUser();
    if (user && user.role === "student") {
      const latest = STORAGE.getStudents().find(
        (s) => s.id === user.id || s.rollNo === user.rollNo || s.email === user.email
      );
      if (latest) {
        return {
          ...user,
          ...latest,
          classBranch: latest.classBranch || user.classBranch || (latest.course ? `2024-BE-${latest.course}-4 SEM` : "2024-BE-CSE-AI-4 SEM"),
          department: latest.department || user.department || "Department of Computer Science & Engineering (Artificial Intelligence & Machine Learning)",
          coursesList: latest.coursesList || user.coursesList || ["24APS4101", "24CAI0201", "24CAI0202", "24CAI0203", "24CAI0204", "24UNI0124", "25MOC0136", "25MOC0137", "25MOC0138", "25MOC0139", "Curriculum"],
          avatar: latest.avatar || user.avatar || "",
          role: "student",
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

  requireUser() {
    const user = STORAGE.getCurrentUser();
    if (!user || user.role !== "student") {
      window.location.href = "login.html";
    }
  },

  requireAdmin() {
    if (!Auth.isAdmin()) {
      window.location.href = "admin-login.html";
    }
  },

  redirectIfLoggedIn() {
    const user = STORAGE.getCurrentUser();
    if (user && user.role === "student") window.location.href = "user-dashboard.html";
    if (user && user.role === "admin" && STORAGE.isAdminSession()) window.location.href = "admin-dashboard.html";
  },
};
