/* ==========================================================================
   settingsManager.js — Centralized Settings Controller for SEATWISE
   --------------------------------------------------------------------------
   Single source of truth for every persisted UI preference on the platform.
   Every page (admin + user) includes this file BEFORE any other script that
   touches the DOM, so theme + sidebar state apply instantly on load with no
   flash of unstyled content.

   LocalStorage keys used by this module:
     - "seatwise_theme"    -> "light" | "dark"
     - "seatwise_sidebar"  -> "expanded" | "collapsed"
     - "seatwise_platform_settings" -> JSON blob for all other, unrelated
        preferences (accent color, algorithm config, notification toggles,
        security toggles). These are independent features from the
        cross-page inherited Theme + Sidebar settings and are kept in their
        own namespace so they don't collide with the two dedicated keys
        above.

   No other file should read/write these keys directly — always go through
   SettingsManager.
   ========================================================================== */

const SETTINGS_THEME_KEY = "seatwise_theme";
const SETTINGS_SIDEBAR_KEY = "seatwise_sidebar";
const SETTINGS_PREFS_KEY = "seatwise_platform_settings";

const COLOR_PALETTES = {
  purple: {
    "--purple-0": "#f7effb",
    "--purple-1": "#d8a5e8",
    "--purple-2": "#bb74d1",
    "--purple-3": "#9a3bb9",
    "--purple-4": "#7a229d",
    "--purple-5": "#5b1d70",
    "--accent-color": "#9a3bb9",
    "--accent-hover": "#7a229d",
    "--accent-soft": "rgba(154, 59, 185, 0.12)",
    "--accent-border": "rgba(154, 59, 185, 0.25)"
  },
  indigo: {
    "--purple-0": "#eef2ff",
    "--purple-1": "#a5b4fc",
    "--purple-2": "#818cf8",
    "--purple-3": "#6366f1",
    "--purple-4": "#4f46e5",
    "--purple-5": "#3730a3",
    "--accent-color": "#6366f1",
    "--accent-hover": "#4f46e5",
    "--accent-soft": "rgba(99, 102, 241, 0.12)",
    "--accent-border": "rgba(99, 102, 241, 0.25)"
  },
  emerald: {
    "--purple-0": "#ecfdf5",
    "--purple-1": "#6ee7b7",
    "--purple-2": "#34d399",
    "--purple-3": "#10b981",
    "--purple-4": "#059669",
    "--purple-5": "#065f46",
    "--accent-color": "#10b981",
    "--accent-hover": "#059669",
    "--accent-soft": "rgba(16, 185, 129, 0.12)",
    "--accent-border": "rgba(16, 185, 129, 0.25)"
  },
  orange: {
    "--purple-0": "#fff7ed",
    "--purple-1": "#fdba74",
    "--purple-2": "#fb923c",
    "--purple-3": "#f97316",
    "--purple-4": "#ea580c",
    "--purple-5": "#c2410c",
    "--accent-color": "#f97316",
    "--accent-hover": "#ea580c",
    "--accent-soft": "rgba(249, 115, 22, 0.12)",
    "--accent-border": "rgba(249, 115, 22, 0.25)"
  },
  rose: {
    "--purple-0": "#fdf2f8",
    "--purple-1": "#f9a8d4",
    "--purple-2": "#f472b6",
    "--purple-3": "#ec4899",
    "--purple-4": "#db2777",
    "--purple-5": "#be185d",
    "--accent-color": "#ec4899",
    "--accent-hover": "#db2777",
    "--accent-soft": "rgba(236, 72, 153, 0.12)",
    "--accent-border": "rgba(236, 72, 153, 0.25)"
  }
};

