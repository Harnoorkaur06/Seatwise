// /* ==========================================================================
//    students.js
//    CRUD, search, and JSON-upload validation for student records.
//    Each student: { rollNo, name, subject }
//    ========================================================================== */

// const Students = {
//   all() { return STORAGE.getStudents(); },

//   add(student) {
//     const students = STORAGE.getStudents();
//     if (students.some((s) => s.rollNo.toLowerCase() === student.rollNo.toLowerCase())) {
//       return { ok: false, message: `Roll number ${student.rollNo} already exists.` };
//     }
//     students.push(student);
//     STORAGE.setStudents(students);
//     STORAGE.logActivity(`Student added: ${student.rollNo} (${student.subject})`);
//     return { ok: true };
//   },

//   update(rollNo, updates) {
//     const students = STORAGE.getStudents();
//     const idx = students.findIndex((s) => s.rollNo === rollNo);
//     if (idx === -1) return { ok: false, message: "Student not found." };
//     students[idx] = { ...students[idx], ...updates };
//     STORAGE.setStudents(students);
//     STORAGE.logActivity(`Student updated: ${rollNo}`);
//     return { ok: true };
//   },

//   remove(rollNo) {
//     const students = STORAGE.getStudents().filter((s) => s.rollNo !== rollNo);
//     STORAGE.setStudents(students);
//     STORAGE.logActivity(`Student removed: ${rollNo}`);
//     return { ok: true };
//   },

//   search(query) {
//     const q = (query || "").trim().toLowerCase();
//     const students = STORAGE.getStudents();
//     if (!q) return students;
//     return students.filter((s) =>
//       s.rollNo.toLowerCase().includes(q) ||
//       s.name.toLowerCase().includes(q) ||
//       s.subject.toLowerCase().includes(q)
//     );
//   },

//   subjectDistribution() {
//     const students = STORAGE.getStudents();
//     const dist = {};
//     students.forEach((s) => { dist[s.subject] = (dist[s.subject] || 0) + 1; });
//     return dist;
//   },

//   /**
//    * Validate an uploaded JSON array of students.
//    * Returns { ok, validStudents, errors[] }
//    */
//   validateUploadedJSON(text) {
//     let data;
//     try {
//       data = JSON.parse(text);
//     } catch (e) {
//       return { ok: false, validStudents: [], errors: ["Invalid JSON syntax. Please check the file format."] };
//     }
//     if (!Array.isArray(data)) {
//       return { ok: false, validStudents: [], errors: ["JSON root must be an array of student objects."] };
//     }

//     const errors = [];
//     const seenRolls = new Set();
//     const existing = new Set(STORAGE.getStudents().map((s) => s.rollNo.toLowerCase()));
//     const validStudents = [];

//     data.forEach((item, i) => {
//       const rowLabel = `Row ${i + 1}`;
//       if (!item || typeof item !== "object") {
//         errors.push(`${rowLabel}: not a valid object.`);
//         return;
//       }
//       const rollNo = (item.rollNo || "").toString().trim();
//       const name = (item.name || "").toString().trim();
//       const subject = (item.subject || "").toString().trim().toUpperCase();

//       if (!rollNo) { errors.push(`${rowLabel}: missing rollNo.`); return; }
//       if (!name) { errors.push(`${rowLabel} (${rollNo}): missing name.`); return; }
//       if (!subject) { errors.push(`${rowLabel} (${rollNo}): missing subject.`); return; }

//       const rollKey = rollNo.toLowerCase();
//       if (seenRolls.has(rollKey)) { errors.push(`${rowLabel}: duplicate rollNo "${rollNo}" within the uploaded file.`); return; }
//       if (existing.has(rollKey)) { errors.push(`${rowLabel}: rollNo "${rollNo}" already exists in the system.`); return; }

//       seenRolls.add(rollKey);
//       validStudents.push({ rollNo, name, subject });
//     });

//     return { ok: validStudents.length > 0, validStudents, errors };
//   },

//   bulkAdd(students) {
//     const all = STORAGE.getStudents();
//     STORAGE.setStudents([...all, ...students]);
//     STORAGE.logActivity(`Bulk uploaded ${students.length} students`);
//   }
// };


/* ==========================================================================
   students.js
   CRUD, search, and JSON-upload validation for student records.
   Each student: { rollNo, name, subject }
   ========================================================================== */

