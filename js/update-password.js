/* ==========================================================================
   update-password.js — Student Password Update Controller
   ========================================================================== */

const UpdatePasswordManager = {
  init() {
    this.wireEvents();
  },

  /** Handle Password Change */
  changePassword(e) {
    if (e) e.preventDefault();

    const currentPwdInput = document.getElementById("pwd-current");
    const newPwdInput = document.getElementById("pwd-new");
    const confirmPwdInput = document.getElementById("pwd-confirm");

    const currentPassword = currentPwdInput?.value || "";
    const newPassword = newPwdInput?.value || "";
    const confirmPassword = confirmPwdInput?.value || "";

    const result = Auth.updateStudentPassword({
      currentPassword,
      newPassword,
      confirmPassword
    });

    if (result.ok) {
      if (typeof showToast === "function") showToast("✓ " + result.message, "success");
      if (currentPwdInput) currentPwdInput.value = "";
      if (newPwdInput) newPwdInput.value = "";
      if (confirmPwdInput) confirmPwdInput.value = "";
    } else {
      if (typeof showToast === "function") showToast("⚠ " + result.message, "error");
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
