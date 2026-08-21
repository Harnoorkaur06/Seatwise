/* ==========================================================================
   users.js
   Admin-side user management (view / add / edit / delete / disable).
   Deliberately does NOT touch admin credentials (see config.js / auth.js).
   ========================================================================== */

const Users = {
  all() { return STORAGE.getUsers(); },

  search(query) {
    const q = (query || "").trim().toLowerCase();
    const users = STORAGE.getUsers();
    if (!q) return users;
    return users.filter((u) => u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q));
  },

  addByAdmin({ name, email, password, rollNo }) {
    if (!name || !email || !password) return { ok: false, message: "Name, email and password are required." };
    if (!isValidEmail(email)) return { ok: false, message: "Invalid email address." };
    const users = STORAGE.getUsers();
    if (users.some((u) => u.email.toLowerCase() === email.toLowerCase())) {
      return { ok: false, message: "A user with this email already exists." };
    }
    users.push({
      id: generateId("user"), name, email, password, role: "user",
      disabled: false, rollNo: rollNo || "", createdAt: new Date().toISOString()
    });
    STORAGE.setUsers(users);
    STORAGE.logActivity(`Admin added user: ${name}`);
    return { ok: true };
  },

  update(id, updates) {
    const users = STORAGE.getUsers();
    const idx = users.findIndex((u) => u.id === id);
    if (idx === -1) return { ok: false, message: "User not found." };
    users[idx] = { ...users[idx], ...updates };
    STORAGE.setUsers(users);
    // keep current-session copy in sync if this is the logged-in user
    const current = STORAGE.getCurrentUser();
    if (current && current.id === id) {
      STORAGE.setCurrentUser({ ...current, ...users[idx] });
    }
    STORAGE.logActivity(`User updated: ${users[idx].name}`);
    return { ok: true };
  },

  remove(id) {
    const users = STORAGE.getUsers();
    const user = users.find((u) => u.id === id);
    STORAGE.setUsers(users.filter((u) => u.id !== id));
    if (user) STORAGE.logActivity(`User removed: ${user.name}`);
    return { ok: true };
  },

  toggleDisabled(id) {
    const users = STORAGE.getUsers();
    const idx = users.findIndex((u) => u.id === id);
    if (idx === -1) return { ok: false };
    users[idx].disabled = !users[idx].disabled;
    STORAGE.setUsers(users);
    STORAGE.logActivity(`${users[idx].disabled ? "Disabled" : "Enabled"} user: ${users[idx].name}`);
    return { ok: true, disabled: users[idx].disabled };
  }
};
