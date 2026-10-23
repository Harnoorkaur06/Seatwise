const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

const UserSchema = new mongoose.Schema(
  {
    id: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      index: true,
    },
    rollNo: {
      type: String,
      uppercase: true,
      trim: true,
      sparse: true,
      index: true,
      default: "",
    },
    fatherName: {
      type: String,
      default: "Mr. SATINDER SINGH",
    },
    classBranch: {
      type: String,
      default: "2024-BE-CSE-AI-4 SEM",
    },
    department: {
      type: String,
      default: "Department of Computer Science & Engineering (Artificial Intelligence & Machine Learning)",
    },
    coursesList: {
      type: [String],
      default: ["24APS4101", "24CAI0201", "24CAI0202", "24CAI0203", "24CAI0204", "24UNI0124", "25MOC0136", "25MOC0137", "25MOC0138", "25MOC0139", "Curriculum"],
    },
    password: {
      type: String,
      default: "",
    },
    passwordSet: {
      type: Boolean,
      default: false,
    },
    mobile: {
      type: String,
      default: "",
    },
    course: {
      type: String,
      default: "CSE-AI",
    },
    semester: {
      type: String,
      default: "4th Semester",
    },
    subject: {
      type: String,
      default: "24CAI0201",
    },
    avatar: {
      type: String,
      default: "",
    },
    role: {
      type: String,
      enum: ["admin", "student"],
      default: "student",
      required: true,
      index: true,
    },
    disabled: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  }
);

// Pre-save hook to hash password if modified
UserSchema.pre("save", async function (next) {
  if (!this.isModified("password") || !this.password) {
    return next();
  }
  try {
    // If password is already bcrypt hash, skip hashing
    if (this.password.startsWith("$2a$") || this.password.startsWith("$2b$")) {
      return next();
    }
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    this.passwordSet = true;
    next();
  } catch (err) {
    next(err);
  }
});

// Instance method to check password
UserSchema.methods.comparePassword = async function (candidatePassword) {
  if (!this.password) return false;
  return bcrypt.compare(candidatePassword, this.password);
};

// Safe JSON transform (strip password)
UserSchema.methods.toSafeObject = function () {
  const obj = this.toObject();
  delete obj.password;
  delete obj.__v;
  return obj;
};

module.exports = mongoose.model("User", UserSchema);
