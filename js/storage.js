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

  _getFatherName(student, idx = 0) {
    if (student && student.fatherName && student.fatherName !== "Mr. SATINDER SINGH" && student.fatherName !== "Mr. Satinder Singh") {
      return student.fatherName;
    }
    const sName = (student?.name || "").toString().trim().toUpperCase();
    const sRoll = (student?.rollNo || "").toString().trim().toUpperCase();
    if (sName.includes("HARNOOR") || sRoll === "2410992925") {
      return "Mr. SATINDER SINGH";
    }
    if (sName.includes("RAHUL") || sRoll.includes("101")) {
      return "Mr. RAJESH SHARMA";
    }
    if (sName.includes("AMAN") || sRoll.includes("102")) {
      return "Mr. HARPREET SINGH";
    }
    if (sName.includes("PRIYA") || sRoll.includes("103")) {
      return "Mr. ANIL KUMAR";
    }
    if (sName.includes("SNEHA") || sRoll.includes("104")) {
      return "Mr. RAMESH VERMA";
    }
    if (sName.includes("VIKRAM") || sRoll.includes("105")) {
      return "Mr. SANJAY GUPTA";
    }
    
    const fatherFirst = [
      "Rajesh", "Harpreet", "Anil", "Ramesh", "Sanjay", "Manoj", "Davinder", "Vikram",
      "Naresh", "Surinder", "Praveen", "Ashok", "Kuldeep", "Jaswant", "Rakesh", "Suresh",
      "Balwinder", "Gurdeep", "Vinod", "Subhash", "Ajay", "Sunil", "Dharmendra", "Bhupinder",
      "Kamal", "Rajendra", "Ravinder", "Manmohan", "Devendra", "Jagjit", "Tarun", "Deepak", "Vijay", "Mukesh"
    ];
    const lastNames = [
      "Sharma", "Singh", "Verma", "Gupta", "Malhotra", "Kapoor", "Joshi",
      "Bhatia", "Chopra", "Mehta", "Bansal", "Arora", "Soni", "Aggarwal",
      "Kumar", "Chawla", "Gill", "Sandhu", "Dhillon", "Rawat", "Saxena"
    ];
    const hash = (sRoll + sName + idx).split("").reduce((acc, c) => acc + c.charCodeAt(0), 0);
    const f = fatherFirst[hash % fatherFirst.length];
    const l = lastNames[(hash * 5 + 7) % lastNames.length];
    return `Mr. ${f.toUpperCase()} ${l.toUpperCase()}`;
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
    let list = this.get(STORAGE_KEYS.STUDENTS, null);
    if (!list || !Array.isArray(list) || list.length === 0) {
      list = [
        {
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
        },
        {
          id: "student_101",
          name: "Rahul",
          email: "rahul@student.com",
          rollNo: "2410992101",
          fatherName: "Mr. RAJESH SHARMA",
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
        },
        {
          id: "student_102",
          name: "Aman",
          email: "aman@student.com",
          rollNo: "2410992102",
          fatherName: "Mr. HARPREET SINGH",
          classBranch: "2024-BE-CSE-4 SEM",
          department: "Department of Computer Science & Engineering",
          coursesList: ["24APS4101", "24CAI0201", "24CAI0202", "24CAI0203", "Curriculum"],
          password: "student123",
          passwordSet: true,
          mobile: "9876543210",
          course: "CSE",
          semester: "4th Semester",
          subject: "CS301",
          role: "student",
          disabled: false
        }
      ];
      this.set(STORAGE_KEYS.STUDENTS, list);
    }

    // Ensure Harnoor is always present in existing lists
    if (!list.some((s) => String(s.rollNo || "").toUpperCase() === "2410992925" || String(s.email || "").toLowerCase() === "harnoor@student.com")) {
      list.unshift({
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
      });
      this.set(STORAGE_KEYS.STUDENTS, list);
    }

    return list.map((s, idx) => {
      const studentName = (s.name || "Student").toString().trim();
      const studentRoll = this._getUniversityId(s, idx + 1);
      const studentFather = this._getFatherName(s, idx + 1);

      return {
        ...s,
        id: s.id || `student_${studentRoll || idx}`,
        rollNo: studentRoll,
        email: (s.email || `${studentRoll}@student.com`).toString().trim(),
        name: studentName,
        fatherName: studentFather,
        classBranch: s.classBranch || (s.course ? `2024-BE-${s.course}-4 SEM` : "2024-BE-CSE-AI-4 SEM"),
        coursesList: s.coursesList && Array.isArray(s.coursesList) && s.coursesList.length > 0
          ? s.coursesList
          : ["24APS4101", "24CAI0201", "24CAI0202", "24CAI0203", "24CAI0204", "24UNI0124", "25MOC0136", "25MOC0137", "25MOC0138", "25MOC0139", "Curriculum"],
        department: s.department || "Department of Computer Science & Engineering (Artificial Intelligence & Machine Learning)",
        password: s.password || "student123",
        role: "student",
        disabled: s.disabled === true
      };
    });
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
    if (adminReply !== undefined) {
      complaints[idx].adminReply = adminReply;
      if (adminReply.trim() !== "") {
        complaints[idx].unreadReply = true;
      }
    }
    complaints[idx].unread = true;
    this.setComplaints(complaints);
    this.logActivity(`Complaint status updated to "${newStatus}" with reply`);
    return true;
  },

  getUnreadRepliesCountForStudent(studentIdOrUser) {
    if (!studentIdOrUser) return 0;
    const complaints = this.getComplaints();
    
    let targetId = typeof studentIdOrUser === "string" ? studentIdOrUser : studentIdOrUser.id;
    let targetEmail = typeof studentIdOrUser === "object" ? (studentIdOrUser.email || "").toLowerCase() : "";
    let targetRoll = typeof studentIdOrUser === "object" ? (studentIdOrUser.rollNo || "").toUpperCase() : (typeof studentIdOrUser === "string" ? studentIdOrUser.toUpperCase() : "");

    return complaints.filter((c) => {
      const match = c.userId === targetId ||
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
    let targetRoll = typeof studentIdOrUser === "object" ? (studentIdOrUser.rollNo || "").toUpperCase() : (typeof studentIdOrUser === "string" ? studentIdOrUser.toUpperCase() : "");

    let updated = false;
    complaints.forEach((c) => {
      const match = c.userId === targetId ||
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
  },

  markComplaintRead(id) {
    const complaints = this.getComplaints();
    const idx = complaints.findIndex((c) => c.id === id);
    if (idx === -1) return false;
    complaints[idx].unread = false;
    complaints[idx].unreadReply = false;
    this.setComplaints(complaints);
    return true;
  }
};
