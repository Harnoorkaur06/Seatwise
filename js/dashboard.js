/* ==========================================================================
   dashboard.js — SEATWISE Interactive Dashboard & Creative Engine
   ========================================================================== */

const Dashboard = {
  adminStats() {
    const students = STORAGE.getStudents();
    const rooms = STORAGE.getRooms();
    const exams = STORAGE.getExams();
    const plan = STORAGE.getSeatingPlan();

    const totalSeats = rooms.reduce((sum, r) => sum + r.capacity, 0);
    const conflicts = plan ? plan.stats.totalConflicts : 0;
    const unassigned = plan ? plan.stats.unassignedCount : students.length;
    const assignedStudents = plan ? (students.length - unassigned) : 0;
    const roomsUsed = plan ? plan.stats.roomsUsed : 0;

    let utilization = 0;
    if (totalSeats > 0 && plan) {
      utilization = Number(((assignedStudents / totalSeats) * 100).toFixed(1));
    }

    const activeStudents = students.filter((s) => !s.disabled).length;
    const disabledStudents = students.filter((s) => s.disabled).length;

    return {
      totalStudents: students.length,
      activeStudents,
      disabledStudents,
      totalRooms: rooms.length,
      totalSeats,
      totalExams: exams.length,
      conflicts,
      unassigned,
      assignedStudents,
      roomsUsed,
      utilization,
      hasPlan: !!plan
    };
  },

  getGreeting() {
    const hour = new Date().getHours();
    if (hour < 12) return "Good morning";
    if (hour < 17) return "Good afternoon";
    return "Good evening";
  },

  /** Count-up number animation */
  animateCount(element, target, duration = 1100, isDecimal = false, suffix = "") {
    if (!element) return;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reducedMotion) {
      element.textContent = (isDecimal ? Number(target).toFixed(1) : target) + suffix;
      return;
    }

    const startVal = 0;
    const targetVal = Number(target) || 0;
    const startTime = performance.now();

    function easeOutCubic(x) {
      return 1 - Math.pow(1 - x, 3);
    }

    function update(now) {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const ease = easeOutCubic(progress);
      const current = startVal + (targetVal - startVal) * ease;

      element.textContent = (isDecimal ? current.toFixed(1) : Math.round(current)) + suffix;

      if (progress < 1) {
        requestAnimationFrame(update);
      } else {
        element.textContent = (isDecimal ? targetVal.toFixed(1) : targetVal) + suffix;
      }
    }

    requestAnimationFrame(update);
  },

  /** 3D Tilt Effect on mousemove */
  init3DTilt() {
    const cards = document.querySelectorAll("[data-tilt]");
    cards.forEach((card) => {
      card.addEventListener("mousemove", (e) => {
        const rect = card.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        const centerX = rect.width / 2;
        const centerY = rect.height / 2;
        const rotateX = ((y - centerY) / centerY) * -7;
        const rotateY = ((x - centerX) / centerX) * 7;

        card.style.transform = `perspective(1000px) rotateX(${rotateX.toFixed(2)}deg) rotateY(${rotateY.toFixed(2)}deg) translateY(-4px)`;
      });

      card.addEventListener("mouseleave", () => {
        card.style.transform = "perspective(1000px) rotateX(0deg) rotateY(0deg) translateY(0)";
      });
    });
  },

  /** Live Exam Countdown Timer */
  startCountdown(targetDateStr, targetTimeStr, containerEl) {
    if (!containerEl) return;
    const target = new Date(`${targetDateStr}T${targetTimeStr || "10:00:00"}`).getTime();

    function tick() {
      const now = new Date().getTime();
      let diff = target - now;

      if (diff <= 0) {
        containerEl.innerHTML = `
          <div class="countdown-box" style="width:100%; text-align:center;">
            <div class="countdown-digit" style="color:#42d392; font-size:18px;">EXAMINATION IN SESSION</div>
          </div>
        `;
        return;
      }

      const days = Math.floor(diff / (1000 * 60 * 60 * 24));
      const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((diff % (1000 * 60)) / 1000);

      containerEl.innerHTML = `
        <div class="countdown-box">
          <div class="countdown-digit">${String(days).padStart(2, "0")}</div>
          <div class="countdown-unit">Days</div>
        </div>
        <div class="countdown-sep">:</div>
        <div class="countdown-box">
          <div class="countdown-digit">${String(hours).padStart(2, "0")}</div>
          <div class="countdown-unit">Hours</div>
        </div>
        <div class="countdown-sep">:</div>
        <div class="countdown-box">
          <div class="countdown-digit">${String(minutes).padStart(2, "0")}</div>
          <div class="countdown-unit">Mins</div>
        </div>
        <div class="countdown-sep">:</div>
        <div class="countdown-box">
          <div class="countdown-digit">${String(seconds).padStart(2, "0")}</div>
          <div class="countdown-unit">Secs</div>
        </div>
      `;
    }

    tick();
    setInterval(tick, 1000);
  },

  /** Renders the interactive classroom seating radar for students */
  renderClassroomRadar(userSeat, containerEl) {
    if (!containerEl) return;
    if (!userSeat) {
      containerEl.innerHTML = `<p class="text-dim text-sm">Seating plan not generated yet or roll number unlinked.</p>`;
      return;
    }

    const subjects = ["CS301", "MA201", "PH201", "EC201"];
    let gridHTML = "";
    let seatIndex = 1;

    for (let r = 1; r <= 5; r++) {
      for (let c = 1; c <= 10; c++) {
        const deskId = `${String.fromCharCode(64 + r)}${c}`;
        const isMySeat = deskId === userSeat.seat;
        const subj = subjects[(r + c) % subjects.length];
        const cssClass = isMySeat ? "my-target-seat" : `subj-${subj.slice(0, 2).toLowerCase()}`;

        gridHTML += `
          <div class="radar-seat ${cssClass}" title="Desk ${deskId}: ${isMySeat ? 'YOU (' + userSeat.subject + ')' : subj + ' (Zero Conflict)'}">
            ${deskId}
          </div>
        `;
        seatIndex++;
      }
    }

    containerEl.innerHTML = `
      <div class="radar-stage-front">▲ FRONT BLACKBOARD / PODIUM (HALL ${escapeHTML(userSeat.roomNumber)}) ▲</div>
      <div class="radar-grid-5x10">${gridHTML}</div>
      <div class="radar-legend-bar">
        <span><strong style="color:var(--purple-4);">★ Your Desk: ${escapeHTML(userSeat.seat)}</strong></span>
        <span>·</span>
        <span style="color:#5b1d70;">■ CS301</span>
        <span style="color:#4e1c6b;">■ MA201</span>
        <span style="color:#3e1b65;">■ PH201</span>
        <span style="color:#2e1759;">■ EC201</span>
      </div>
    `;
  },

  recentActivity(limit = 8) {
    return STORAGE.getActivity().slice(0, limit);
  },

  systemStatus() {
    const plan = STORAGE.getSeatingPlan();
    if (!plan) return { label: "Seating not generated", tone: "warning" };
    if (plan.stats.totalConflicts === 0) return { label: "All systems normal — zero conflicts", tone: "success" };
    return { label: `${plan.stats.totalConflicts} conflict(s) need attention`, tone: "error" };
  },

  seatForUser(user) {
    if (!user) return null;
    const rollNo = user.rollNo;
    if (!rollNo) return null;
    return Seating.findByRollNo(rollNo);
  }
};
