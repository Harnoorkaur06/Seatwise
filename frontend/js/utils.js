/* ==========================================================================
   utils.js
   Shared helper functions used across every page: toasts, id generation,
   date formatting, subject colors, DOM helpers, CSV export.
   ========================================================================== */

/** Generate a reasonably unique id (timestamp + random) */
function generateId(prefix = "id") {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

/** Format an ISO date string like "2026-08-25" -> "25 August 2026" */
function formatDate(dateStr) {
  if (!dateStr) return "-";
  const d = new Date(dateStr);
  if (isNaN(d)) return dateStr;
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric" });
}

/** Format a 24h time string "10:00" -> "10:00 AM" */
function formatTime(timeStr) {
  if (!timeStr) return "-";
  const [h, m] = timeStr.split(":").map(Number);
  if (isNaN(h)) return timeStr;
  const period = h >= 12 ? "PM" : "AM";
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${String(hour12).padStart(2, "0")}:${String(m).padStart(2, "0")} ${period}`;
}

/** Deterministically map a subject code to a color from the palette */
function subjectColor(subject) {
  const colors = CONFIG.SUBJECT_COLORS;
  let hash = 0;
  for (let i = 0; i < subject.length; i++) {
    hash = (hash * 31 + subject.charCodeAt(i)) % colors.length;
  }
  return colors[Math.abs(hash) % colors.length];
}

/** Convert a 0-based seat index into a spreadsheet-style label: A1, B4 ... */
function seatLabel(row, col) {
  const rowLetter = String.fromCharCode(65 + row);
  return `${rowLetter}${col + 1}`;
}

// ---------------------------------------------------------------------------
// TOAST NOTIFICATIONS
// ---------------------------------------------------------------------------
function ensureToastContainer() {
  let container = document.getElementById("toast-container");
  if (!container) {
    container = document.createElement("div");
    container.id = "toast-container";
    container.className = "toast-container";
    document.body.appendChild(container);
  }
  return container;
}

function showToast(message, type = "info", duration = 3200) {
  const container = ensureToastContainer();
  const toast = document.createElement("div");
  toast.className = `toast toast-${type}`;
  const icons = { success: "✓", error: "✕", warning: "⚠", info: "ℹ" };
  toast.innerHTML = `<span class="toast-icon">${icons[type] || icons.info}</span><span class="toast-message"></span>`;
  toast.querySelector(".toast-message").textContent = message;
  container.appendChild(toast);
  requestAnimationFrame(() => toast.classList.add("show"));
  setTimeout(() => {
    toast.classList.remove("show");
    setTimeout(() => toast.remove(), 300);
  }, duration);
}

// ---------------------------------------------------------------------------
// MODAL HELPER
// ---------------------------------------------------------------------------
function openModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) modal.classList.add("open");
}
function closeModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) modal.classList.remove("open");
}
function closeAllModals() {
  document.querySelectorAll(".modal-overlay.open").forEach((m) => m.classList.remove("open"));
}

// ---------------------------------------------------------------------------
// CONFIRM DIALOG (simple, reuses a shared modal in each page's HTML)
// ---------------------------------------------------------------------------
function confirmAction(message, onConfirm) {
  const modal = document.getElementById("confirm-modal");
  if (!modal) {
    if (window.confirm(message)) onConfirm();
    return;
  }
  document.getElementById("confirm-message").textContent = message;
  const yesBtn = document.getElementById("confirm-yes");
  const newYesBtn = yesBtn.cloneNode(true);
  yesBtn.parentNode.replaceChild(newYesBtn, yesBtn);
  newYesBtn.addEventListener("click", () => {
    closeModal("confirm-modal");
    onConfirm();
  });
  openModal("confirm-modal");
}

// ---------------------------------------------------------------------------
// CSV EXPORT
// ---------------------------------------------------------------------------
function downloadCSV(filename, rows) {
  const csvContent = rows.map((r) => r.map(csvEscape).join(",")).join("\n");
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
function csvEscape(value) {
  const str = String(value ?? "");
  if (/[",\n]/.test(str)) return `"${str.replace(/"/g, '""')}"`;
  return str;
}

// ---------------------------------------------------------------------------
// SIMPLE VALIDATORS
// ---------------------------------------------------------------------------
function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

/** Debounce helper for search inputs */
function debounce(fn, delay = 250) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}

/** Escape text for safe HTML injection */
function escapeHTML(str) {
  const div = document.createElement("div");
  div.textContent = str ?? "";
  return div.innerHTML;
}
