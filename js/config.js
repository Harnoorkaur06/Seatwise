/* ==========================================================================
   config.js — Centralized configuration for SEATWISE
   ========================================================================== */

const CONFIG = Object.freeze({
  ADMIN_USERNAME: "admin",
  ADMIN_PASSWORD: "seatwise@admin123",
  ADMIN_ALT_PASSWORD: "examseat@admin123",

  APP_NAME: "SEATWISE",
  APP_TAGLINE: "Smart Examination Seating & Conflict Resolution System",

  // Subject color palette (curated to harmonize with lavender/purple tones)
  SUBJECT_COLORS: [
    "#9a3bb9", "#7a229d", "#bb74d1", "#2563eb",
    "#059669", "#d97706", "#dc2626", "#0891b2"
  ],

  // Adjacency directions considered "adjacent" for the seating constraint
  ADJACENCY: ["left", "right", "front", "back"]
});

Object.freeze(CONFIG.SUBJECT_COLORS);
Object.freeze(CONFIG.ADJACENCY);
