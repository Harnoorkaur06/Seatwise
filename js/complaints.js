/* ==========================================================================
   complaints.js — Admin Complaints Management Controller
   ========================================================================== */

const ComplaintsManager = {
  init() {
    this.renderComplaints();
    this.wireSearchAndFilter();
  },

  renderComplaints() {
    const container = document.getElementById("admin-complaints-mount");
    if (!container) return;

    const complaints = STORAGE.getComplaints();
    const filterCategory = document.getElementById("filter-category")?.value || "ALL";
    const filterStatus = document.getElementById("filter-status")?.value || "ALL";
    const searchQuery = (document.getElementById("search-complaints")?.value || "").trim().toLowerCase();

    let filtered = complaints.filter((c) => {
      if (filterCategory !== "ALL" && c.category !== filterCategory) return false;
      if (filterStatus !== "ALL" && c.status !== filterStatus) return false;
      if (searchQuery) {
        const nameMatch = (c.userName || "").toLowerCase().includes(searchQuery);
        const emailMatch = (c.userEmail || "").toLowerCase().includes(searchQuery);
        const subjectMatch = (c.subject || "").toLowerCase().includes(searchQuery);
        const msgMatch = (c.message || "").toLowerCase().includes(searchQuery);
        if (!nameMatch && !emailMatch && !subjectMatch && !msgMatch) return false;
      }
      return true;
    });

    // Update stats counters if elements exist
    const totalEl = document.getElementById("stat-total-complaints");
    const pendingEl = document.getElementById("stat-pending-complaints");
    const reviewEl = document.getElementById("stat-review-complaints");
    const resolvedEl = document.getElementById("stat-resolved-complaints");

    if (totalEl) totalEl.textContent = complaints.length;
    if (pendingEl) pendingEl.textContent = complaints.filter((c) => c.status === "Pending").length;
    if (reviewEl) reviewEl.textContent = complaints.filter((c) => c.status === "In Review").length;
    if (resolvedEl) resolvedEl.textContent = complaints.filter((c) => c.status === "Resolved").length;

    if (filtered.length === 0) {
      container.innerHTML = `
        <div class="table-empty" style="padding:32px 16px; text-align:center;">
          <div class="empty-icon" style="font-size:32px;">📩</div>
          <div class="empty-title" style="font-size:15px; font-weight:700; color:var(--ink); margin-top:8px;">No complaints found</div>
          <div class="empty-desc" style="font-size:12.5px; color:var(--muted); margin-top:4px;">No student complaints match your selected filters.</div>
        </div>`;
      return;
    }

    container.innerHTML = `
      <div class="table-scroll">
        <table style="width:100%;">
          <thead>
            <tr>
              <th>Student</th>
              <th>Category</th>
              <th>Subject & Details</th>
              <th>Date</th>
              <th>Status</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            ${filtered.map((c) => {
              let badgeClass = "badge-warning";
              if (c.status === "In Review") badgeClass = "badge-info";
              if (c.status === "Resolved") badgeClass = "badge-success";
              const formattedDate = typeof formatDate === "function" ? formatDate(c.createdAt) : new Date(c.createdAt).toLocaleDateString();

              return `
                <tr>
                  <td>
                    <div style="font-weight:700; color:var(--ink);">${escapeHTML(c.userName || "Student")}</div>
                    <div style="font-size:12px; color:var(--muted); margin-top:2px;">${escapeHTML(c.userEmail || "")}</div>
                  </td>
                  <td>
                    <span class="badge" style="background:var(--purple-0); color:var(--purple-4); border:1px solid var(--accent-border);">
                      ${escapeHTML(c.category || "Other")}
                    </span>
                  </td>
                  <td style="max-width:280px;">
                    <div style="font-weight:700; color:var(--ink);">${escapeHTML(c.subject)}</div>
                    <div style="font-size:12px; color:var(--muted); margin-top:3px; line-height:1.4;">${escapeHTML(c.message)}</div>
                  </td>
                  <td style="font-size:12px; color:var(--muted); white-space:nowrap;">${formattedDate}</td>
                  <td>
                    <span class="badge ${badgeClass}">${escapeHTML(c.status || "Pending")}</span>
                  </td>
                  <td style="white-space:nowrap;">
                    <select class="form-select form-select-sm" style="font-size:12px; padding:4px 8px; width:auto;" onchange="ComplaintsManager.updateStatus('${c.id}', this.value)">
                      <option value="Pending" ${c.status === "Pending" ? "selected" : ""}>Pending</option>
                      <option value="In Review" ${c.status === "In Review" ? "selected" : ""}>In Review</option>
                      <option value="Resolved" ${c.status === "Resolved" ? "selected" : ""}>Resolved</option>
                    </select>
                  </td>
                </tr>
              `;
            }).join("")}
          </tbody>
        </table>
      </div>
    `;
  },

  updateStatus(complaintId, newStatus) {
    const ok = STORAGE.updateComplaintStatus(complaintId, newStatus);
    if (ok) {
      if (typeof showToast === "function") {
        showToast(`Complaint status updated to "${newStatus}".`, "success");
      }
      this.renderComplaints();
    } else {
      if (typeof showToast === "function") {
        showToast("Failed to update status.", "error");
      }
    }
  },

  wireSearchAndFilter() {
    const searchInput = document.getElementById("search-complaints");
    const categorySelect = document.getElementById("filter-category");
    const statusSelect = document.getElementById("filter-status");

    if (searchInput) searchInput.addEventListener("input", () => this.renderComplaints());
    if (categorySelect) categorySelect.addEventListener("change", () => this.renderComplaints());
    if (statusSelect) statusSelect.addEventListener("change", () => this.renderComplaints());
  }
};

document.addEventListener("DOMContentLoaded", () => {
  if (window.Auth && typeof Auth.requireAdmin === "function") {
    Auth.requireAdmin();
  }
  ComplaintsManager.init();
});
