
(() => {
  "use strict";

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));

  const state = {
    reduceMotion: window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches ?? false,
    gridTimer: null,
    storyObserver: null
  };

  document.addEventListener("DOMContentLoaded", init);

  function init() {
    setFooterYear();
    setupLoader();
    setupHeader();
    setupMobileMenu();
    setupScrollProgress();
    setupRevealAnimations();
    setupCounters();
    setupHeroGrid();
    setupInteractiveGrid();
    setupStorytelling();
    setupTiltCards();
    setupMagneticButtons();
    setupCursorGlow();
    setupBackToTop();
    setupSmoothAnchors();
    setupCTAGrid();
  }


function setupLoader() {
  const intro = $("#seatwise-intro");
  if (!intro) return;

  const finishIntro = () => {
    intro.classList.add("intro-hidden");

    window.setTimeout(() => {
      intro.style.display = "none";
      intro.setAttribute("aria-hidden", "true");
    }, 800);
  };

  window.setTimeout(finishIntro, 5000);
}


  function setupHeader() {
    const header = $("#site-header");
    if (!header) return;

    const update = () => header.classList.toggle("scrolled", window.scrollY > 30);
    update();
    window.addEventListener("scroll", update, { passive: true });
  }

  function setupMobileMenu() {
    const button = $("#mobile-menu-button");
    const links = $("#nav-links");
    if (!button || !links) return;

    const close = () => {
      links.classList.remove("open");
      button.setAttribute("aria-expanded", "false");
      document.body.classList.remove("no-scroll");
    };

    button.addEventListener("click", () => {
      const open = links.classList.toggle("open");
      button.setAttribute("aria-expanded", String(open));
      document.body.classList.toggle("no-scroll", open);
    });

    $$("a", links).forEach(link => link.addEventListener("click", close));

    window.addEventListener("resize", () => {
      if (window.innerWidth > 800) close();
    });
  }

  function setupScrollProgress() {
    const bar = $("#scroll-progress");
    if (!bar) return;

    const update = () => {
      const doc = document.documentElement;
      const max = doc.scrollHeight - window.innerHeight;
      const percent = max > 0 ? (window.scrollY / max) * 100 : 0;
      bar.style.width = `${Math.min(100, Math.max(0, percent))}%`;
    };

    update();
    window.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
  }

  function setupRevealAnimations() {
    const elements = $$(".reveal");
    if (!elements.length) return;

    if (state.reduceMotion || !("IntersectionObserver" in window)) {
      elements.forEach(el => el.classList.add("visible"));
      return;
    }

    const observer = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add("visible");
          observer.unobserve(entry.target);
        }
      });
    }, {
      threshold: 0.12,
      rootMargin: "0px 0px -50px 0px"
    });

    elements.forEach(el => observer.observe(el));
  }

  function setupCounters() {
    const counters = $$("[data-counter]");
    if (!counters.length) return;

    const animateCounter = el => {
      if (el.dataset.counted === "true") return;

      el.dataset.counted = "true";

      const target = Number(el.dataset.counter || 0);
      const suffix = el.dataset.suffix || "";
      const duration = state.reduceMotion ? 0 : 1200;
      const start = performance.now();

      if (!duration) {
        el.textContent = `${target}${suffix}`;
        return;
      }

      const tick = now => {
        const progress = Math.min(1, (now - start) / duration);
        const eased = 1 - Math.pow(1 - progress, 3);

        el.textContent = `${Math.floor(target * eased)}${suffix}`;

        if (progress < 1) {
          requestAnimationFrame(tick);
        }
      };

      requestAnimationFrame(tick);
    };

    if (state.reduceMotion || !("IntersectionObserver" in window)) {
      counters.forEach(animateCounter);
      return;
    }

    const observer = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          animateCounter(entry.target);
          observer.unobserve(entry.target);
        }
      });
    }, {
      threshold: 0.55
    });

    counters.forEach(el => observer.observe(el));
  }

  function setupHeroGrid() {
    const grid = $("#hero-grid");
    if (!grid) return;

    const colors = [
      "subject-one",
      "subject-two",
      "subject-three",
      "subject-four"
    ];

    const total = 40;

    for (let i = 0; i < total; i += 1) {
      const seat = document.createElement("div");

      seat.className = `mini-seat ${colors[i % colors.length]}`;
      seat.textContent = `S${String(i + 1).padStart(2, "0")}`;

      grid.appendChild(seat);
    }
  }

  function buildSeat(row, col, subject, index) {
    const seat = document.createElement("button");

    seat.type = "button";
    seat.className = "seat-tile";
    seat.dataset.index = String(index);
    seat.dataset.subject = subject;

    seat.setAttribute(
      "aria-label",
      `Seat ${String.fromCharCode(65 + row)}${col + 1}, ${subject}`
    );

    seat.style.background = subjectBackground(subject);

    seat.innerHTML = `
      <small>${String.fromCharCode(65 + row)}${col + 1}</small>
      <strong>${subject}</strong>
    `;

    return seat;
  }

  function subjectBackground(subject) {
    const map = {
      CS301: "linear-gradient(145deg,#c99ad8,#9c43b4)",
      MA201: "linear-gradient(145deg,#bb79cf,#7c2b94)",
      PH201: "linear-gradient(145deg,#a64ac0,#6f237f)",
      EC201: "linear-gradient(145deg,#8d3d9f,#5b1d70)"
    };

    return map[subject] || map.CS301;
  }

  function setupInteractiveGrid() {
    const holder = $("#interactive-grid");
    if (!holder) return;

    const subjects = [
      "CS301",
      "MA201",
      "PH201",
      "EC201"
    ];

    const seats = [];

    for (let row = 0; row < 5; row += 1) {
      for (let col = 0; col < 10; col += 1) {
        const subject =
          subjects[(row * 10 + col) % subjects.length];

        const seat = buildSeat(
          row,
          col,
          subject,
          row * 10 + col
        );

        holder.appendChild(seat);
        seats.push(seat);
      }
    }

    const simulate = () => {
      seats.forEach(seat => {
        seat.classList.remove(
          "conflict-seat",
          "resolved-seat"
        );
      });

      const conflictIndexes = [12, 13, 22];

      conflictIndexes.forEach(index => {
        seats[index]?.classList.add("conflict-seat");
      });

      window.setTimeout(() => {
        seats[22]?.classList.remove("conflict-seat");
        seats[22]?.classList.add("resolved-seat");

        seats[22]?.style.setProperty(
          "background",
          "linear-gradient(145deg,#77bf91,#3d8b5b)"
        );
      }, state.reduceMotion ? 0 : 900);

      window.setTimeout(() => {
        seats[12]?.classList.remove("conflict-seat");
        seats[13]?.classList.remove("conflict-seat");

        seats[12]?.classList.add("resolved-seat");
        seats[13]?.classList.add("resolved-seat");
      }, state.reduceMotion ? 0 : 1500);
    };

    $("#simulate-grid")?.addEventListener(
      "click",
      simulate
    );

    if (!state.reduceMotion) {
      window.setTimeout(simulate, 1000);
    }
  }

  function setupStorytelling() {
    const steps = $$(".story-step");
    const number = $("#story-number");
    const title = $("#story-title");
    const description = $("#story-description");
    const visual = $("#story-visual");

    if (
      !steps.length ||
      !number ||
      !title ||
      !description ||
      !visual
    ) {
      return;
    }

    const activate = step => {
      steps.forEach(s =>
        s.classList.toggle("active", s === step)
      );

      number.textContent =
        String(Number(step.dataset.step) + 1).padStart(2, "0");

      title.textContent =
        step.dataset.title || "";

      description.textContent =
        step.dataset.description || "";

      visual.dataset.step =
        step.dataset.step || "0";
    };

    if (
      state.reduceMotion ||
      !("IntersectionObserver" in window)
    ) {
      steps.forEach(step =>
        step.addEventListener(
          "click",
          () => activate(step)
        )
      );

      return;
    }

    state.storyObserver =
      new IntersectionObserver(entries => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            activate(entry.target);
          }
        });
      }, {
        threshold: 0.65,
        rootMargin: "-10% 0px -10% 0px"
      });

    steps.forEach(step => {
      state.storyObserver.observe(step);

      step.addEventListener(
        "click",
        () => activate(step)
      );
    });
  }

  function setupTiltCards() {
    if (
      state.reduceMotion ||
      window.innerWidth < 850
    ) {
      return;
    }

    $$("[data-tilt]").forEach(card => {
      card.addEventListener(
        "pointermove",
        event => {
          const rect =
            card.getBoundingClientRect();

          const x =
            (event.clientX - rect.left) /
              rect.width -
            0.5;

          const y =
            (event.clientY - rect.top) /
              rect.height -
            0.5;

          const rotateX =
            (-y * 5).toFixed(2);

          const rotateY =
            (x * 7).toFixed(2);

          card.style.transform =
            `perspective(900px) rotateX(${rotateX}deg) rotateY(${rotateY}deg)`;
        }
      );

      card.addEventListener(
        "pointerleave",
        () => {
          card.style.transform = "";
        }
      );
    });
  }

  function setupMagneticButtons() {
    if (
      state.reduceMotion ||
      window.innerWidth < 850
    ) {
      return;
    }

    $$(".magnetic").forEach(button => {
      button.addEventListener(
        "pointermove",
        event => {
          const rect =
            button.getBoundingClientRect();

          const x =
            event.clientX -
            rect.left -
            rect.width / 2;

          const y =
            event.clientY -
            rect.top -
            rect.height / 2;

          button.style.transform =
            `translate(${x * 0.08}px, ${y * 0.08}px)`;
        }
      );

      button.addEventListener(
        "pointerleave",
        () => {
          button.style.transform = "";
        }
      );
    });
  }

  function setupCursorGlow() {
    const glow = $("#cursor-glow");

    if (
      !glow ||
      state.reduceMotion ||
      window.matchMedia?.("(pointer: coarse)")?.matches
    ) {
      return;
    }

    window.addEventListener(
      "pointermove",
      event => {
        glow.style.left =
          `${event.clientX}px`;

        glow.style.top =
          `${event.clientY}px`;

        glow.style.opacity = "1";
      },
      {
        passive: true
      }
    );

    window.addEventListener(
      "pointerleave",
      () => {
        glow.style.opacity = "0";
      }
    );
  }

  function setupBackToTop() {
    const button = $("#back-to-top");
    if (!button) return;

    const update = () =>
      button.classList.toggle(
        "visible",
        window.scrollY > 800
      );

    update();

    window.addEventListener(
      "scroll",
      update,
      {
        passive: true
      }
    );

    button.addEventListener(
      "click",
      () =>
        window.scrollTo({
          top: 0,
          behavior: state.reduceMotion
            ? "auto"
            : "smooth"
        })
    );
  }

  function setupSmoothAnchors() {
    $$('a[href^="#"]').forEach(link => {
      link.addEventListener(
        "click",
        event => {
          const id =
            link.getAttribute("href");

          if (!id || id === "#") return;

          const target =
            document.querySelector(id);

          if (!target) return;

          event.preventDefault();

          target.scrollIntoView({
            behavior: state.reduceMotion
              ? "auto"
              : "smooth",
            block: "start"
          });

          history.replaceState(
            null,
            "",
            id
          );
        }
      );
    });
  }

  function setupCTAGrid() {
    const grid = $("#cta-grid");
    if (!grid) return;

    for (let i = 0; i < 50; i += 1) {
      const span =
        document.createElement("span");

      grid.appendChild(span);
    }
  }

  function setFooterYear() {
    const year = $("#footer-year");

    if (year) {
      year.textContent =
        new Date().getFullYear();
    }
  }

})();


