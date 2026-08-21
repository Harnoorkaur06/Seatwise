/* ==========================================================================
   profile.js — SEATWISE Student Profile Manager (Redesigned)
   ========================================================================== */

const ProfileManager = {
  init() {
    this.loadProfile();
    this.loadMobile();
    this.initAppearance();
    this.loadComplaints();
    this.wireEvents();
  },

  /** Load logged-in user details and avatar */
  loadProfile() {
    const current = Auth.currentUser();
    if (!current) return;
    const users = STORAGE.getUsers();
    const record = users.find((u) => u.id === current.id) || current;

    const nameInput = document.getElementById("profile-name");
    const emailInput = document.getElementById("profile-email");
    const rollNoInput = document.getElementById("profile-rollno");
    const avatarFrame = document.getElementById("avatar-frame");
    const removeBtn = document.getElementById("btn-remove-photo");

    if (nameInput) nameInput.value = record.name || "";
    if (emailInput) emailInput.value = record.email || "";
    if (rollNoInput) rollNoInput.value = record.rollNo || "";

    if (avatarFrame) {
      if (record.avatar) {
        avatarFrame.innerHTML = `<img src="${record.avatar}" alt="Avatar" />`;
        if (removeBtn) removeBtn.style.display = "inline-block";
      } else {
        const initial = record.name ? record.name.charAt(0).toUpperCase() : "?";
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

    if (file.size > 2 * 1024 * 1024) { // 2MB limit for base64 storage
      if (typeof showToast === "function") showToast("Image size must be under 2MB.", "error");
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const dataUrl = e.target.result;
      const result = Users.update(current.id, { avatar: dataUrl });
      if (result.ok) {
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

    const result = Users.update(current.id, { avatar: "" });
    if (result.ok) {
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
    const rollNo = (document.getElementById("profile-rollno")?.value || "").trim();

    if (!name || !email) {
      if (typeof showToast === "function") showToast("Name and email are required.", "error");
      return;
    }

    if (typeof isValidEmail === "function" && !isValidEmail(email)) {
      if (typeof showToast === "function") showToast("Please enter a valid email address.", "error");
      return;
    }

    const result = Users.update(current.id, { name, email, rollNo });
    if (result.ok) {
      if (typeof showToast === "function") showToast("✓ Personal info saved successfully.", "success");
      if (window.App && typeof App._renderCurrentUserBadge === "function") {
        App._renderCurrentUserBadge();
      }
    } else {
      if (typeof showToast === "function") showToast(result.message || "Failed to update profile.", "error");
    }
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

    const users = STORAGE.getUsers();
    const record = users.find((u) => u.id === current.id);
    if (!record) {
      if (typeof showToast === "function") showToast("User record not found.", "error");
      return;
    }

    if (record.password !== currentPwd) {
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

    const result = Users.update(current.id, { password: newPwd });
    if (result.ok) {
      if (typeof showToast === "function") showToast("✓ Password updated successfully.", "success");
      if (currentPwdInput) currentPwdInput.value = "";
      if (newPwdInput) newPwdInput.value = "";
      if (confirmPwdInput) confirmPwdInput.value = "";
    } else {
      if (typeof showToast === "function") showToast(result.message || "Failed to update password.", "error");
    }
  },

  /** Load Mobile Number */
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

  /** Save Mobile Number */
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

  /** Wire appearance controls to SettingsManager */
  initAppearance() {
    if (typeof SettingsManager === "undefined") return;
    const settings = SettingsManager.loadSettings();

    const themeToggle = document.getElementById("pref-theme-toggle");
    const sidebarToggle = document.getElementById("pref-sidebar-toggle");

    if (themeToggle) {
      themeToggle.checked = settings.theme === "dark";
      themeToggle.onchange = (e) => {
        SettingsManager.setTheme(e.target.checked ? "dark" : "light");
      };
    }

    if (sidebarToggle) {
      sidebarToggle.checked = !!settings.sidebarCollapsed;
      sidebarToggle.onchange = (e) => {
        SettingsManager.setSidebarCollapsed(e.target.checked);
      };
    }
  },

  /** Submit a student complaint to admin */
  submitComplaint(e) {
    if (e) e.preventDefault();
    const current = Auth.currentUser();
    if (!current) return;

    const categorySelect = document.getElementById("complaint-category");
    const subjectInput = document.getElementById("complaint-subject");
    const messageInput = document.getElementById("complaint-message");

    const category = categorySelect?.value || "Other";
    const subject = (subjectInput?.value || "").trim();
    const message = (messageInput?.value || "").trim();

    if (!subject || !message) {
      if (typeof showToast === "function") showToast("Please provide both subject and complaint message.", "error");
      return;
    }

    const complaint = {
      id: typeof generateId === "function" ? generateId("cmpl") : "cmpl_" + Date.now(),
      userId: current.id,
      userName: current.name,
      userEmail: current.email,
      category,
      subject,
      message,
      status: "Pending",
      adminReply: "",
      unread: false,
      createdAt: new Date().toISOString()
    };

    STORAGE.addComplaint(complaint);
    if (typeof showToast === "function") showToast("✓ Complaint submitted successfully.", "success");

    if (subjectInput) subjectInput.value = "";
    if (messageInput) messageInput.value = "";
    if (categorySelect) categorySelect.value = "Seating Issue";

    this.loadComplaints();
  },

  /** Render list of complaints and handle unread notification badge count */
  loadComplaints() {
    const current = Auth.currentUser();
    if (!current) return;

    const container = document.getElementById("my-complaints-list");
    const badgeEl = document.getElementById("unread-count-badge");
    if (!container) return;

    const allComplaints = STORAGE.getComplaints();
    const myComplaints = allComplaints.filter((c) => c.userId === current.id);

    // Calculate unread admin messages count
    const unreadCount = myComplaints.filter((c) => c.unread === true).length;
    if (badgeEl) {
      if (unreadCount > 0) {
        badgeEl.textContent = unreadCount;
        badgeEl.style.display = "inline-flex";
      } else {
        badgeEl.style.display = "none";
      }
    }

    if (myComplaints.length === 0) {
      container.innerHTML = `
        <div class="table-empty" style="padding:20px 12px; text-align:center;">
          <div class="empty-icon" style="font-size:22px;">📩</div>
          <div class="empty-title" style="font-size:13px; font-weight:700; color:var(--ink); margin-top:4px;">No complaints submitted</div>
          <div class="empty-desc" style="font-size:11.5px; color:var(--muted); margin-top:2px;">Use the form above to contact administrators.</div>
        </div>`;
      return;
    }

    container.innerHTML = `
      <div style="display:flex; flex-direction:column; gap:10px;">
        ${myComplaints.map((c) => {
          let badgeClass = "badge-warning";
          if (c.status === "In Review") badgeClass = "badge-info";
          if (c.status === "Resolved") badgeClass = "badge-success";
          const formattedDate = typeof formatDate === "function" ? formatDate(c.createdAt) : new Date(c.createdAt).toLocaleDateString();
          const isUnread = c.unread === true;

          return `
            <div class="${isUnread ? 'unread-complaint-row' : ''}" onclick="ProfileManager.markRead('${c.id}')" style="padding:12px; border-radius:var(--radius-md); border:1px solid var(--line); background:#fff; transition:all 0.2s ease;">
              <div style="display:flex; justify-content:space-between; align-items:flex-start;">
                <div>
                  <div style="font-weight:700; color:var(--ink); font-size:13px;">
                    ${isUnread ? '<span style="color:#ef4444; margin-right:4px;">● NEW</span>' : ''} ${escapeHTML(c.subject)}
                  </div>
                  <div style="font-size:11.5px; color:var(--muted); margin-top:2px;">${escapeHTML(c.message)}</div>
                </div>
                <span class="badge ${badgeClass}" style="font-size:10px; margin-left:6px; flex-shrink:0;">${escapeHTML(c.status || "Pending")}</span>
              </div>
              
              ${c.adminReply ? `
                <div style="margin-top:8px; padding:8px 10px; background:rgba(154,59,185,0.08); border-left:3px solid var(--purple-4); border-radius:4px; font-size:11.5px; color:var(--ink);">
                  <strong>💬 Admin Response:</strong> ${escapeHTML(c.adminReply)}
                </div>
              ` : ''}

              <div style="display:flex; justify-content:space-between; margin-top:8px; font-size:10.5px; color:var(--muted);">
                <span>Category: <strong>${escapeHTML(c.category || "Other")}</strong></span>
                <span>Date: ${formattedDate}</span>
              </div>
            </div>
          `;
        }).join("")}
      </div>
    `;
  },

  /** Mark complaint as read and update unread notification badge count */
  markRead(complaintId) {
    const ok = STORAGE.markComplaintRead(complaintId);
    if (ok) {
      this.loadComplaints();
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

    const pwdForm = document.getElementById("profile-pwd-form");
    if (pwdForm) {
      pwdForm.addEventListener("submit", (e) => this.changePassword(e));
    }

    const mobileForm = document.getElementById("profile-mobile-form");
    if (mobileForm) {
      mobileForm.addEventListener("submit", (e) => this.saveMobile(e));
    }

    const complaintForm = document.getElementById("profile-complaint-form");
    if (complaintForm) {
      complaintForm.addEventListener("submit", (e) => this.submitComplaint(e));
    }
  }
};

document.addEventListener("DOMContentLoaded", () => {
  if (window.Auth && typeof Auth.requireUser === "function") {
    Auth.requireUser();
  }
  ProfileManager.init();
});
