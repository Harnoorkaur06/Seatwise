/* ==========================================================================
   profile.js — SEATWISE Student Profile Manager
   ========================================================================== */

const ProfileManager = {
  init() {
    this.loadProfile();
    this.initAppearance();
    this.loadComplaints();
    this.wireEvents();
  },

  /** Load logged in user details into Personal Information form */
  loadProfile() {
    const current = Auth.currentUser();
    if (!current) return;
    const users = STORAGE.getUsers();
    const record = users.find((u) => u.id === current.id) || current;

    const nameInput = document.getElementById("profile-name");
    const emailInput = document.getElementById("profile-email");
    const mobileInput = document.getElementById("profile-mobile");
    const rollNoInput = document.getElementById("profile-rollno");

    if (nameInput) nameInput.value = record.name || "";
    if (emailInput) emailInput.value = record.email || "";
    if (mobileInput) mobileInput.value = record.mobile || "";
    if (rollNoInput) rollNoInput.value = record.rollNo || "";
  },

  /** Save Personal Information updates */
  saveProfile(e) {
    if (e) e.preventDefault();
    const current = Auth.currentUser();
    if (!current) return;

    const name = (document.getElementById("profile-name")?.value || "").trim();
    const email = (document.getElementById("profile-email")?.value || "").trim();
    const mobile = (document.getElementById("profile-mobile")?.value || "").trim();
    const rollNo = (document.getElementById("profile-rollno")?.value || "").trim();

    if (!name || !email) {
      if (typeof showToast === "function") showToast("Name and email are required.", "error");
      return;
    }

    if (typeof isValidEmail === "function" && !isValidEmail(email)) {
      if (typeof showToast === "function") showToast("Please enter a valid email address.", "error");
      return;
    }

    if (mobile && !/^[0-9+\-\s()]{7,15}$/.test(mobile)) {
      if (typeof showToast === "function") showToast("Please enter a valid mobile number (7-15 digits).", "error");
      return;
    }

    const result = Users.update(current.id, { name, email, mobile, rollNo });
    if (result.ok) {
      if (typeof showToast === "function") showToast("✓ Profile updated successfully.", "success");
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
      if (typeof showToast === "function") showToast("⚠ Password must be at least 6 characters.", "error");
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
      createdAt: new Date().toISOString()
    };

    STORAGE.addComplaint(complaint);
    if (typeof showToast === "function") showToast("✓ Complaint submitted successfully.", "success");

    if (subjectInput) subjectInput.value = "";
    if (messageInput) messageInput.value = "";
    if (categorySelect) categorySelect.value = "Seating Issue";

    this.loadComplaints();
  },

  /** Render list of complaints submitted by the logged-in student */
  loadComplaints() {
    const current = Auth.currentUser();
    if (!current) return;

    const container = document.getElementById("my-complaints-list");
    if (!container) return;

    const allComplaints = STORAGE.getComplaints();
    const myComplaints = allComplaints.filter((c) => c.userId === current.id);

    if (myComplaints.length === 0) {
      container.innerHTML = `
        <div class="table-empty" style="padding:24px 16px; text-align:center;">
          <div class="empty-icon" style="font-size:24px;">📩</div>
          <div class="empty-title" style="font-size:14px; font-weight:700; color:var(--ink); margin-top:6px;">No complaints submitted</div>
          <div class="empty-desc" style="font-size:12px; color:var(--muted); margin-top:2px;">If you face seating or exam issues, use the form above to reach out.</div>
        </div>`;
      return;
    }

    container.innerHTML = `
      <div class="table-scroll">
        <table style="width:100%;">
          <thead>
            <tr>
              <th>Subject & Details</th>
              <th>Category</th>
              <th>Date</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            ${myComplaints.map((c) => {
              let badgeClass = "badge-warning";
              if (c.status === "In Review") badgeClass = "badge-info";
              if (c.status === "Resolved") badgeClass = "badge-success";
              const formattedDate = typeof formatDate === "function" ? formatDate(c.createdAt) : new Date(c.createdAt).toLocaleDateString();

              return `
                <tr>
                  <td>
                    <div style="font-weight:700; color:var(--ink);">${escapeHTML(c.subject)}</div>
                    <div style="font-size:12px; color:var(--muted); margin-top:2px;">${escapeHTML(c.message)}</div>
                  </td>
                  <td><span class="badge" style="background:var(--purple-0); color:var(--purple-4); border:1px solid var(--accent-border);">${escapeHTML(c.category || "Other")}</span></td>
                  <td style="font-size:12px; color:var(--muted);">${formattedDate}</td>
                  <td><span class="badge ${badgeClass}">${escapeHTML(c.status || "Pending")}</span></td>
                </tr>
              `;
            }).join("")}
          </tbody>
        </table>
      </div>
    `;
  },

  /** Event Listeners Setup */
  wireEvents() {
    const personalForm = document.getElementById("profile-personal-form");
    if (personalForm) {
      personalForm.addEventListener("submit", (e) => this.saveProfile(e));
    }

    const pwdForm = document.getElementById("profile-pwd-form");
    if (pwdForm) {
      pwdForm.addEventListener("submit", (e) => this.changePassword(e));
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
