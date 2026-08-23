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

    // Get complaints sorted newest first
    const rawComplaints = STORAGE.getComplaints();
    const complaints = [...rawComplaints].sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));

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

    // Update stats counters
    const totalEl = document.getElementById("stat-total-complaints");
    const pendingEl = document.getElementById("stat-pending-complaints");
    const resolvedEl = document.getElementById("stat-resolved-complaints");

    const pendingCount = complaints.filter((c) => c.status === "Pending" || !c.status).length;
    const resolvedCount = complaints.filter((c) => c.status === "Resolved").length;

    if (totalEl) totalEl.textContent = complaints.length;
    if (pendingEl) pendingEl.textContent = pendingCount;
    if (resolvedEl) resolvedEl.textContent = resolvedCount;

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
              <th>Student Details</th>
              <th>Category</th>
              <th>Complaint & Admin Reply</th>
              <th>Date</th>
              <th>Status</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            ${filtered.map((c) => {
              const isResolved = c.status === "Resolved";
              const badgeClass = isResolved ? "badge-success" : "badge-warning";
              const formattedDate = typeof formatDate === "function" ? formatDate(c.createdAt) : new Date(c.createdAt).toLocaleDateString();

              return `
                <tr>
                  <td style="vertical-align:top;">
                    <div style="font-weight:700; color:var(--ink);">${escapeHTML(c.userName || "Student")}</div>
                    <div style="font-size:12px; color:var(--muted); margin-top:2px;">${escapeHTML(c.userEmail || "")}</div>
                  </td>
                  <td style="vertical-align:top;">
                    <span class="badge" style="background:var(--purple-0); color:var(--purple-4); border:1px solid var(--accent-border);">
                      ${escapeHTML(c.category || "Other")}
                    </span>
                  </td>
                  <td style="max-width:320px; vertical-align:top;">
                    <div style="font-weight:700; color:var(--ink);">${escapeHTML(c.subject)}</div>
                    <div style="font-size:12px; color:var(--muted); margin-top:3px; line-height:1.4;">${escapeHTML(c.message)}</div>
                    
                    <!-- Admin Reply Box -->
                    <div style="margin-top:10px; padding:10px; background:rgba(154,59,185,0.06); border:1px solid var(--accent-border); border-radius:var(--radius-sm);">
                      <div style="font-size:11px; font-weight:800; color:var(--purple-4); text-transform:uppercase;">Admin Response / Reply Note:</div>
                      <input type="text" class="form-input form-input-sm mt-4" id="reply-input-${c.id}" value="${escapeHTML(c.adminReply || "")}" placeholder="Type reply message to student..." style="font-size:12px; background:#fff;" />
                      <button class="btn btn-primary btn-sm mt-4" onclick="ComplaintsManager.saveReply('${c.id}')" style="font-size:11px; padding:4px 12px;">Send Reply & Mark Resolved</button>
                    </div>
                  </td>
                  <td style="font-size:12px; color:var(--muted); white-space:nowrap; vertical-align:top;">${formattedDate}</td>
                  <td style="vertical-align:top;">
                    <span class="badge ${badgeClass}">${escapeHTML(c.status || "Pending")}</span>
                  </td>
                  <td style="white-space:nowrap; vertical-align:top;">
                    <select class="form-select form-select-sm" id="status-select-${c.id}" style="font-size:12px; padding:4px 8px; width:auto;" onchange="ComplaintsManager.updateStatus('${c.id}', this.value)">
                      <option value="Pending" ${!isResolved ? "selected" : ""}>Pending</option>
                      <option value="Resolved" ${isResolved ? "selected" : ""}>Resolved</option>
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
    const replyInput = document.getElementById(`reply-input-${complaintId}`);
    const replyText = replyInput ? replyInput.value.trim() : undefined;
    const ok = STORAGE.updateComplaintStatus(complaintId, newStatus, replyText);
    if (ok) {
      if (typeof showToast === "function") {
        showToast(`✓ Complaint status updated to "${newStatus}".`, "success");
      }
      this.renderComplaints();
    } else {
      if (typeof showToast === "function") {
        showToast("Failed to update status.", "error");
      }
    }
  },

  saveReply(complaintId) {
    const replyInput = document.getElementById(`reply-input-${complaintId}`);
    const replyText = replyInput ? replyInput.value.trim() : "";

    if (!replyText) {
      if (typeof showToast === "function") showToast("Please type a reply message before sending.", "error");
      return;
    }

    // Sending reply automatically marks the complaint as Resolved
    const ok = STORAGE.updateComplaintStatus(complaintId, "Resolved", replyText);
    if (ok) {
      if (typeof showToast === "function") {
        showToast("✓ Reply sent to student & complaint marked as Resolved!", "success");
      }
      this.renderComplaints();
    } else {
      if (typeof showToast === "function") {
        showToast("Failed to send reply.", "error");
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
