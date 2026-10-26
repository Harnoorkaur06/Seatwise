/* ==========================================================================
   students.js — SEATWISE University Student Record Manager (MongoDB Edition)
   Centralized CRUD, search, disable/enable, and JSON import for student accounts.
   ========================================================================== */

const Students = {
  all() {
    return STORAGE.getStudents();
  },

  async allAsync(q = "") {
    return STORAGE.getStudentsAsync(q);
  },

  /** Find student by ID, rollNo, or email */
  findById(idOrRoll) {
    if (!idOrRoll) return null;
    const target = String(idOrRoll).trim().toLowerCase();
    return (
      this.all().find(
        (s) =>
          s.id === idOrRoll ||
          (s._id && String(s._id) === idOrRoll) ||
          String(s.rollNo).trim().toLowerCase() === target ||
          String(s.email).trim().toLowerCase() === target
      ) || null
    );
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
    return (
      this.all().find(
        (s) =>
          String(s.email).trim().toLowerCase() === targetEmail &&
          String(s.rollNo).trim().toLowerCase() === targetRoll
      ) || null
    );
  },

  /** Add a new student record (Admin Only) */
  async add({ name, email, rollNo, password, mobile, course, semester, subject, disabled }) {
    if (!name || !name.trim()) return { ok: false, message: "Full name is required." };
    if (!email || !email.trim()) return { ok: false, message: "Email address is required." };
    if (typeof isValidEmail === "function" && !isValidEmail(email)) {
      return { ok: false, message: "Please enter a valid email address." };
    }
    if (!rollNo || !rollNo.trim()) return { ok: false, message: "University roll number is required." };

    const payload = {
      name: name.trim(),
      email: email.trim(),
      rollNo: rollNo.trim().toUpperCase(),
      password: password ? password.trim() : "",
      mobile: (mobile || "").trim(),
      course: (course || "CSE").trim(),
      semester: (semester || "5th Semester").trim(),
      subject: (subject || "CS301").trim().toUpperCase(),
      disabled: disabled === true,
    };

    if (typeof API !== "undefined" && API.students) {
      const res = await API.students.create(payload);
      if (res.ok) {
        await STORAGE.sync();
        return { ok: true, message: res.message || "Student created successfully.", student: res.student };
      }
      return { ok: false, message: res.message || "Failed to create student." };
    }

    // Local fallback
    const students = STORAGE.getStudents();
    const newStudent = {
      id: typeof generateId === "function" ? generateId("student") : "student_" + Date.now(),
      ...payload,
      passwordSet: Boolean(payload.password),
      role: "student",
      createdAt: new Date().toISOString(),
    };
    students.push(newStudent);
    STORAGE.setStudents(students);
    STORAGE.logActivity(`Student created by admin: ${newStudent.name} (${newStudent.rollNo})`);
    return { ok: true, message: "Student created successfully.", student: newStudent };
  },

  /** Update an existing student record */
  async update(idOrRoll, updates) {
    if (typeof API !== "undefined" && API.students) {
      const res = await API.students.update(idOrRoll, updates);
      if (res.ok) {
        await STORAGE.sync();
        return { ok: true, message: res.message || "Student record updated successfully.", student: res.student };
      }
      return { ok: false, message: res.message || "Failed to update student." };
    }

    // Local fallback
    const students = STORAGE.getStudents();
    const targetKey = String(idOrRoll).trim().toLowerCase();
    const idx = students.findIndex(
      (s) =>
        s.id === idOrRoll ||
        String(s.rollNo).trim().toLowerCase() === targetKey ||
        String(s.email).trim().toLowerCase() === targetKey
    );

    if (idx === -1) return { ok: false, message: "Student record not found." };

    delete updates.role;
    students[idx] = { ...students[idx], ...updates };
    STORAGE.setStudents(students);
    STORAGE.logActivity(`Student updated: ${students[idx].name} (${students[idx].rollNo})`);
    return { ok: true, message: "Student record updated successfully.", student: students[idx] };
  },

  /** Enable / Disable student account */
  async setDisabled(idOrRoll, disabledState) {
    if (typeof API !== "undefined" && API.students) {
      const res = await API.students.update(idOrRoll, { disabled: disabledState });
      if (res.ok) {
        await STORAGE.sync();
        const actionText = disabledState ? "disabled" : "enabled";
        return { ok: true, message: `Student account ${actionText} successfully.` };
      }
      return { ok: false, message: res.message || "Failed to update account status." };
    }

    return this.update(idOrRoll, { disabled: disabledState });
  },

  /** Permanently remove student account */
  async remove(idOrRoll) {
    if (typeof API !== "undefined" && API.students) {
      const res = await API.students.delete(idOrRoll);
      if (res.ok) {
        await STORAGE.sync();
        return { ok: true, message: res.message || "Student deleted successfully." };
      }
      return { ok: false, message: res.message || "Failed to delete student." };
    }

    const existing = STORAGE.getStudents();
    const targetKey = String(idOrRoll).trim().toLowerCase();
    const target = existing.find(
      (s) => s.id === idOrRoll || String(s.rollNo).trim().toLowerCase() === targetKey
    );
    if (!target) return { ok: false, message: "Student not found." };

    const filtered = existing.filter(
      (s) => s.id !== target.id && String(s.rollNo).trim().toLowerCase() !== targetKey
    );
    STORAGE.setStudents(filtered);
    STORAGE.logActivity(`Student deleted permanently: ${target.name} (${target.rollNo})`);
    return { ok: true, message: "Student deleted successfully." };
  },

  search(query) {
    const q = (query || "").trim().toLowerCase();
    const students = this.all();

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
  async importJSON(text) {
    let data;
    try {
      data = JSON.parse(text);
    } catch (e) {
      return { ok: false, message: "Invalid JSON syntax. Please check file format." };
    }

    if (!Array.isArray(data)) {
      return { ok: false, message: "JSON root must be an array of student objects." };
    }

    if (typeof API !== "undefined" && API.students) {
      const res = await API.students.import(data);
      if (res.ok) {
        await STORAGE.sync();
        return res;
      }
      return { ok: false, message: res.message || "Failed to import roster.", errors: res.errors };
    }

    return { ok: false, message: "API service not available for import." };
  },
};