/* =========================================================
   SEATWISE — INTERACTIVE CONFLICT-RESOLUTION DEMO
   ========================================================= */

document.addEventListener("DOMContentLoaded", () => {

    const grid        = document.getElementById("swSeatingGrid");
    const generateBtn = document.getElementById("swGenerateBtn");
    const systemStatus = document.getElementById("swSystemStatus");
    const demoTitle    = document.getElementById("swDemoTitle");
    const demoMessage  = document.getElementById("swDemoMessage");
    const gridStatus   = document.getElementById("swGridStatus");
    const studentsEl   = document.getElementById("swStudents");
    const conflictsEl  = document.getElementById("swConflicts");

    if (!grid || !generateBtn) return;


  /* ==========================================================
    DETERMINISTIC STUDENT DATA  (4 rows × 6 columns = 24)
    ========================================================== */

    const ROWS = 4;
    const COLS = 6;

    const SEAT_DATA = [
        /* Row A */
        { roll: "CSE-07", course: "CS301" },
        { roll: "CSE-08", course: "CS301" },   
        { roll: "ECE-02", course: "EC201" },
        { roll: "ME-03",  course: "MA201" },
        { roll: "PHY-04", course: "PH201" },
        { roll: "CSE-05", course: "CS301" },
        /* Row B */
        { roll: "ME-06",  course: "MA201" },
        { roll: "ECE-09", course: "EC201" },
        { roll: "PHY-10", course: "PH201" },
        { roll: "CSE-11", course: "CS301" },
        { roll: "ME-12",  course: "MA201" },
        { roll: "ECE-13", course: "EC201" },
        /* Row C */
        { roll: "PHY-14", course: "PH201" },
        { roll: "CSE-15", course: "CS301" },
        { roll: "ME-16",  course: "MA201" },
        { roll: "ECE-17", course: "EC201" },
        { roll: "PHY-19", course: "PH201" },
        { roll: "ECE-18", course: "EC201" },  
        /* Row D */
        { roll: "CSE-20", course: "CS301" },
        { roll: "ME-21",  course: "MA201" },
        { roll: "PHY-22", course: "PH201" },
        { roll: "ECE-23", course: "EC201" },
        { roll: "ME-24",  course: "MA201" },
        { roll: "PHY-25", course: "PH201" }
    ];

    const CONFLICT_B = 1;   
    const CONFLICT_A = 0;   
    const SWAP_TARGET = 17; 

    let liveData = [];


    /* ==========================================================
       SEAT LABEL HELPER — e.g. index 0 → "A1", index 7 → "B2"
       ========================================================== */

    function seatLabel(index) {
        const row = String.fromCharCode(65 + Math.floor(index / COLS));
        const col = (index % COLS) + 1;
        return `${row}${col}`;
    }


    /* ==========================================================
       COURSE → CSS CLASS for color-coding
       ========================================================== */

    function courseClass(course) {
        const map = {
            "CS301": "sw-course-cs",
            "MA201": "sw-course-ma",
            "PH201": "sw-course-ph",
            "EC201": "sw-course-ec"
        };
        return map[course] || "";
    }


    /* ==========================================================
       BUILD / REBUILD THE 24-SEAT GRID
       ========================================================== */

    function createGrid() {
        liveData = SEAT_DATA.map(s => ({ ...s }));

        grid.innerHTML = "";

        liveData.forEach((student, i) => {
            const seat = document.createElement("div");
            seat.className = `sw-seat occupied ${courseClass(student.course)}`;
            seat.dataset.index = String(i);
            seat.style.animationDelay = `${i * 25}ms`;

            seat.innerHTML =
                `<small class="sw-seat-label">${seatLabel(i)}</small>` +
                `<span class="sw-seat-roll">${student.roll}</span>` +
                `<span class="sw-seat-course">${student.course}</span>`;

            grid.appendChild(seat);
        });
    }

    createGrid();


    /* ==========================================================
       UPDATE A SINGLE SEAT TILE to reflect liveData[index]
       ========================================================== */

    function updateSeatContent(index) {
        const el   = grid.children[index];
        const data = liveData[index];
        if (!el || !data) return;

        el.classList.remove("sw-course-cs", "sw-course-ma", "sw-course-ph", "sw-course-ec");
        el.classList.add(courseClass(data.course));

        el.innerHTML =
            `<small class="sw-seat-label">${seatLabel(index)}</small>` +
            `<span class="sw-seat-roll">${data.roll}</span>` +
            `<span class="sw-seat-course">${data.course}</span>`;
    }


    /* ==========================================================
       GENERATE BUTTON
       ========================================================== */

    let running = false;

    generateBtn.addEventListener("click", async () => {
        if (running) return;
        running = true;
        generateBtn.disabled = true;

        await runSimulation();

        generateBtn.disabled = false;
        running = false;
    });


    /* ==========================================================
       SIMULATION — deterministic multi-stage state machine
       ========================================================== */

    async function runSimulation() {

        const seats = () => [...grid.children];

        /* -------------------------------------------------------
           STAGE 0 — READY: reset grid to initial state
           ------------------------------------------------------- */
        createGrid();

        studentsEl.textContent  = "24";
        conflictsEl.textContent = "00";
        systemStatus.textContent = "ANALYZING";
        gridStatus.textContent   = "PROCESSING";
        demoTitle.textContent    = "Analyzing Seating Constraints";
        demoMessage.textContent  = "SEATWISE is scanning all 24 student assignments and checking neighbouring-seat constraints.";

        await wait(1200);


        /* -------------------------------------------------------
           STAGE 1 — CONFLICT DETECTED
           ------------------------------------------------------- */
        const seatA = grid.children[CONFLICT_A];
        const seatB = grid.children[CONFLICT_B];

        seatA.classList.add("conflict");
        seatB.classList.add("conflict");

        conflictsEl.textContent  = "01";
        systemStatus.textContent = "CONFLICT DETECTED";
        gridStatus.textContent   = "ATTENTION";
        demoTitle.textContent    = "Conflict Detected";
        demoMessage.textContent  =
            `Seats ${seatLabel(CONFLICT_A)} and ${seatLabel(CONFLICT_B)} contain students from the same course (CS301). ` +
            `SEATWISE is searching for a valid alternative.`;

        await wait(2000);


        /* -------------------------------------------------------
           STAGE 2 — SEARCHING
           ------------------------------------------------------- */
        systemStatus.textContent = "SEARCHING";
        gridStatus.textContent   = "SEARCHING";
        demoTitle.textContent    = "Constraint Search";
        demoMessage.textContent  = "Evaluating available positions and checking neighbouring-seat constraints.";

        await wait(1000);


        /* -------------------------------------------------------
           STAGE 3 — OPTIMIZING
           ------------------------------------------------------- */
        const seatC = grid.children[SWAP_TARGET];
        seatC.classList.add("sw-candidate");

        systemStatus.textContent = "OPTIMIZING";
        gridStatus.textContent   = "OPTIMIZING";
        demoTitle.textContent    = "Evaluating Candidate";
        demoMessage.textContent  =
            `Seat ${seatLabel(SWAP_TARGET)} (${liveData[SWAP_TARGET].roll} / ${liveData[SWAP_TARGET].course}) ` +
            `is a valid swap candidate — no same-course neighbours.`;

        await wait(1500);


        /* -------------------------------------------------------
           STAGE 4 — SWITCHING
           ------------------------------------------------------- */
        systemStatus.textContent = "SWITCHING STUDENT ASSIGNMENT";
        gridStatus.textContent   = "SWITCHING";
        demoTitle.textContent    = "Switching Student Assignment";
        demoMessage.textContent  =
            `Swapping ${liveData[CONFLICT_B].roll} (${liveData[CONFLICT_B].course}) ↔ ` +
            `${liveData[SWAP_TARGET].roll} (${liveData[SWAP_TARGET].course}).`;

        seatA.classList.remove("conflict");
        seatB.classList.remove("conflict");
        seatC.classList.remove("sw-candidate");

        seatB.classList.add("sw-switching");
        seatC.classList.add("sw-switching");

        await wait(500);

        const temp = { ...liveData[CONFLICT_B] };
        liveData[CONFLICT_B] = { ...liveData[SWAP_TARGET] };
        liveData[SWAP_TARGET] = { ...temp };

        updateSeatContent(CONFLICT_B);
        updateSeatContent(SWAP_TARGET);

        seatB.classList.remove("sw-switching");
        seatC.classList.remove("sw-switching");
        seatB.classList.add("resolved");
        seatC.classList.add("resolved");

        await wait(1000);


        /* -------------------------------------------------------
           STAGE 5 — RESOLVED / SYSTEM OPTIMAL
           ------------------------------------------------------- */
        conflictsEl.textContent  = "00";
        systemStatus.textContent = "SYSTEM OPTIMAL";
        gridStatus.textContent   = "RESOLVED";
        demoTitle.textContent    = "Conflict Resolved — System Optimal";
        demoMessage.textContent  =
            "The students were automatically reassigned to valid seats. " +
            "Final constraint validation confirms zero conflicts.";

        await wait(3000);


        /* -------------------------------------------------------
           STAGE 6 — RETURN TO READY
           ------------------------------------------------------- */
        systemStatus.textContent = "SYSTEM READY";
        gridStatus.textContent   = "OPTIMAL";
        demoTitle.textContent    = "Intelligent Conflict Resolution";
        demoMessage.textContent  = "SEATWISE continuously checks seating constraints and resolves conflicts automatically.";

        createGrid();
    }


    /* ==========================================================
       DELAY HELPER
       ========================================================== */

    function wait(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }


    /* ==========================================================
       MOUSE TILT EFFECT  (preserved from original)
       ========================================================== */

    const demo = document.querySelector(".sw-demo-container");

    if (demo) {
        demo.addEventListener("mousemove", event => {
            const rect   = demo.getBoundingClientRect();
            const x      = event.clientX - rect.left;
            const y      = event.clientY - rect.top;
            const rotateY = ((x / rect.width) - 0.5) * 3;
            const rotateX = ((y / rect.height) - 0.5) * -3;

            demo.style.transform =
                `perspective(1200px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) translateY(-3px)`;
        });

        demo.addEventListener("mouseleave", () => {
            demo.style.transform = "";
        });
    }


    /* ==========================================================
       SCROLL REVEAL  (preserved from original)
       ========================================================== */

    const observer = new IntersectionObserver(
        entries => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    entry.target.classList.add("sw-visible");
                }
            });
        },
        { threshold: 0.15 }
    );

    const wowSection = document.querySelector(".sw-wow-section");

    if (wowSection) {
        wowSection.classList.add("sw-hidden");
        observer.observe(wowSection);
    }

});