const SettingsManager = {
  defaults: {
    theme: "light",
    sidebarCollapsed: false,
    accentColor: "purple",
    autoLogout: true,
    confirmPwd: false,
    restrictAccess: true,
    algoLr: true,
    algoFb: true,
    algoOverflow: true,
    algoShuffle: true,
    algoRetries: "10",
    defRows: "5",
    defCols: "10",
    notifGenComplete: true,
    notifConflicts: true,
    notifImport: true,
    notifDanger: true,
    notifNewUser: false
  },

  // ─── Validation ────────────────────────────────────────────────────────
  // Guards against corrupted / hand-edited LocalStorage values so a bad
  // value can never crash the UI or apply an invalid theme/sidebar state.
  validateSettings(settings) {
    const s = { ...this.defaults, ...settings };

    s.theme = s.theme === "dark" ? "dark" : "light";
    s.sidebarCollapsed = s.sidebarCollapsed === true;
    s.accentColor = COLOR_PALETTES[s.accentColor] ? s.accentColor : "purple";

    s.autoLogout = !!s.autoLogout;
    s.confirmPwd = !!s.confirmPwd;
    s.restrictAccess = !!s.restrictAccess;
    s.algoLr = !!s.algoLr;
    s.algoFb = !!s.algoFb;
    s.algoOverflow = !!s.algoOverflow;
    s.algoShuffle = !!s.algoShuffle;
    s.notifGenComplete = !!s.notifGenComplete;
    s.notifConflicts = !!s.notifConflicts;
    s.notifImport = !!s.notifImport;
    s.notifDanger = !!s.notifDanger;
    s.notifNewUser = !!s.notifNewUser;

    let retries = parseInt(s.algoRetries, 10);
    if (isNaN(retries) || retries < 1) retries = 1;
    if (retries > 20) retries = 20;
    s.algoRetries = String(retries);

    let rows = parseInt(s.defRows, 10);
    if (isNaN(rows) || rows < 1) rows = 1;
    if (rows > 20) rows = 20;
    s.defRows = String(rows);

    let cols = parseInt(s.defCols, 10);
    if (isNaN(cols) || cols < 1) cols = 1;
    if (cols > 30) cols = 30;
    s.defCols = String(cols);

    return s;
  },

  // ─── Load / Save ───────────────────────────────────────────────────────
  loadSettings() {
    let prefs = {};
    try {
      const raw = localStorage.getItem(SETTINGS_PREFS_KEY);
      if (raw) prefs = JSON.parse(raw);
    } catch (e) {
      console.error("SettingsManager: error loading preferences from LocalStorage:", e);
      prefs = {};
    }

    let theme = this.defaults.theme;
    try {
      const storedTheme = localStorage.getItem(SETTINGS_THEME_KEY);
      if (storedTheme === "dark" || storedTheme === "light") {
        theme = storedTheme;
      } else if (prefs.theme === "dark" || prefs.theme === "light") {
        // One-time migration from the legacy combined blob (pre-dedicated-key).
        theme = prefs.theme;
      }
    } catch (e) {
      console.error("SettingsManager: error loading theme from LocalStorage:", e);
    }

    let sidebarCollapsed = this.defaults.sidebarCollapsed;
    try {
      sidebarCollapsed = localStorage.getItem(SETTINGS_SIDEBAR_KEY) === "collapsed";
    } catch (e) {
      console.error("SettingsManager: error loading sidebar state from LocalStorage:", e);
    }

    return this.validateSettings({ ...this.defaults, ...prefs, theme, sidebarCollapsed });
  },

  saveSettings(newSettings) {
    const merged = this.validateSettings({ ...this.loadSettings(), ...newSettings });

    try {
      localStorage.setItem(SETTINGS_THEME_KEY, merged.theme);
      localStorage.setItem(SETTINGS_SIDEBAR_KEY, merged.sidebarCollapsed ? "collapsed" : "expanded");

      // Everything else lives in the shared preferences blob.
      const { theme, sidebarCollapsed, ...prefs } = merged;
      localStorage.setItem(SETTINGS_PREFS_KEY, JSON.stringify(prefs));
    } catch (e) {
      console.error("SettingsManager: error saving settings to LocalStorage:", e);
      return null;
    }
    return merged;
  },

  // ─── Theme ─────────────────────────────────────────────────────────────
  applyTheme(theme) {
    const isDark = theme === "dark";
    if (isDark) {
      document.documentElement.setAttribute("data-theme", "dark");
      document.body.classList.add("dark-theme");
    } else {
      document.documentElement.removeAttribute("data-theme");
      document.body.classList.remove("dark-theme");
    }

    const lightBtn = document.getElementById("btn-theme-light");
    const darkBtn = document.getElementById("btn-theme-dark");
    if (lightBtn && darkBtn) {
      if (isDark) {
        darkBtn.className = "btn btn-primary btn-sm";
        lightBtn.className = "btn btn-outline btn-sm";
      } else {
        lightBtn.className = "btn btn-primary btn-sm";
        darkBtn.className = "btn btn-outline btn-sm";
      }
    }
  },

  setTheme(theme) {
    const saved = this.saveSettings({ theme });
    this.applyTheme(saved.theme);
    if (typeof showToast === "function") {
      showToast(`Theme updated to ${saved.theme === "dark" ? "Dark Mode" : "Light Mode"}.`, "success");
    }
  },

  // ─── Sidebar ───────────────────────────────────────────────────────────
  applySidebar(collapsed) {
    if (collapsed) {
      document.documentElement.setAttribute("data-sidebar", "collapsed");
      document.body.classList.add("sidebar-collapsed");
    } else {
      document.documentElement.removeAttribute("data-sidebar");
      document.body.classList.remove("sidebar-collapsed");
    }

    const toggle = document.getElementById("toggle-compact-sidebar");
    if (toggle) toggle.checked = !!collapsed;
  },

  setSidebarCollapsed(collapsed) {
    const saved = this.saveSettings({ sidebarCollapsed: !!collapsed });
    this.applySidebar(saved.sidebarCollapsed);
    if (typeof showToast === "function") {
      showToast(saved.sidebarCollapsed ? "Sidebar collapsed." : "Sidebar expanded.", "info");
    }
  },

  toggleSidebar() {
    const s = this.loadSettings();
    this.setSidebarCollapsed(!s.sidebarCollapsed);
  },

  // ─── Accent color ──────────────────────────────────────────────────────
  applyAccentColor(colorName) {
    const palette = COLOR_PALETTES[colorName] || COLOR_PALETTES.purple;
    const root = document.documentElement;
    Object.keys(palette).forEach((prop) => {
      root.style.setProperty(prop, palette[prop]);
    });

    document.querySelectorAll(".color-swatch").forEach((swatch) => {
      swatch.classList.toggle("selected", swatch.dataset.color === colorName);
    });
  },

  setAccentColor(colorName) {
    const saved = this.saveSettings({ accentColor: colorName });
    this.applyAccentColor(saved.accentColor);
    if (typeof showToast === "function") {
      const formatted = saved.accentColor.charAt(0).toUpperCase() + saved.accentColor.slice(1);
      showToast(`Accent color set to "${formatted}".`, "success");
    }
  },

  // ─── Generic toggle helper (used by security / algorithm / notification
  //     checkboxes on the settings page) ─────────────────────────────────
  updateToggle(key, elementId) {
    const el = document.getElementById(elementId);
    if (!el) return;
    this.saveSettings({ [key]: el.checked });
    if (typeof showToast === "function") {
      showToast("Setting updated.", "info");
    }
  },

  // ─── Settings-page UI wiring (only relevant elements are touched; safe
  //     to call on pages that don't contain the settings form) ───────────
  initializeUI() {
    const s = this.loadSettings();

    const toggles = [
      { id: "toggle-autologout", key: "autoLogout" },
      { id: "toggle-confirm-pwd", key: "confirmPwd" },
      { id: "toggle-restrict-access", key: "restrictAccess" },
      { id: "algo-lr", key: "algoLr" },
      { id: "algo-fb", key: "algoFb" },
      { id: "algo-overflow", key: "algoOverflow" },
      { id: "algo-shuffle", key: "algoShuffle" },
      { id: "notif-gen-complete", key: "notifGenComplete" },
      { id: "notif-conflicts", key: "notifConflicts" },
      { id: "notif-import", key: "notifImport" },
      { id: "notif-danger", key: "notifDanger" },
      { id: "notif-new-user", key: "notifNewUser" }
    ];

    toggles.forEach(({ id, key }) => {
      const el = document.getElementById(id);
      if (el) {
        el.checked = !!s[key];
        el.onchange = () => this.updateToggle(key, id);
      }
    });

    const compactToggle = document.getElementById("toggle-compact-sidebar");
    if (compactToggle) {
      compactToggle.checked = !!s.sidebarCollapsed;
      compactToggle.onchange = (e) => this.setSidebarCollapsed(e.target.checked);
    }

    const retriesInput = document.getElementById("algo-retries");
    const retriesVal = document.getElementById("algo-retries-val");
    if (retriesInput) {
      retriesInput.value = s.algoRetries;
      if (retriesVal) retriesVal.textContent = retriesInput.value;
      retriesInput.oninput = (e) => {
        if (retriesVal) retriesVal.textContent = e.target.value;
        this.saveSettings({ algoRetries: e.target.value });
      };
    }

    const defRowsInput = document.getElementById("def-rows");
    if (defRowsInput) {
      defRowsInput.value = s.defRows;
      defRowsInput.onchange = (e) => this.saveSettings({ defRows: e.target.value });
    }

    const defColsInput = document.getElementById("def-cols");
    if (defColsInput) {
      defColsInput.value = s.defCols;
      defColsInput.onchange = (e) => this.saveSettings({ defCols: e.target.value });
    }

    this.applyAccentColor(s.accentColor);
  },

  // ─── Boot sequence ─────────────────────────────────────────────────────
  // Applies theme + sidebar immediately (called synchronously, before the
  // DOM finishes parsing) so there is no flash of the wrong theme/layout
  // on navigation between pages.
  restoreSettings() {
    const s = this.loadSettings();
    this.applyTheme(s.theme);
    this.applySidebar(s.sidebarCollapsed);
    return s;
  },

  init() {
    this.restoreSettings();
  }
};

// Immediate global application to prevent theme/sidebar flash.
(function () {
  SettingsManager.init();
})();

document.addEventListener("DOMContentLoaded", () => {
  SettingsManager.restoreSettings();
  SettingsManager.initializeUI();
});
