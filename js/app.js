/* ==========================================================================
   app.js
   Shared bootstrap logic run on every page: seeds demo data on first run,
   highlights the active sidebar link, wires up logout buttons, and
   renders the current username in the topbar.
   ========================================================================== */

const App = {
  init() {
    this._seedDemoDataIfNeeded();
    this._highlightActiveNav();
    this._wireLogoutButtons();
    this._renderCurrentUserBadge();
    this._wireModalOverlayClicks();
  },

  _wireModalOverlayClicks() {
    document.querySelectorAll(".modal-overlay").forEach((overlay) => {
      overlay.addEventListener("click", (e) => {
        if (e.target === overlay) overlay.classList.remove("open");
      });
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") closeAllModals();
    });
  },

  _highlightActiveNav() {
    const path = window.location.pathname.split("/").pop() || "index.html";
    const profilePages = ["profile.html", "update-password.html", "mobile-number.html", "complaint.html", "preferences.html"];
    const isProfileGroup = profilePages.includes(path);

    document.querySelectorAll(".sidebar-nav a").forEach((link) => {
      const href = link.getAttribute("href");
      if (href === path || (isProfileGroup && href === "profile.html")) {
        link.classList.add("active");
      }
    });
  },

  _wireLogoutButtons() {
    document.querySelectorAll("[data-logout]").forEach((btn) => {
      btn.addEventListener("click", () => {
        Auth.logout();
        showToast("You have been logged out.", "info");
        setTimeout(() => { window.location.href = "portal.html"; }, 500);
      });
    });
  },

  _renderCurrentUserBadge() {
    const user = Auth.currentUser();
    document.querySelectorAll("[data-current-user-name]").forEach((el) => {
      el.textContent = user ? user.name : "Guest";
    });
    document.querySelectorAll("[data-current-user-initial]").forEach((el) => {
      if (user && user.avatar) {
        el.innerHTML = `<img src="${user.avatar}" style="width:100%; height:100%; object-fit:cover; border-radius:50%;" alt="Profile" />`;
      } else {
        el.textContent = user ? user.name.charAt(0).toUpperCase() : "?";
      }
    });

    // Enhance every user-chip with an interactive dropdown menu & logout action
    document.querySelectorAll(".user-chip").forEach((chip) => {
      if (chip.dataset.dropdownInitialized) return;
      chip.dataset.dropdownInitialized = "true";

      // Ensure wrapped in user-menu-wrap
      let wrap = chip.parentElement;
      if (!wrap.classList.contains("user-menu-wrap")) {
        wrap = document.createElement("div");
        wrap.className = "user-menu-wrap";
        chip.parentNode.insertBefore(wrap, chip);
        wrap.appendChild(chip);
      }

      // Add down arrow icon if not present
      if (!chip.querySelector(".user-chip-arrow")) {
        const arrow = document.createElement("span");
        arrow.className = "user-chip-arrow";
        arrow.textContent = "▼";
        chip.appendChild(arrow);
      }

      // Create dropdown menu
      const roleText = user?.role === "admin" ? "Administrator" : (user?.rollNo ? `Student (${user.rollNo})` : "Student");
      const isStudent = user?.role !== "admin";

      const dropdown = document.createElement("div");
      dropdown.className = "user-dropdown-menu";
      dropdown.innerHTML = `
        <div class="user-dropdown-header">
          <div class="user-dropdown-name">${escapeHTML(user ? user.name : "Guest User")}</div>
          <div class="user-dropdown-email">${escapeHTML(user ? user.email : "")}</div>
          <span class="user-dropdown-badge">${escapeHTML(roleText)}</span>
        </div>
        ${isStudent ? `
          <a class="user-dropdown-item" href="user-dashboard.html"><span>🏠</span> Dashboard</a>
          <a class="user-dropdown-item" href="my-seat.html"><span>🎫</span> My Seat Pass</a>
          <a class="user-dropdown-item" href="profile.html"><span>👤</span> Profile Settings</a>
        ` : `
          <a class="user-dropdown-item" href="admin-dashboard.html"><span>🏠</span> Dashboard</a>
          <a class="user-dropdown-item" href="manage-users.html"><span>👥</span> Manage Users</a>
          <a class="user-dropdown-item" href="settings.html"><span>⚙</span> Platform Settings</a>
        `}
        <div class="user-dropdown-divider"></div>
        <button class="user-dropdown-item user-dropdown-logout" id="dropdown-logout-btn">
          <span>↩</span> Log Out
        </button>
      `;

      wrap.appendChild(dropdown);

      // Toggle dropdown on chip click
      chip.addEventListener("click", (e) => {
        e.stopPropagation();
        const isOpen = dropdown.classList.contains("show");
        // Close any other open dropdowns
        document.querySelectorAll(".user-dropdown-menu.show").forEach((d) => d.classList.remove("show"));
        document.querySelectorAll(".user-chip.is-open").forEach((c) => c.classList.remove("is-open"));

        if (!isOpen) {
          dropdown.classList.add("show");
          chip.classList.add("is-open");
        }
      });

      // Wire logout button in dropdown
      const logoutBtn = dropdown.querySelector("#dropdown-logout-btn");
      if (logoutBtn) {
        logoutBtn.addEventListener("click", (e) => {
          e.stopPropagation();
          Auth.logout();
          showToast("You have been logged out.", "info");
          setTimeout(() => { window.location.href = "portal.html"; }, 400);
        });
      }
    });

    // Close dropdown on outside click or Escape
    if (!window._userDropdownGlobalListenerAttached) {
      window._userDropdownGlobalListenerAttached = true;
      document.addEventListener("click", (e) => {
        if (!e.target.closest(".user-menu-wrap")) {
          document.querySelectorAll(".user-dropdown-menu.show").forEach((d) => d.classList.remove("show"));
          document.querySelectorAll(".user-chip.is-open").forEach((c) => c.classList.remove("is-open"));
        }
      });
      document.addEventListener("keydown", (e) => {
        if (e.key === "Escape") {
          document.querySelectorAll(".user-dropdown-menu.show").forEach((d) => d.classList.remove("show"));
          document.querySelectorAll(".user-chip.is-open").forEach((c) => c.classList.remove("is-open"));
        }
      });
    }
  },

  // -------------------------------------------------------------------------
  // DEMO DATA SEEDING (spec section 24) — runs once, guarded by a flag.
  // -------------------------------------------------------------------------
  _seedDemoDataIfNeeded() {
    if (STORAGE.get(STORAGE_KEYS.SEEDED, false)) return;

    // ---- rooms -------------------------------------------------------
    // STORAGE.setRooms([
    //   { roomNumber: "LH-101", rows: 5, cols: 6, capacity: 30 },
    //   { roomNumber: "LH-102", rows: 5, cols: 6, capacity: 30 },
    //   { roomNumber: "LH-103", rows: 6, cols: 6, capacity: 36 },
    //   { roomNumber: "LH-104", rows: 5, cols: 8, capacity: 40 }
    // ]);

  STORAGE.setRooms([
    { roomNumber: "LH-101", rows: 5, cols: 10, capacity: 50 },
    { roomNumber: "LH-102", rows: 5, cols: 10, capacity: 50 },
    { roomNumber: "LH-103", rows: 5, cols: 10, capacity: 50 },
    { roomNumber: "LH-104", rows: 5, cols: 10, capacity: 50 },
    { roomNumber: "LH-105", rows: 5, cols: 10, capacity: 50 },
    { roomNumber: "LH-106", rows: 5, cols: 10, capacity: 50 },
    { roomNumber: "LH-107", rows: 5, cols: 10, capacity: 50 },
    { roomNumber: "LH-108", rows: 5, cols: 10, capacity: 50 },
    { roomNumber: "LH-109", rows: 5, cols: 10, capacity: 50 },
    { roomNumber: "LH-110", rows: 5, cols: 10, capacity: 50 }
  ]);  

    // ---- students ------------------------------------------------------
    const subjects = ["CS301", "MA201", "PH201", "EC201"];
    const firstNames = ["Rahul", "Aman", "Priya", "Sneha", "Vikram", "Anjali", "Karan", "Neha",
      "Rohit", "Isha", "Aditya", "Pooja", "Manish", "Kavya", "Arjun", "Simran", "Yash", "Riya",
      "Nikhil", "Tanya", "Suresh", "Meera", "Deepak", "Ananya", "Varun", "Shreya", "Gaurav",
      "Divya", "Sameer", "Nisha"];
    const students = [];
    let rollCounter = 101;
    for (let i = 0; i < 500; i++) {
      const name = firstNames[i % firstNames.length] + (i >= firstNames.length ? ` ${Math.floor(i / firstNames.length) + 1}` : "");
      const subject = subjects[i % subjects.length];
      students.push({ rollNo: `23CSE${rollCounter}`, name, subject });
      rollCounter++;
    }
    STORAGE.setStudents(students);

    // ---- one sample exam -------------------------------------------------
    STORAGE.setExams([{
      id: generateId("exam"),
      name: "Mid Semester Examination",
      date: "2026-08-25",
      time: "10:00",
      semester: "5th Semester",
      duration: "2 Hours"
    }]);

    // ---- one demo normal user so evaluators can log in immediately -------
    STORAGE.setUsers([{
      id: generateId("user"),
      name: "Rahul",
      email: "rahul@student.com",
      password: "student123",
      role: "user",
      disabled: false,
      rollNo: "23CSE101",
      createdAt: new Date().toISOString()
    }]);

    STORAGE.logActivity("Demo data seeded (rooms, students, exam, demo user)");
    STORAGE.set(STORAGE_KEYS.SEEDED, true);
  }
};

document.addEventListener("DOMContentLoaded", () => App.init());
