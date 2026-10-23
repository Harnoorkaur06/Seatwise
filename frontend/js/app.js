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
          <a class="user-dropdown-item" href="my-seat.html"><span>🎫</span> Admit Card</a>
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

    // ---- admin-controlled student roster seeding ------------------------
    const subjects = ["CS301", "MA201", "PH201", "EC201"];
    const firstNames = ["Rahul", "Aman", "Priya", "Sneha", "Vikram", "Anjali", "Karan", "Neha",
      "Rohit", "Isha", "Aditya", "Pooja", "Manish", "Kavya", "Arjun", "Simran", "Yash", "Riya",
      "Nikhil", "Tanya", "Suresh", "Meera", "Deepak", "Ananya", "Varun", "Shreya", "Gaurav",
      "Divya", "Sameer", "Nisha"];
    const students = [];
    let rollCounter = 101;

    // Featured student matching official Chitkara university format
    students.push({
      id: "student_harnoor",
      name: "HARNOOR KAUR",
      email: "harnoor@student.com",
      rollNo: "2410992925",
      fatherName: "Mr. SATINDER SINGH",
      classBranch: "2024-BE-CSE-AI-4 SEM",
      department: "Department of Computer Science & Engineering (Artificial Intelligence & Machine Learning)",
      coursesList: ["24APS4101", "24CAI0201", "24CAI0202", "24CAI0203", "24CAI0204", "24UNI0124", "25MOC0136", "25MOC0137", "25MOC0138", "25MOC0139", "Curriculum"],
      password: "student123",
      passwordSet: true,
      mobile: "9876543210",
      course: "CSE-AI",
      semester: "4th Semester",
      subject: "24CAI0201",
      role: "student",
      disabled: false,
      createdAt: new Date().toISOString()
    });

    for (let i = 0; i < 500; i++) {
      const firstName = firstNames[i % firstNames.length];
      const name = firstName + (i >= firstNames.length ? ` ${Math.floor(i / firstNames.length) + 1}` : "");
      const subject = subjects[i % subjects.length];
      const rollNo = `2410992${rollCounter}`;
      
      // Dedicated emails for key demo students, generated emails for remaining
      let email = "";
      if (i === 0) email = "rahul@student.com";
      else if (i === 1) email = "aman@student.com";
      else if (i === 2) email = "priya@student.com";
      else if (i === 3) email = "disabled@student.com";
      else email = `${firstName.toLowerCase()}${rollCounter}@student.com`;

      const tempStudent = { name, rollNo };
      const fatherName = STORAGE._getFatherName ? STORAGE._getFatherName(tempStudent, i + 1) : "Mr. RAJESH SHARMA";

      students.push({
        id: `student_${rollCounter}`,
        name,
        email,
        rollNo,
        fatherName,
        classBranch: i % 2 === 0 ? "2024-BE-CSE-AI-4 SEM" : "2024-BE-CSE-4 SEM",
        department: "Department of Computer Science & Engineering (Artificial Intelligence & Machine Learning)",
        coursesList: ["24APS4101", "24CAI0201", "24CAI0202", "24CAI0203", "24CAI0204", "24UNI0124", "25MOC0136", "25MOC0137", "25MOC0138", "25MOC0139", "Curriculum"],
        password: "student123",
        passwordSet: true,
        mobile: "9876543210",
        course: i % 2 === 0 ? "CSE-AI" : "CSE",
        semester: "4th Semester",
        subject,
        role: "student",
        disabled: i === 3, // Student #4 (disabled@student.com / 23CSE104) disabled by default for testing
        createdAt: new Date().toISOString()
      });

      rollCounter++;
    }

    // Add a first-time setup demo student without a set password
    students.push({
      id: "student_first_login",
      name: "First Login Test Student",
      email: "newstudent@student.com",
      rollNo: "23CSE999",
      fatherName: "Mr. RAJESH SHARMA",
      classBranch: "2024-BE-CSE-4 SEM",
      department: "Department of Computer Science & Engineering",
      coursesList: ["24APS4101", "24CAI0201", "24CAI0202", "24CAI0203", "Curriculum"],
      password: "",
      passwordSet: false,
      mobile: "9876543210",
      course: "CSE",
      semester: "4th Semester",
      subject: "CS301",
      role: "student",
      disabled: false,
      createdAt: new Date().toISOString()
    });

    STORAGE.setStudents(students);

    // ---- demo exams ------------------------------------------------------
    STORAGE.setExams([
      {
        id: "exam_cndc",
        name: "CNDC",
        date: "2026-08-26",
        time: "15:03",
        semester: "5th Semester",
        duration: "2 Hours"
      },
      {
        id: "exam_pa",
        name: "PA",
        date: "2026-08-29",
        time: "10:08",
        semester: "5th Semester",
        duration: "2 Hours"
      },
      {
        id: "exam_dbms",
        name: "DBMS",
        date: "2026-09-02",
        time: "10:00",
        semester: "5th Semester",
        duration: "2 Hours"
      }
    ]);

    STORAGE.logActivity("Demo data seeded (rooms, 500 admin-created students, 3 exams)");
    STORAGE.set(STORAGE_KEYS.SEEDED, true);
  }
};

document.addEventListener("DOMContentLoaded", () => App.init());
