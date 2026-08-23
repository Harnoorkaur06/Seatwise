/* ==========================================================================
   update-password.js — Update Password Controller
   Updates student.password in the Students database.
   ========================================================================== */

const UpdatePasswordManager = {
  init() {
    this.wireEvents();
  },

  /** Handle Password Change */
  changePassword(e) {
    if (e) e.preventDefault();
    const current = Auth.currentUser();
    if (!current) return;

    const currentPwdInput = document.getElementById("pwd-current");
    const newPwdInput = document.getElementById("pwd-new");
    const confirmPwdInput = document.getElementById("pwd-confirm");

    const currentPwd = currentPwdInput?.value || "";
    const newPwd = newPwdInput?.value || "";
    const confirmPwd = confirmPwdInput?.value || "";

    const student = Students.findById(current.id || current.rollNo);
    if (!student) {
      if (typeof showToast === "function") showToast("Student record not found.", "error");
      return;
    }

    if (student.password !== currentPwd) {
      if (typeof showToast === "function") showToast("⚠ Current password is incorrect.", "error");
      return;
    }

    if (!newPwd || newPwd.length < 6) {
      if (typeof showToast === "function") showToast("⚠ New password must be at least 6 characters.", "error");
      return;
    }

    if (newPwd !== confirmPwd) {
      if (typeof showToast === "function") showToast("⚠ New passwords do not match.", "error");
      return;
    }

    const result = Students.update(student.id || student.rollNo, { password: newPwd, passwordSet: true });
    if (result.ok) {
      if (typeof showToast === "function") showToast("✓ Password updated successfully.", "success");
      if (currentPwdInput) currentPwdInput.value = "";
      if (newPwdInput) newPwdInput.value = "";
      if (confirmPwdInput) confirmPwdInput.value = "";
    } else {
      if (typeof showToast === "function") showToast(result.message || "Failed to update password.", "error");
    }
  },

  wireEvents() {
    const form = document.getElementById("profile-pwd-form");
    if (form) {
      form.addEventListener("submit", (e) => this.changePassword(e));
    }
  }
};

document.addEventListener("DOMContentLoaded", () => {
  if (window.Auth && typeof Auth.requireUser === "function") {
    Auth.requireUser();
  }
  UpdatePasswordManager.init();
});
