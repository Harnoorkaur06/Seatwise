/* ==========================================================================
   complaint.js — Contact Administrator / Complaint Controller (Student Side)
   ========================================================================== */

const ComplaintManager = {
  async init() {
    await this.loadComplaints();
    this.wireEvents();
  },

  /** Submit a student complaint to admin */
  async submitComplaint(e) {
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

    // Submit via API (identity comes from JWT on the server side)
    const result = await STORAGE.addComplaintAsync({ category, subject, message });

    if (!result.ok) {
      if (typeof showToast === "function") showToast(result.message || "Failed to submit complaint.", "error");
      return;
    }

    if (typeof showToast === "function") showToast("✓ Complaint submitted successfully.", "success");

    if (subjectInput) subjectInput.value = "";
    if (messageInput) messageInput.value = "";
    if (categorySelect) categorySelect.value = "Seating Issue";

    await this.loadComplaints();
  },

  /** Render list of complaints submitted by the logged-in student */
  async loadComplaints() {
    const current = Auth.currentUser();
    if (!current) return;

    const container = document.getElementById("my-complaints-list");
    if (!container) return;

    // Try to fetch from API, fall back to local cache
    let myComplaints = [];
    if (typeof API !== "undefined" && API.complaints) {
      try {
        const res = await API.complaints.all();
        if (res.ok && Array.isArray(res.complaints)) {
          myComplaints = res.complaints;
          // Update local cache with fresh data
          STORAGE._cache.complaints = res.complaints;
        } else {
          myComplaints = _filterMyComplaints(STORAGE.getComplaints(), current);
        }
      } catch (_) {
        myComplaints = _filterMyComplaints(STORAGE.getComplaints(), current);
      }
    } else {
      myComplaints = _filterMyComplaints(STORAGE.getComplaints(), current);
    }

    // Sort newest first
    myComplaints = myComplaints.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));

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
              <th>Subject &amp; Message</th>
              <th>Category</th>
              <th>Date</th>
              <th>Status &amp; Admin Response</th>
            </tr>
          </thead>
          <tbody>
            ${myComplaints.map((c) => {
              const isResolved = c.status === "Resolved";
              const badgeClass = isResolved ? "badge-success" : "badge-warning";
              const formattedDate = typeof formatDate === "function" ? formatDate(c.createdAt) : new Date(c.createdAt).toLocaleDateString();

              return `
                <tr>
                  <td style="vertical-align:top; max-width:300px;">
                    <div style="font-weight:700; color:var(--ink);">${escapeHTML(c.subject)}</div>
                    <div style="font-size:12px; color:var(--muted); margin-top:3px; line-height:1.4;">${escapeHTML(c.message)}</div>
                  </td>
                  <td style="vertical-align:top;"><span class="badge" style="background:var(--purple-0); color:var(--purple-4); border:1px solid var(--accent-border);">${escapeHTML(c.category || "Other")}</span></td>
                  <td style="font-size:12px; color:var(--muted); vertical-align:top; white-space:nowrap;">${formattedDate}</td>
                  <td style="vertical-align:top;">
                    <span class="badge ${badgeClass}">${escapeHTML(c.status || "Pending")}</span>
                    ${c.adminReply ? `
                      <div style="margin-top:8px; padding:10px; background:rgba(16,185,129,0.08); border:1px solid rgba(16,185,129,0.25); border-radius:var(--radius-sm);">
                        <div style="font-size:11px; font-weight:800; color:#10b981; text-transform:uppercase;">Admin Response:</div>
                        <div style="font-size:12px; color:var(--ink); margin-top:2px; line-height:1.4;">${escapeHTML(c.adminReply)}</div>
                      </div>
                    ` : `
                      <div style="font-size:11.5px; color:var(--muted); margin-top:6px; font-style:italic;">Awaiting admin reply...</div>
                    `}
                  </td>
                </tr>
              `;
            }).join("")}
          </tbody>
        </table>
      </div>
    `;
  },

  wireEvents() {
    const form = document.getElementById("profile-complaint-form");
    if (form) {
      form.addEventListener("submit", (e) => this.submitComplaint(e));
    }
  }
};

/** Helper: filter complaints belonging to current user from local cache */
function _filterMyComplaints(allComplaints, current) {
  return allComplaints.filter(
    (c) =>
      c.userId === current.id ||
      (c.userEmail && c.userEmail.toLowerCase() === current.email.toLowerCase()) ||
      (c.rollNo && c.rollNo === current.rollNo)
  );
}

document.addEventListener("DOMContentLoaded", () => {
  if (window.Auth && typeof Auth.requireUser === "function") {
    Auth.requireUser();
  }
  ComplaintManager.init();
});
