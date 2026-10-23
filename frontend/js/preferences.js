/* ==========================================================================
   preferences.js — Appearance & Preferences Controller
   ========================================================================== */

const PreferencesManager = {
  init() {
    this.initAppearance();
  },

  /** Wire appearance controls to central SettingsManager */
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
  }
};

document.addEventListener("DOMContentLoaded", () => {
  if (window.Auth && typeof Auth.requireUser === "function") {
    Auth.requireUser();
  }
  PreferencesManager.init();
});
