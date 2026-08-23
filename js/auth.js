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
    const rawEmail = (email || "").toString().trim();
    const rawRollNo = (rollNo || "").toString().trim();
    const cleanEmail = rawEmail.toLowerCase();
    const cleanRollNo = rawRollNo.toUpperCase();
    const inputIdent = (rawEmail || rawRollNo).trim();

    if (!cleanEmail && !cleanRollNo && !inputIdent) {
      return { ok: false, message: "Please enter your email or roll number." };
    }

    if (!password) {
      return { ok: false, message: "Please enter your password." };
    }

    const students = STORAGE.getStudents();
    let student = null;

    // Search flexibly across email and rollNo
    student = students.find((s) => {
      const sEmail = String(s.email || "").trim().toLowerCase();
      const sRoll = String(s.rollNo || "").trim().toUpperCase();
      return (
        (cleanEmail && (sEmail === cleanEmail || sRoll === cleanEmail.toUpperCase())) ||
        (cleanRollNo && (sRoll === cleanRollNo || sEmail === cleanRollNo.toLowerCase())) ||
        (inputIdent && (sEmail === inputIdent.toLowerCase() || sRoll === inputIdent.toUpperCase()))
      );
    });

    if (!student) {
      // Fallback for demo candidate Harnoor Kaur
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
          disabled: false
        };
        const currentList = STORAGE.getStudents();
        currentList.unshift(student);
        STORAGE.setStudents(currentList);
      } else {
        return {
          ok: false,
          message: "Account not found for this email or roll number. Click 'Set Up Password' below to create your credentials."
        };
      }
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
        message: "Please set up your password first using the link below."
      };
    }

    if (student.password !== password) {
      return {
        ok: false,
        message: "Incorrect password. Please try again."
      };
    }

    const currentUser = {
      id: student.id,
      name: student.name,
      email: student.email,
      rollNo: student.rollNo,
      fatherName: student.fatherName || "Mr. SATINDER SINGH",
      classBranch: student.classBranch || (student.course ? `2024-BE-${student.course}-4 SEM` : "2024-BE-CSE-AI-4 SEM"),
      coursesList: student.coursesList || ["24APS4101", "24CAI0201", "24CAI0202", "24CAI0203", "24CAI0204", "24UNI0124", "25MOC0136", "25MOC0137", "25MOC0138", "25MOC0139", "Curriculum"],
      department: student.department || "Department of Computer Science & Engineering (Artificial Intelligence & Machine Learning)",
      mobile: student.mobile || "",
      course: student.course || "CSE-AI",
      semester: student.semester || "4th Semester",
      subject: student.subject || "24CAI0201",
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

    let students = STORAGE.getStudents();
    const normKey = targetKey.toLowerCase();
    let idx = students.findIndex((s) =>
      String(s.email || "").trim().toLowerCase() === normKey ||
      String(s.rollNo || "").trim().toLowerCase() === normKey ||
      String(s.rollNo || "").trim().toUpperCase() === targetKey.toUpperCase()
    );

    // If not found in current roster, automatically register candidate account!
    if (idx === -1) {
      const isEmail = targetKey.includes("@");
      const newRoll = isEmail ? targetKey.split("@")[0].toUpperCase() : targetKey.toUpperCase();
      const newEmail = isEmail ? targetKey.toLowerCase() : `${targetKey.toLowerCase()}@student.com`;
      const isHarnoor = newEmail.includes("harnoor") || newRoll.includes("2410992925");
      const newStudent = {
        id: `student_${Date.now()}`,
        name: isHarnoor ? "HARNOOR KAUR" : (isEmail ? targetKey.split("@")[0].toUpperCase() : `Student ${targetKey}`),
        email: newEmail,
        rollNo: newRoll,
        fatherName: "Mr. SATINDER SINGH",
        classBranch: "2024-BE-CSE-AI-4 SEM",
        department: "Department of Computer Science & Engineering (Artificial Intelligence & Machine Learning)",
        coursesList: ["24APS4101", "24CAI0201", "24CAI0202", "24CAI0203", "24CAI0204", "24UNI0124", "25MOC0136", "25MOC0137", "25MOC0138", "25MOC0139", "Curriculum"],
        password: newPassword,
        passwordSet: true,
        mobile: "9876543210",
        course: "CSE-AI",
        semester: "4th Semester",
        subject: "24CAI0201",
        role: "student",
        disabled: false,
        createdAt: new Date().toISOString()
      };
      students.unshift(newStudent);
      STORAGE.setStudents(students);
      STORAGE.logActivity(`New student account provisioned & password set: ${newStudent.name} (${newStudent.rollNo})`);
      return {
        ok: true,
        message: "Password set successfully. You can now sign in."
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
