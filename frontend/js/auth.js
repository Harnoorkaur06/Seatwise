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

    // Attempt backend API login
    if (typeof API !== "undefined" && API.auth) {
      const res = await API.auth.login({
        email: rawEmail,
        rollNo: rawRollNo,
        password,
      });

      if (res.ok && res.otpRequired) {
        return {
          ok: true,
          otpRequired: true,
          challengeId: res.challengeId,
          maskedEmail: res.maskedEmail,
          message: res.message || "A verification code has been sent to your email.",
        };
      } else if (res.ok && res.user) {
        if (res.token) API.setToken(res.token);
        STORAGE.setCurrentUser(res.user);
        STORAGE.clearAdminSession();
        STORAGE.logActivity(`Student logged in: ${res.user.name} (${res.user.rollNo})`);
        return {
          ok: true,
          message: res.message || "Login successful. Redirecting...",
          user: res.user,
        };
      }
      return { ok: false, message: res.message || "Invalid credentials." };
    }

    return {
      ok: false,
      message: "Unable to connect to the authentication server. Mandatory email OTP verification requires backend connectivity.",
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
    const cleanUsername = (username || "").toString().trim();
    if (!cleanUsername || !password) {
      return { ok: false, message: "Please enter both username and password." };
    }

    if (typeof API !== "undefined" && API.auth) {
      const res = await API.auth.adminLogin({ username: cleanUsername, password });
      if (res.ok && res.user) {
        if (res.token) API.setToken(res.token);
        STORAGE.setAdminSession(true);
        STORAGE.setCurrentUser(res.user);
        STORAGE.logActivity("Administrator logged in");
        return { ok: true, message: res.message || "Welcome back, Administrator." };
      }
      return { ok: false, message: res.message || "Invalid admin credentials." };
    }

    return {
      ok: false,
      message: "Unable to connect to authentication server. Please check your network or server status.",
    };
  },

  /**
   * Verify 4-digit OTP for student or admin
   */
  async verifyOtp({ challengeId, otp, role }) {
    if (!challengeId) {
      return { ok: false, message: "Invalid verification session. Please log in again." };
    }
    const cleanOtp = String(otp || "").trim();
    if (!cleanOtp || cleanOtp.length !== 4) {
      return { ok: false, message: "Please enter the 4-digit verification code." };
    }

    if (typeof API !== "undefined" && API.auth) {
      const res = await API.auth.verifyOtp({ challengeId, otp: cleanOtp, role });
      if (res.ok && res.token && res.user) {
        API.setToken(res.token);
        if (role === "admin") {
          STORAGE.setAdminSession(true);
        } else {
          STORAGE.clearAdminSession();
        }
        STORAGE.setCurrentUser(res.user);
        if (role === "admin") {
          STORAGE.logActivity("Administrator logged in");
        } else {
          STORAGE.logActivity(`Student logged in: ${res.user.name} (${res.user.rollNo})`);
        }
        return {
          ok: true,
          message: res.message || "Verification successful. Redirecting...",
          user: res.user,
        };
      }
      return { ok: false, message: res.message || "Verification failed." };
    }

    return { ok: false, message: "Authentication server unavailable." };
  },

  /**
   * Resend OTP code for active challenge
   */
  async resendOtp({ challengeId, role }) {
    if (!challengeId) {
      return { ok: false, message: "Invalid verification session. Please log in again." };
    }
    if (typeof API !== "undefined" && API.auth) {
      const res = await API.auth.resendOtp({ challengeId, role });
      if (res.ok) {
        return {
          ok: true,
          maskedEmail: res.maskedEmail,
          message: res.message || "A new verification code has been sent.",
        };
      }
      return { ok: false, message: res.message || "Failed to resend code." };
    }
    return { ok: false, message: "Authentication server unavailable." };
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
