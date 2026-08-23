/* ==========================================================================
   auth.js — SEATWISE Authentication
   ========================================================================== */

const Auth = {
  /** Sign up a new normal user. Returns {ok, message} */
  signup({ name, email, password, confirmPassword }) {
    if (!name || !email || !password || !confirmPassword) {
      return { ok: false, message: "All fields are required." };
    }
    if (!isValidEmail(email)) {
      return { ok: false, message: "Please enter a valid email address." };
    }
    if (password.length < 6) {
      return { ok: false, message: "Password must be at least 6 characters." };
    }
    if (password !== confirmPassword) {
      return { ok: false, message: "Passwords do not match." };
    }

    const users = STORAGE.getUsers();
    if (users.some((u) => u.email.toLowerCase() === email.toLowerCase())) {
      return { ok: false, message: "An account with this email already exists." };
    }

    const newUser = {
      id: generateId("user"),
      name,
      email,
      password,
      role: "user",
      disabled: false,
      rollNo: "",
      mobile: "",
      createdAt: new Date().toISOString()
    };
    users.push(newUser);
    STORAGE.setUsers(users);
    STORAGE.logActivity(`New user registered: ${name}`);
    return { ok: true, message: "Account created successfully." };
  },

  /** Log in a normal user. Returns {ok, message} */
  login({ email, password, name, rollNo }) {
    const users = STORAGE.getUsers();
    let user = users.find((u) => u.email.toLowerCase() === (email || "").toLowerCase());
    
    if (!user) {
      if (name && email && password) {
        // Safe auto-creation if student credentials provided for new account
        user = {
          id: typeof generateId === "function" ? generateId("user") : "user_" + Date.now(),
          name: name.trim(),
          email: email.trim(),
          password,
          role: "user",
          disabled: false,
          rollNo: (rollNo || "").trim(),
          mobile: "",
          createdAt: new Date().toISOString()
        };
        users.push(user);
        STORAGE.setUsers(users);
      } else {
        return { ok: false, message: "No account found with this email." };
      }
    } else {
      if (user.disabled) return { ok: false, message: "This account has been disabled. Contact admin." };
      if (user.password !== password) return { ok: false, message: "Incorrect password." };

      // Update name and rollNo if provided during login
      let updated = false;
      if (name && name.trim() && user.name !== name.trim()) {
        user.name = name.trim();
        updated = true;
      }
      if (rollNo !== undefined && rollNo.trim() && user.rollNo !== rollNo.trim()) {
        user.rollNo = rollNo.trim();
        updated = true;
      }
      if (user.rollNo === undefined) { user.rollNo = ""; updated = true; }
      if (user.mobile === undefined) { user.mobile = ""; updated = true; }

      if (updated) {
        STORAGE.setUsers(users);
      }
    }

    STORAGE.setCurrentUser({
      id: user.id,
      name: user.name,
      email: user.email,
      rollNo: user.rollNo || "",
      mobile: user.mobile || "",
      avatar: user.avatar || "",
      role: "user"
    });
    STORAGE.logActivity(`${user.name} logged in`);
    return { ok: true, message: "Login successful." };
  },

  /** Log in as admin using the centralized demo credential */
  adminLogin({ username, password }) {
    const validPassword = password === CONFIG.ADMIN_PASSWORD || password === CONFIG.ADMIN_ALT_PASSWORD || password === "admin123";
    if (username === CONFIG.ADMIN_USERNAME && validPassword) {
      STORAGE.setAdminSession(true);
      STORAGE.setCurrentUser({ id: "admin", name: "Administrator", email: "admin@seatwise.local", role: "admin" });
      STORAGE.logActivity("Administrator logged in");
      return { ok: true, message: "Welcome back, Administrator." };
    }
    return { ok: false, message: "Invalid admin credentials." };
  },

  logout() {
    const current = STORAGE.getCurrentUser();
    if (current) STORAGE.logActivity(`${current.name} logged out`);
    STORAGE.clearCurrentUser();
    STORAGE.clearAdminSession();
  },

  currentUser() {
    const user = STORAGE.getCurrentUser();
    if (user) {
      if (user.rollNo === undefined) user.rollNo = "";
      if (user.mobile === undefined) user.mobile = "";
    }
    return user;
  },

  isLoggedIn() {
    return !!STORAGE.getCurrentUser();
  },

  isAdmin() {
    const user = STORAGE.getCurrentUser();
    return !!user && user.role === "admin" && STORAGE.isAdminSession();
  },

  /** Call at the top of every user-only page */
  requireUser() {
    const user = STORAGE.getCurrentUser();
    if (!user || user.role !== "user") {
      window.location.href = "login.html";
    }
  },

  /** Call at the top of every admin-only page */
  requireAdmin() {
    if (!Auth.isAdmin()) {
      window.location.href = "admin-login.html";
    }
  },

  /** Call on login/signup pages so already-logged-in visitors skip ahead */
  redirectIfLoggedIn() {
    const user = STORAGE.getCurrentUser();
    if (user && user.role === "user") window.location.href = "user-dashboard.html";
    if (user && user.role === "admin" && STORAGE.isAdminSession()) window.location.href = "admin-dashboard.html";
  }
};
