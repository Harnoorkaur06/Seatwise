const mongoose = require("mongoose");
const User = require("./User");

/**
 * Student Model — Mongoose Discriminator of User
 * Maps students cleanly to the shared 'users' collection with role="student".
 * Allows explicit `ref: 'Student'` references and Mongoose `populate()`.
 */
let Student;

try {
  Student = mongoose.model("Student");
} catch (e) {
  const StudentSchema = new mongoose.Schema(
    {
      enrollmentYear: { type: Number, default: 2024 },
    },
    { discriminatorKey: "role" }
  );

  Student = User.discriminator("student", StudentSchema, "student");
  // Also register alias 'Student' for ref: 'Student'
  mongoose.model("Student", User.schema, "users");
}

module.exports = mongoose.model("Student");
