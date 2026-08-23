/* ==========================================================================
   profile.js — SEATWISE Student Profile Manager
   ========================================================================== */

const ProfileManager = {
  init() {
    this.loadProfile();
    this.wireEvents();
  },

  /** Load logged-in user details and avatar */
  loadProfile() {
    const current = Auth.currentUser();
    if (!current) return;

    // Form inputs
    const nameInput = document.getElementById("profile-name");
    const emailInput = document.getElementById("profile-email");
    const rollNoInput = document.getElementById("profile-rollno");

    // Summary elements
    const summaryName = document.getElementById("summary-name");
    const summaryRollNo = document.getElementById("summary-rollno");
    const summaryEmail = document.getElementById("summary-email");

    // Avatar elements
    const avatarFrame = document.getElementById("avatar-frame");
    const removeBtn = document.getElementById("btn-remove-photo");

    if (nameInput) nameInput.value = current.name || "";
    if (emailInput) emailInput.value = current.email || "";
    if (rollNoInput) rollNoInput.value = current.rollNo || "";

    if (summaryName) summaryName.textContent = current.name || "Student";
    if (summaryRollNo) summaryRollNo.textContent = current.rollNo ? `Roll No: ${current.rollNo}` : "Roll No: Unlinked";
    if (summaryEmail) summaryEmail.textContent = current.email || "";

    if (avatarFrame) {
      if (current.avatar) {
        avatarFrame.innerHTML = `<img src="${current.avatar}" alt="Avatar" />`;
        if (removeBtn) removeBtn.style.display = "inline-block";
      } else {
        const initial = current.name ? current.name.charAt(0).toUpperCase() : "?";
        avatarFrame.innerHTML = `<span id="avatar-initial">${initial}</span>`;
        if (removeBtn) removeBtn.style.display = "none";
      }
    }
  },

  /** Handle Avatar Photo Upload */
  handleAvatarUpload(file) {
    const current = Auth.currentUser();
    if (!current || !file) return;

    if (!file.type.startsWith("image/")) {
      if (typeof showToast === "function") showToast("Please select a valid image file.", "error");
      return;
    }

    if (file.size > 2 * 1024 * 1024) {
      if (typeof showToast === "function") showToast("Image size must be under 2MB.", "error");
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const dataUrl = e.target.result;
      const result = Students.update(current.id, { avatar: dataUrl });
      if (result.ok) {
        const updatedUser = { ...current, avatar: dataUrl };
        STORAGE.setCurrentUser(updatedUser);
        if (typeof showToast === "function") showToast("✓ Profile photo updated!", "success");
        this.loadProfile();
        if (window.App && typeof App._renderCurrentUserBadge === "function") {
          App._renderCurrentUserBadge();
        }
      } else {
        if (typeof showToast === "function") showToast("Failed to save profile photo.", "error");
      }
    };
    reader.readAsDataURL(file);
  },

  /** Remove Profile Photo */
  removePhoto() {
    const current = Auth.currentUser();
    if (!current) return;

    const result = Students.update(current.id, { avatar: "" });
    if (result.ok) {
      const updatedUser = { ...current, avatar: "" };
      STORAGE.setCurrentUser(updatedUser);
      if (typeof showToast === "function") showToast("Profile photo removed.", "info");
      this.loadProfile();
      if (window.App && typeof App._renderCurrentUserBadge === "function") {
        App._renderCurrentUserBadge();
      }
    }
  },

  /** Save Personal Information */
  savePersonal(e) {
    if (e) e.preventDefault();
    const current = Auth.currentUser();
    if (!current) return;

    const name = (document.getElementById("profile-name")?.value || "").trim();
    const email = (document.getElementById("profile-email")?.value || "").trim();

    if (!name || !email) {
      if (typeof showToast === "function") showToast("Name and email are required.", "error");
      return;
    }

    if (typeof isValidEmail === "function" && !isValidEmail(email)) {
      if (typeof showToast === "function") showToast("Please enter a valid email address.", "error");
      return;
    }

    const result = Students.update(current.id, { name, email });
    if (result.ok) {
      const updatedUser = { ...current, name, email };
      STORAGE.setCurrentUser(updatedUser);
      if (typeof showToast === "function") showToast("✓ Personal info saved successfully.", "success");
      this.loadProfile();
      if (window.App && typeof App._renderCurrentUserBadge === "function") {
        App._renderCurrentUserBadge();
      }
    } else {
      if (typeof showToast === "function") showToast(result.message || "Failed to update profile.", "error");
    }
  },

  /** Event Listeners Setup */
  wireEvents() {
    const avatarInput = document.getElementById("avatar-input");
    if (avatarInput) {
      avatarInput.addEventListener("change", (e) => {
        if (e.target.files && e.target.files[0]) {
          this.handleAvatarUpload(e.target.files[0]);
        }
      });
    }

    const personalForm = document.getElementById("profile-personal-form");
    if (personalForm) {
      personalForm.addEventListener("submit", (e) => this.savePersonal(e));
    }
  }
};

document.addEventListener("DOMContentLoaded", () => {
  if (window.Auth && typeof Auth.requireUser === "function") {
    Auth.requireUser();
  }
  ProfileManager.init();
});
