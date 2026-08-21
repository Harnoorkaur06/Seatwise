/* ==========================================================================
   mobile-number.js — Mobile Number Controller
   ========================================================================== */

const MobileNumberManager = {
  init() {
    this.loadMobile();
    this.wireEvents();
  },

  loadMobile() {
    const current = Auth.currentUser();
    if (!current) return;
    const users = STORAGE.getUsers();
    const record = users.find((u) => u.id === current.id) || current;

    const displayEl = document.getElementById("current-mobile-display");
    const inputEl = document.getElementById("mobile-input");

    const currentMobile = (record.mobile || "").trim();
    if (displayEl) {
      displayEl.textContent = currentMobile ? currentMobile : "Not added";
      displayEl.style.color = currentMobile ? "var(--ink)" : "var(--muted)";
    }
    if (inputEl) {
      inputEl.value = currentMobile;
    }
  },

  saveMobile(e) {
    if (e) e.preventDefault();
    const current = Auth.currentUser();
    if (!current) return;

    const inputEl = document.getElementById("mobile-input");
    const newMobile = (inputEl?.value || "").trim();

    if (newMobile && !/^[0-9+\-\s()]{7,15}$/.test(newMobile)) {
      if (typeof showToast === "function") showToast("Please enter a valid mobile number (7-15 digits).", "error");
      return;
    }

    const result = Users.update(current.id, { mobile: newMobile });
    if (result.ok) {
      if (typeof showToast === "function") showToast("✓ Mobile number updated successfully.", "success");
      this.loadMobile();
    } else {
      if (typeof showToast === "function") showToast(result.message || "Failed to update mobile number.", "error");
    }
  },

  wireEvents() {
    const form = document.getElementById("mobile-form");
    if (form) {
      form.addEventListener("submit", (e) => this.saveMobile(e));
    }
  }
};

document.addEventListener("DOMContentLoaded", () => {
  if (window.Auth && typeof Auth.requireUser === "function") {
    Auth.requireUser();
  }
  MobileNumberManager.init();
});