const Students = {
  all() {
    return STORAGE.getStudents();
  },

  add(student) {
    const students = STORAGE.getStudents();

    if (
      !student ||
      !student.rollNo ||
      !student.name ||
      !student.subject
    ) {
      return {
        ok: false,
        message: "Roll number, name and subject are required."
      };
    }

    if (
      students.some(
        (s) =>
          s.rollNo.toLowerCase() ===
          student.rollNo.toLowerCase()
      )
    ) {
      return {
        ok: false,
        message: `Roll number ${student.rollNo} already exists.`
      };
    }

    students.push(student);

    STORAGE.setStudents(students);

    // Existing seating is no longer guaranteed to match the student data.
    STORAGE.clearSeatingPlan();

    STORAGE.logActivity(
      `Student added: ${student.rollNo} (${student.subject})`
    );

    return { ok: true };
  },

  update(rollNo, updates) {
    const students = STORAGE.getStudents();

    const idx = students.findIndex(
      (s) => s.rollNo === rollNo
    );

    if (idx === -1) {
      return {
        ok: false,
        message: "Student not found."
      };
    }

    students[idx] = {
      ...students[idx],
      ...updates
    };

    STORAGE.setStudents(students);

    // Any student modification can affect the seating constraints.
    STORAGE.clearSeatingPlan();

    STORAGE.logActivity(
      `Student updated: ${rollNo}`
    );

    return { ok: true };
  },

  remove(rollNo) {
    const existing = STORAGE.getStudents();

    const studentExists = existing.some(
      (s) => s.rollNo === rollNo
    );

    const students = existing.filter(
      (s) => s.rollNo !== rollNo
    );

    STORAGE.setStudents(students);

    if (studentExists) {
      // Existing plan may contain the removed student.
      STORAGE.clearSeatingPlan();

      STORAGE.logActivity(
        `Student removed: ${rollNo}`
      );
    }

    return { ok: true };
  },

  search(query) {
    const q = (query || "")
      .trim()
      .toLowerCase();

    const students = STORAGE.getStudents();

    if (!q) return students;

    return students.filter(
      (s) =>
        s.rollNo.toLowerCase().includes(q) ||
        s.name.toLowerCase().includes(q) ||
        s.subject.toLowerCase().includes(q)
    );
  },

  subjectDistribution() {
    const students = STORAGE.getStudents();
    const dist = {};

    students.forEach((s) => {
      dist[s.subject] =
        (dist[s.subject] || 0) + 1;
    });

    return dist;
  },

  /**
   * Validate an uploaded JSON array of students.
   * Returns { ok, validStudents, errors[] }
   */
  validateUploadedJSON(text) {
    let data;

    try {
      data = JSON.parse(text);
    } catch (e) {
      return {
        ok: false,
        validStudents: [],
        errors: [
          "Invalid JSON syntax. Please check the file format."
        ]
      };
    }

    if (!Array.isArray(data)) {
      return {
        ok: false,
        validStudents: [],
        errors: [
          "JSON root must be an array of student objects."
        ]
      };
    }

    const errors = [];
    const seenRolls = new Set();

    const existing = new Set(
      STORAGE.getStudents().map(
        (s) => s.rollNo.toLowerCase()
      )
    );

    const validStudents = [];

    data.forEach((item, i) => {
      const rowLabel = `Row ${i + 1}`;

      if (
        !item ||
        typeof item !== "object"
      ) {
        errors.push(
          `${rowLabel}: not a valid object.`
        );
        return;
      }

      const rollNo = (item.rollNo || "")
        .toString()
        .trim();

      const name = (item.name || "")
        .toString()
        .trim();

      const subject = (item.subject || "")
        .toString()
        .trim()
        .toUpperCase();

      if (!rollNo) {
        errors.push(
          `${rowLabel}: missing rollNo.`
        );
        return;
      }

      if (!name) {
        errors.push(
          `${rowLabel} (${rollNo}): missing name.`
        );
        return;
      }

      if (!subject) {
        errors.push(
          `${rowLabel} (${rollNo}): missing subject.`
        );
        return;
      }

      const rollKey = rollNo.toLowerCase();

      if (seenRolls.has(rollKey)) {
        errors.push(
          `${rowLabel}: duplicate rollNo "${rollNo}" within the uploaded file.`
        );
        return;
      }

      if (existing.has(rollKey)) {
        errors.push(
          `${rowLabel}: rollNo "${rollNo}" already exists in the system.`
        );
        return;
      }

      seenRolls.add(rollKey);

      validStudents.push({
        rollNo,
        name,
        subject
      });
    });

    return {
      ok: validStudents.length > 0,
      validStudents,
      errors
    };
  },

  bulkAdd(students) {
    if (!Array.isArray(students) || students.length === 0) {
      return {
        ok: false,
        message: "No students to add."
      };
    }

    const all = STORAGE.getStudents();

    STORAGE.setStudents([
      ...all,
      ...students
    ]);

    // Uploaded students change the population used by the seating plan.
    STORAGE.clearSeatingPlan();

    STORAGE.logActivity(
      `Bulk uploaded ${students.length} students`
    );

    return { ok: true };
  }
};