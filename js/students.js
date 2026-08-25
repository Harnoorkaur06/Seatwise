/* ==========================================================================
   students.js — SEATWISE University Student Record Manager
   Centralized CRUD, search, disable/enable, and JSON import for student accounts.
   Admin is the sole authority for creating and managing student records.
   ========================================================================== */

const Students = {
  all() {
    return STORAGE.getStudents();
  },

  /** Find student by ID, rollNo, or email */
  findById(idOrRoll) {
    if (!idOrRoll) return null;
    const target = String(idOrRoll).trim().toLowerCase();
    return this.all().find((s) => s.id === idOrRoll || String(s.rollNo).trim().toLowerCase() === target || String(s.email).trim().toLowerCase() === target) || null;
  },

  findByRollNo(rollNo) {
    if (!rollNo) return null;
    const target = String(rollNo).trim().toLowerCase();
    return this.all().find((s) => String(s.rollNo).trim().toLowerCase() === target) || null;
  },

  findByEmail(email) {
    if (!email) return null;
    const target = String(email).trim().toLowerCase();
    return this.all().find((s) => String(s.email).trim().toLowerCase() === target) || null;
  },

  findByEmailAndRollNo(email, rollNo) {
    if (!email || !rollNo) return null;
    const targetEmail = String(email).trim().toLowerCase();
    const targetRoll = String(rollNo).trim().toLowerCase();
    return this.all().find((s) =>
      String(s.email).trim().toLowerCase() === targetEmail &&
      String(s.rollNo).trim().toLowerCase() === targetRoll
    ) || null;
  },

  /** Add a new student record (Admin Only) */
  add({ name, email, rollNo, password, mobile, course, semester, subject, disabled }) {
    if (!name || !name.trim()) return { ok: false, message: "Full name is required." };
    if (!email || !email.trim()) return { ok: false, message: "Email address is required." };
    if (!isValidEmail(email)) return { ok: false, message: "Please enter a valid email address." };
    if (!rollNo || !rollNo.trim()) return { ok: false, message: "University roll number is required." };

    const students = STORAGE.getStudents();
    const normRoll = rollNo.trim().toLowerCase();
    const normEmail = email.trim().toLowerCase();

    if (students.some((s) => String(s.rollNo).trim().toLowerCase() === normRoll || String(s.email).trim().toLowerCase() === normEmail)) {
      return { ok: false, message: "Student with this email or roll number already exists." };
    }

    const hasPassword = Boolean(password && password.trim());

    const newStudent = {
      id: typeof generateId === "function" ? generateId("student") : "student_" + Date.now(),
      name: name.trim(),
      email: email.trim(),
      rollNo: rollNo.trim().toUpperCase(),
      password: hasPassword ? password.trim() : "",
      passwordSet: hasPassword,
      mobile: (mobile || "").trim(),
      course: (course || "CSE").trim(),
      semester: (semester || "5th Semester").trim(),
      subject: (subject || "CS301").trim().toUpperCase(),
      role: "student",
      disabled: disabled === true,
      createdAt: new Date().toISOString()
    };

    students.push(newStudent);
    STORAGE.setStudents(students);
    STORAGE.logActivity(`Student created by admin: ${newStudent.name} (${newStudent.rollNo})`);

    return { ok: true, message: "Student created successfully.", student: newStudent };
  },

  /** Update an existing student record */
  update(idOrRoll, updates) {
    const students = STORAGE.getStudents();
    const targetKey = String(idOrRoll).trim().toLowerCase();
    const idx = students.findIndex((s) => s.id === idOrRoll || String(s.rollNo).trim().toLowerCase() === targetKey || String(s.email).trim().toLowerCase() === targetKey);

    if (idx === -1) {
      return { ok: false, message: "Student record not found." };
    }

    const current = students[idx];

    // Check unique constraints if email or rollNo are being changed
    if (updates.email && updates.email.trim().toLowerCase() !== current.email.toLowerCase()) {
      if (students.some((s, i) => i !== idx && s.email.toLowerCase() === updates.email.trim().toLowerCase())) {
        return { ok: false, message: "Another student with this email address already exists." };
      }
    }

    if (updates.rollNo && updates.rollNo.trim().toLowerCase() !== current.rollNo.toLowerCase()) {
      if (students.some((s, i) => i !== idx && s.rollNo.toLowerCase() === updates.rollNo.trim().toLowerCase())) {
        return { ok: false, message: "Another student with this roll number already exists." };
      }
    }

    // Role is strictly immutable
    delete updates.role;

    if (updates.password !== undefined && updates.password.trim() !== "") {
      updates.passwordSet = true;
    }

    students[idx] = {
      ...students[idx],
      ...updates,
      rollNo: updates.rollNo ? updates.rollNo.trim().toUpperCase() : students[idx].rollNo,
      email: updates.email ? updates.email.trim() : students[idx].email
    };

    STORAGE.setStudents(students);
    STORAGE.logActivity(`Student updated: ${students[idx].name} (${students[idx].rollNo})`);

    return { ok: true, message: "Student record updated successfully.", student: students[idx] };
  },

  /** Enable / Disable student account */
  setDisabled(idOrRoll, disabledState) {
    const students = STORAGE.getStudents();
    const targetKey = String(idOrRoll).trim().toLowerCase();
    const idx = students.findIndex((s) => s.id === idOrRoll || String(s.rollNo).trim().toLowerCase() === targetKey || String(s.email).trim().toLowerCase() === targetKey);

    if (idx === -1) return { ok: false, message: "Student record not found." };

    students[idx].disabled = disabledState === true;
    STORAGE.setStudents(students);

    const actionText = disabledState ? "disabled" : "enabled";
    STORAGE.logActivity(`Student account ${actionText}: ${students[idx].name} (${students[idx].rollNo})`);

    return {
      ok: true,
      message: `Student account ${actionText} successfully.`
    };
  },

  /** Permanently remove student account */
  remove(idOrRoll) {
    const existing = STORAGE.getStudents();
    const targetKey = String(idOrRoll).trim().toLowerCase();
    const target = existing.find((s) => s.id === idOrRoll || String(s.rollNo).trim().toLowerCase() === targetKey);
    if (!target) return { ok: false, message: "Student not found." };

    const filtered = existing.filter((s) => s.id !== target.id && String(s.rollNo).trim().toLowerCase() !== targetKey);
    STORAGE.setStudents(filtered);

    STORAGE.logActivity(`Student deleted permanently: ${target.name} (${target.rollNo})`);
    return { ok: true, message: "Student deleted successfully." };
  },

  search(query) {
    const q = (query || "").trim().toLowerCase();
    const students = STORAGE.getStudents();

    if (!q) return students;

    return students.filter(
      (s) =>
        (s.rollNo && s.rollNo.toLowerCase().includes(q)) ||
        (s.name && s.name.toLowerCase().includes(q)) ||
        (s.email && s.email.toLowerCase().includes(q)) ||
        (s.course && s.course.toLowerCase().includes(q)) ||
        (s.subject && s.subject.toLowerCase().includes(q))
    );
  },

  /** Import JSON roster */
  importJSON(text) {
    let data;
    try {
      data = JSON.parse(text);
    } catch (e) {
      return { ok: false, message: "Invalid JSON syntax. Please check file format." };
    }

    if (!Array.isArray(data)) {
      return { ok: false, message: "JSON root must be an array of student objects." };
    }

    const errors = [];
    const validStudents = [];
    const existingRolls = new Set(STORAGE.getStudents().map((s) => s.rollNo.toLowerCase()));
    const existingEmails = new Set(STORAGE.getStudents().map((s) => s.email.toLowerCase()));

    data.forEach((item, i) => {
      const label = `Row ${i + 1}`;
      if (!item || typeof item !== "object") {
        errors.push(`${label}: Invalid object format.`);
        return;
      }

      const rollNo = (item.rollNo || "").toString().trim().toUpperCase();
      const name = (item.name || "").toString().trim();
      const email = (item.email || `${rollNo.toLowerCase()}@student.com`).toString().trim().toLowerCase();
      const password = item.password ? item.password.toString().trim() : "";
      const subject = (item.subject || "CS301").toString().trim().toUpperCase();

      if (!rollNo) { errors.push(`${label}: missing rollNo.`); return; }
      if (!name) { errors.push(`${label} (${rollNo}): missing name.`); return; }

      if (existingRolls.has(rollNo.toLowerCase())) {
        errors.push(`${label}: rollNo "${rollNo}" already exists in system.`);
        return;
      }

      existingRolls.add(rollNo.toLowerCase());
      existingEmails.add(email);

      validStudents.push({
        id: typeof generateId === "function" ? generateId("student") : "student_" + Math.random().toString(36).substr(2, 9),
        rollNo,
        name,
        email,
        password,
        passwordSet: Boolean(password),
        mobile: (item.mobile || "").toString().trim(),
        course: (item.course || "CSE").toString().trim(),
        semester: (item.semester || "5th Semester").toString().trim(),
        subject,
        role: "student",
        disabled: item.disabled === true,
        createdAt: new Date().toISOString()
      });
    });

    if (validStudents.length > 0) {
      const all = STORAGE.getStudents();
      STORAGE.setStudents([...all, ...validStudents]);
      STORAGE.logActivity(`Imported ${validStudents.length} student records from JSON`);
    }

    return {
      ok: validStudents.length > 0,
      count: validStudents.length,
      errors
    };
  }
};