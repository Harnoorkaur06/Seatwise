/* ==========================================================================
   api.js — SEATWISE Unified REST API Client
   Connects the frontend seamlessly to the Express + MongoDB backend.
   ========================================================================== */

const API = {
  BASE_URL: "/api",
  TOKEN_KEY: "seatwise_auth_token",

  getBaseUrl() {
    if (typeof window !== "undefined" && window.location) {
      const loc = window.location;
      if (loc.protocol === "file:") {
        return "http://localhost:3000/api";
      }
      if (loc.port && loc.port !== "3000" && !loc.hostname.includes("render.com")) {
        return "http://localhost:3000/api";
      }
    }
    return this.BASE_URL;
  },

  getToken() {
    try {
      return localStorage.getItem(this.TOKEN_KEY);
    } catch (e) {
      return null;
    }
  },

  setToken(token) {
    try {
      if (token) localStorage.setItem(this.TOKEN_KEY, token);
      else localStorage.removeItem(this.TOKEN_KEY);
    } catch (e) {
      console.warn("Could not save auth token:", e);
    }
  },

  clearToken() {
    try {
      localStorage.removeItem(this.TOKEN_KEY);
    } catch (e) {}
  },

  async ensureAdminToken() {
    try {
      const res = await fetch(`${this.getBaseUrl()}/auth/admin-login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: (typeof CONFIG !== "undefined" && CONFIG.ADMIN_USERNAME) || "admin",
          password: (typeof CONFIG !== "undefined" && CONFIG.ADMIN_PASSWORD) || "seatwise@admin123",
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (data && data.ok && data.token) {
        this.setToken(data.token);
        return data.token;
      }
    } catch (e) {
      console.warn("Could not auto-acquire admin token:", e);
    }
    return null;
  },

  async request(endpoint, options = {}, isRetry = false) {
    const url = `${this.getBaseUrl()}${endpoint}`;
    const headers = {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    };

    let token = this.getToken();
    if (!token && typeof STORAGE !== "undefined" && STORAGE.isAdminSession && STORAGE.isAdminSession()) {
      token = await this.ensureAdminToken();
    }
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }

    const config = {
      ...options,
      headers,
    };

    if (config.body && typeof config.body === "object") {
      config.body = JSON.stringify(config.body);
    }

    try {
      const res = await fetch(url, config);
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        // If unauthorized and admin session is active, attempt a single token refresh & retry
        if (res.status === 401 && !isRetry && typeof STORAGE !== "undefined" && STORAGE.isAdminSession && STORAGE.isAdminSession()) {
          const freshToken = await this.ensureAdminToken();
          if (freshToken) {
            return this.request(endpoint, options, true);
          }
        }
        return {
          ok: false,
          status: res.status,
          message: data.message || `Request failed with status ${res.status}`,
          data,
        };
      }

      return data;
    } catch (err) {
      console.error(`API request failed [${endpoint}]:`, err);
      return {
        ok: false,
        message: "Unable to connect to the server. Please check your network or server status.",
        error: err.message,
      };
    }
  },

  // ---- Auth Endpoints ----------------------------------------------------
  auth: {
    login: (creds) => API.request("/auth/login", { method: "POST", body: creds }),
    adminLogin: (creds) => API.request("/auth/admin-login", { method: "POST", body: creds }),
    setupPassword: (data) => API.request("/auth/setup-password", { method: "POST", body: data }),
    updatePassword: (data) => API.request("/auth/update-password", { method: "POST", body: data }),
    me: () => API.request("/auth/me", { method: "GET" }),
    logout: () => {
      API.clearToken();
      return API.request("/auth/logout", { method: "POST" });
    },
  },

  // ---- Student Endpoints -------------------------------------------------
  students: {
    all: (q = "") => API.request(`/students${q ? `?q=${encodeURIComponent(q)}` : ""}`, { method: "GET" }),
    getById: (idOrRoll) => API.request(`/students/${encodeURIComponent(idOrRoll)}`, { method: "GET" }),
    create: (data) => API.request("/students", { method: "POST", body: data }),
    update: (idOrRoll, data) => API.request(`/students/${encodeURIComponent(idOrRoll)}`, { method: "PUT", body: data }),
    delete: (idOrRoll) => API.request(`/students/${encodeURIComponent(idOrRoll)}`, { method: "DELETE" }),
    import: (students) => API.request("/students/import", { method: "POST", body: students }),
  },

  // ---- Room Endpoints ----------------------------------------------------
  rooms: {
    all: () => API.request("/rooms", { method: "GET" }),
    create: (data) => API.request("/rooms", { method: "POST", body: data }),
    update: (roomNumber, data) => API.request(`/rooms/${encodeURIComponent(roomNumber)}`, { method: "PUT", body: data }),
    delete: (roomNumber) => API.request(`/rooms/${encodeURIComponent(roomNumber)}`, { method: "DELETE" }),
  },

  // ---- Exam Endpoints ----------------------------------------------------
  exams: {
    all: () => API.request("/exams", { method: "GET" }),
    getActive: () => API.request("/exams/active", { method: "GET" }),
    create: (data) => API.request("/exams", { method: "POST", body: data }),
    update: (id, data) => API.request(`/exams/${encodeURIComponent(id)}`, { method: "PUT", body: data }),
    delete: (id) => API.request(`/exams/${encodeURIComponent(id)}`, { method: "DELETE" }),
    generateSeating: (id) => API.request(`/exams/${encodeURIComponent(id)}/generate-seating`, { method: "POST" }),
  },

  // ---- Seating Endpoints -------------------------------------------------
  seating: {
    all: (examId = "") => API.request(`/seating${examId ? `?examId=${encodeURIComponent(examId)}` : ""}`, { method: "GET" }),
    getPlan: (examId, generation = "") =>
      API.request(`/seating/${encodeURIComponent(examId)}${generation !== "" ? `?generation=${encodeURIComponent(generation)}` : ""}`, { method: "GET" }),
    generate: (examId) => API.request("/seating/generate", { method: "POST", body: { examId } }),
    regenerate: (examId) => API.request("/seating/regenerate", { method: "POST", body: { examId } }),
    override: (data) => API.request("/seating/override", { method: "POST", body: data }),
    putOverride: (planId, data) => API.request(`/seating/${encodeURIComponent(planId)}/override`, { method: "PUT", body: data }),
    forceOverride: (data) => API.request("/seating/force-override", { method: "POST", body: data }),
    getStudentSeats: (rollNo, examId = "") =>
      API.request(`/seating/student/${encodeURIComponent(rollNo)}${examId ? `?examId=${encodeURIComponent(examId)}` : ""}`, { method: "GET" }),
    clearForExam: (examId) => API.request(`/seating/${encodeURIComponent(examId)}`, { method: "DELETE" }),
    clearAll: () => API.request("/seating", { method: "DELETE" }),
  },

  // ---- Complaints Endpoints ----------------------------------------------
  complaints: {
    all: (params = {}) => {
      const q = new URLSearchParams(params).toString();
      return API.request(`/complaints${q ? `?${q}` : ""}`, { method: "GET" });
    },
    submit: (data) => API.request("/complaints", { method: "POST", body: data }),
    update: (id, data) => API.request(`/complaints/${encodeURIComponent(id)}`, { method: "PUT", body: data }),
    getUnreadCount: (params = {}) => {
      const q = new URLSearchParams(params).toString();
      return API.request(`/complaints/unread-count${q ? `?${q}` : ""}`, { method: "GET" });
    },
    clearUnread: (data = {}) => API.request("/complaints/clear-unread", { method: "POST", body: data }),
  },

  // ---- Activity Stream ---------------------------------------------------
  activity: {
    all: (limit = 30) => API.request(`/activity?limit=${limit}`, { method: "GET" }),
    log: (message) => API.request("/activity", { method: "POST", body: { message } }),
    clear: () => API.request("/activity", { method: "DELETE" }),
  },

  // ---- System Endpoints --------------------------------------------------
  system: {
    stats: () => API.request("/system/stats", { method: "GET" }),
    seed: () => API.request("/system/seed", { method: "POST" }),
    purge: () => API.request("/system/purge", { method: "POST" }),
  },

  // ---- Data Migration / Import -------------------------------------------
  migrate: {
    importBrowserData: (data) => API.request("/migrate/import-browser-data", { method: "POST", body: data }),
  },
};
