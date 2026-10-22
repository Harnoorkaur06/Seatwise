
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
    setupCinematicBackground();
    setupCinematicParallax();
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
    setupConflictResolver();
    setupTechPath();
  }


  function setupCinematicBackground() {
    const canvas = $("#cinematic-bg-canvas");
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let width = (canvas.width = window.innerWidth);
    let height = (canvas.height = window.innerHeight);
    let dpr = Math.min(window.devicePixelRatio || 1, 2);

    const isMobile = window.innerWidth < 768;
    const particleCount = isMobile ? 32 : 80;
    const mouse = { x: width / 2, y: height / 2, targetX: width / 2, targetY: height / 2 };
    let scrollY = window.scrollY;
    let targetScrollY = window.scrollY;
    let scrollVelocity = 0;
    let prevScrollY = window.scrollY;

    const particles = [];
    const colors = [
      "rgba(224, 177, 237, ",
      "rgba(192, 132, 252, ",
      "rgba(168, 85, 247, ",
      "rgba(129, 140, 248, ",
      "rgba(255, 255, 255, "
    ];

    for (let i = 0; i < particleCount; i++) {
      particles.push({
        x: Math.random() * width,
        y: Math.random() * height,
        z: Math.random() * 0.8 + 0.2, 
        size: Math.random() * 2.2 + 0.8,
        colorPrefix: colors[Math.floor(Math.random() * colors.length)],
        alpha: Math.random() * 0.6 + 0.2,
        baseAlpha: Math.random() * 0.5 + 0.2,
        pulseSpeed: Math.random() * 0.02 + 0.005,
        pulseVal: Math.random() * Math.PI * 2,
        vx: (Math.random() - 0.5) * 0.3,
        vy: (Math.random() - 0.5) * 0.3,
      });
    }
    
    const orbs = [
      { xRatio: 0.82, yRatio: 0.22, radius: 460, color: "rgba(168, 85, 247, 0.16)", phase: 0 },
      { xRatio: 0.15, yRatio: 0.55, radius: 430, color: "rgba(99, 102, 241, 0.14)", phase: 2 },
      { xRatio: 0.88, yRatio: 0.78, radius: 480, color: "rgba(217, 70, 239, 0.14)", phase: 4 },
      { xRatio: 0.35, yRatio: 0.92, radius: 410, color: "rgba(147, 51, 234, 0.18)", phase: 1 }
    ];

    const palettes = [
      { stop: 0.0, top: [18, 9, 31], bottom: [33, 14, 52] },
      { stop: 0.25, top: [24, 11, 38], bottom: [20, 9, 34] },
      { stop: 0.55, top: [20, 10, 36], bottom: [16, 7, 28] },
      { stop: 0.8, top: [22, 9, 38], bottom: [18, 8, 30] },
      { stop: 1.0, top: [16, 6, 26], bottom: [36, 12, 58] }
    ];

    function resize() {
      width = window.innerWidth;
      height = window.innerHeight;
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      ctx.scale(dpr, dpr);
    }

    resize();
    window.addEventListener("resize", resize, { passive: true });

    window.addEventListener("pointermove", e => {
      mouse.targetX = e.clientX;
      mouse.targetY = e.clientY;
    }, { passive: true });

    function interpolatePalette(progress) {
      let p1 = palettes[0], p2 = palettes[palettes.length - 1];
      for (let i = 0; i < palettes.length - 1; i++) {
        if (progress >= palettes[i].stop && progress <= palettes[i + 1].stop) {
          p1 = palettes[i];
          p2 = palettes[i + 1];
          break;
        }
      }
      const span = p2.stop - p1.stop || 1;
      const t = (progress - p1.stop) / span;

      const top = [
        Math.round(p1.top[0] + (p2.top[0] - p1.top[0]) * t),
        Math.round(p1.top[1] + (p2.top[1] - p1.top[1]) * t),
        Math.round(p1.top[2] + (p2.top[2] - p1.top[2]) * t)
      ];

      const bottom = [
        Math.round(p1.bottom[0] + (p2.bottom[0] - p1.bottom[0]) * t),
        Math.round(p1.bottom[1] + (p2.bottom[1] - p1.bottom[1]) * t),
        Math.round(p1.bottom[2] + (p2.bottom[2] - p1.bottom[2]) * t)
      ];

      return { top: `rgb(${top[0]},${top[1]},${top[2]})`, bottom: `rgb(${bottom[0]},${bottom[1]},${bottom[2]})` };
    }

    let time = 0;

    function render() {
      if (document.hidden) {
        requestAnimationFrame(render);
        return;
      }

      time += 0.016;
      mouse.x += (mouse.targetX - mouse.x) * 0.08;
      mouse.y += (mouse.targetY - mouse.y) * 0.08;
      targetScrollY = window.scrollY;
      scrollY += (targetScrollY - scrollY) * 0.1;
      scrollVelocity = (targetScrollY - prevScrollY) * 0.35;
      prevScrollY = targetScrollY;
      const docHeight = Math.max(document.documentElement.scrollHeight - window.innerHeight, 1);
      const scrollProgress = Math.min(Math.max(scrollY / docHeight, 0), 1);
      const pal = interpolatePalette(scrollProgress);
      const bgGrad = ctx.createLinearGradient(0, 0, width * 0.5, height);
      bgGrad.addColorStop(0, pal.top);
      bgGrad.addColorStop(1, pal.bottom);
      ctx.fillStyle = bgGrad;
      ctx.fillRect(0, 0, width, height);
      
      orbs.forEach((orb, idx) => {
        const floatX = Math.sin(time * 0.8 + orb.phase) * 55;
        const floatY = Math.cos(time * 0.6 + orb.phase) * 45;
        const parallaxY = (scrollY * 0.12 * (idx % 2 === 0 ? 1 : -0.8));

        const ox = (width * orb.xRatio) + floatX + (mouse.x - width / 2) * 0.035;
        const oy = ((height * orb.yRatio) + floatY - (parallaxY % (height * 1.5)) + height * 1.5) % (height * 1.5) - height * 0.25;

        const orbGrad = ctx.createRadialGradient(ox, oy, 0, ox, oy, orb.radius);
        orbGrad.addColorStop(0, orb.color);
        orbGrad.addColorStop(0.5, orb.color.replace(/[\d\.]+\)$/, '0.04)'));
        orbGrad.addColorStop(1, 'rgba(0,0,0,0)');

        ctx.fillStyle = orbGrad;
        ctx.beginPath();
        ctx.arc(ox, oy, orb.radius, 0, Math.PI * 2);
        ctx.fill();
      });
      
      const velY = Math.max(-12, Math.min(12, scrollVelocity));

      particles.forEach(p => {
        p.pulseVal += p.pulseSpeed;
        p.alpha = p.baseAlpha + Math.sin(p.pulseVal) * 0.25;

        p.x += p.vx * p.z;
        p.y += p.vy * p.z - (velY * p.z * 0.4);
        const dx = p.x - mouse.x;
        const dy = p.y - mouse.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < 120) {
          const force = (120 - dist) / 120 * 1.5;
          p.x += (dx / dist) * force;
          p.y += (dy / dist) * force;
        }
        if (p.x < -10) p.x = width + 10;
        if (p.x > width + 10) p.x = -10;
        if (p.y < -10) p.y = height + 10;
        if (p.y > height + 10) p.y = -10;

        ctx.fillStyle = `${p.colorPrefix}${Math.max(0, Math.min(1, p.alpha))})`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * p.z, 0, Math.PI * 2);
        ctx.fill();
      });

      if (!state.reduceMotion) {
        requestAnimationFrame(render);
      }
    }

    if (!state.reduceMotion) {
      render();
    } else {
      const pal = interpolatePalette(0);
      const bgGrad = ctx.createLinearGradient(0, 0, 0, height);
      bgGrad.addColorStop(0, pal.top);
      bgGrad.addColorStop(1, pal.bottom);
      ctx.fillStyle = bgGrad;
      ctx.fillRect(0, 0, width, height);
    }
  }

  function setupCinematicParallax() {
    if (state.reduceMotion || window.innerWidth < 800) return;

    const heroCopy = $(".hero-copy");
    const heroProduct = $(".hero-product");
    const heroOrbs = $$(".hero-orb");
    const heroStreaks = $$(".hero-streak");
    const floatCards = $$(".floating-card");
    const chips = $$(".story-chip");

    let ticking = false;

    function onScroll() {
      if (!ticking) {
        requestAnimationFrame(() => {
          const scrollY = window.scrollY;
          if (scrollY < 1200) {
            if (heroCopy) heroCopy.style.transform = `translateY(${scrollY * 0.12}px)`;
            if (heroProduct) heroProduct.style.transform = `translateY(${scrollY * 0.06}px)`;
            heroOrbs.forEach((orb, i) => {
              orb.style.transform = `translate3d(0, ${scrollY * (0.15 + i * 0.08)}px, 0)`;
            });
            heroStreaks.forEach((streak, i) => {
              streak.style.transform = `translateX(${scrollY * (0.2 + i * 0.1)}px) rotate(-25deg)`;
            });
            floatCards.forEach((card, i) => {
              card.style.transform = `translateY(${Math.sin(Date.now() * 0.002 + i) * 6 + scrollY * 0.05}px)`;
            });
          }

          chips.forEach((chip, i) => {
            chip.style.transform = `translateY(${Math.sin(Date.now() * 0.002 + i * 2) * 5}px)`;
          });

          ticking = false;
        });
        ticking = true;
      }
    }

    window.addEventListener("scroll", onScroll, { passive: true });
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

  window.setTimeout(finishIntro, 7000);
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
        } else {
          entry.target.classList.remove("visible");
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
    if (state.reduceMotion || window.innerWidth < 850) return;

    $$(".magnetic").forEach(button => {
      let x = 0, y = 0;
      let targetX = 0, targetY = 0;
      let rafId = null;

      function spring() {
        x += (targetX - x) * 0.2;
        y += (targetY - y) * 0.2;
        button.style.transform = `translate(${x}px, ${y}px)`;
        if (Math.abs(targetX - x) > 0.1 || Math.abs(targetY - y) > 0.1) {
          rafId = requestAnimationFrame(spring);
        } else {
          button.style.transform = targetX === 0 ? "" : `translate(${targetX}px, ${targetY}px)`;
          rafId = null;
        }
      }

      button.addEventListener("pointermove", event => {
        const rect = button.getBoundingClientRect();
        targetX = (event.clientX - rect.left - rect.width / 2) * 0.22;
        targetY = (event.clientY - rect.top - rect.height / 2) * 0.22;
        if (!rafId) rafId = requestAnimationFrame(spring);
      });

      button.addEventListener("pointerleave", () => {
        targetX = 0;
        targetY = 0;
        if (!rafId) rafId = requestAnimationFrame(spring);
      });
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

    let cx = window.innerWidth / 2;
    let cy = window.innerHeight / 2;
    let targetX = cx;
    let targetY = cy;
    let isVisible = false;

    window.addEventListener(
      "pointermove",
      event => {
        targetX = event.clientX;
        targetY = event.clientY;
        if (!isVisible) {
          isVisible = true;
          glow.style.opacity = "1";
        }
      },
      { passive: true }
    );

    window.addEventListener(
      "pointerleave",
      () => {
        isVisible = false;
        glow.style.opacity = "0";
      }
    );

    function loop() {
      cx += (targetX - cx) * 0.15;
      cy += (targetY - cy) * 0.15;
      glow.style.left = `${cx}px`;
      glow.style.top = `${cy}px`;
      requestAnimationFrame(loop);
    }
    loop();
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
  function setupConflictResolver() {
    const rows = $$(".resolver-row");
    const map = $(".conflict-map");
    if (!rows.length || !map) return;

    const activate = row => {
      rows.forEach(r => r.classList.remove("active"));
      row.classList.add("active");
      map.dataset.conflictStep = row.dataset.step || "1";
    };

    rows.forEach(row => {
      row.addEventListener("click", () => activate(row));
    });

    if (!state.reduceMotion) {
      let stepIndex = 0;
      window.setInterval(() => {
        stepIndex = (stepIndex + 1) % rows.length;
        activate(rows[stepIndex]);
      }, 3000);
    }
  }

  function setupTechPath() {
    const nodes = $$(".tech-node");
    if (!nodes.length) return;

    nodes.forEach(node => {
      node.addEventListener("click", () => {
        nodes.forEach(n => n.classList.remove("active"));
        node.classList.add("active");
      });
    });
  }

  function setFooterYear() {
    const year = $("#footer-year");

    if (year) {
      year.textContent =
        new Date().getFullYear();
    }
  }

function setupConflictResolver() {
  const rows = $$(".resolver-row");
  const map = $(".conflict-map");
  if (!rows.length || !map) return;

  const activate = row => {
    rows.forEach(r => r.classList.remove("active"));
    row.classList.add("active");
    map.dataset.conflictStep = row.dataset.step || "1";
  };

  rows.forEach(row => {
    row.addEventListener("click", () => activate(row));
  });

  activate(rows[0]); 
  if (!state.reduceMotion) {
    let stepIndex = 0;
    window.setInterval(() => {
      stepIndex = (stepIndex + 1) % rows.length;
      activate(rows[stepIndex]);
    }, 3000);
  }
}

function setupTechPath() {
  const nodes = $$(".tech-node");
  if (!nodes.length) return;

  nodes.forEach(node => {
    node.addEventListener("click", () => {
      nodes.forEach(n => n.classList.remove("active"));
      node.classList.add("active");
    });
  });
}

})();


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

    const CONFLICT_A = 0;   
    const CONFLICT_B = 1;   
    const SWAP_TARGET = 17; 

    let liveData = [];

    function seatLabel(index) {
        const row = String.fromCharCode(65 + Math.floor(index / COLS));
        const col = (index % COLS) + 1;
        return `${row}${col}`;
    }

    function courseClass(course) {
        const map = {
            "CS301": "sw-course-cs",
            "MA201": "sw-course-ma",
            "PH201": "sw-course-ph",
            "EC201": "sw-course-ec"
        };
        return map[course] || "";
    }

    function createGrid() {
        liveData = SEAT_DATA.map(s => ({ ...s }));

        grid.innerHTML = "";

        liveData.forEach((student, i) => {
            const seat = document.createElement("div");
            seat.className = `sw-seat occupied`;
            seat.dataset.index = String(i);
            seat.style.animationDelay = `${i * 25}ms`;

            seat.innerHTML =
                `<span class="sw-seat-label">${seatLabel(i)}</span>` +
                `<span class="sw-seat-code">${student.roll}${student.course}</span>`;

            grid.appendChild(seat);
        });
    }

    createGrid();

    function updateSeatContent(index) {
        const el   = grid.children[index];
        const data = liveData[index];
        if (!el || !data) return;

        el.innerHTML =
            `<span class="sw-seat-label">${seatLabel(index)}</span>` +
            `<span class="sw-seat-code">${data.roll}${data.course}</span>`;
    }
    let running = false;

    generateBtn.addEventListener("click", async () => {
        if (running) return;
        running = true;
        generateBtn.disabled = true;

        await runSimulation();

        generateBtn.disabled = false;
        running = false;
    });


    async function runSimulation() {

        const seats = () => [...grid.children];
        createGrid();

        studentsEl.textContent  = "24";
        conflictsEl.textContent = "00";
        systemStatus.textContent = "ANALYZING";
        gridStatus.textContent   = "PROCESSING";
        demoTitle.innerHTML      = "Analyzing Seating<br />Constraints";
        demoMessage.textContent  = "SEATWISE is scanning all 24 student assignments and checking neighbouring-seat constraints.";

        await wait(1200);

        const seatA = grid.children[CONFLICT_A];
        const seatB = grid.children[CONFLICT_B];

        seatA.classList.add("conflict");
        seatB.classList.add("conflict");

        conflictsEl.textContent  = "01";
        systemStatus.textContent = "CONFLICT DETECTED";
        gridStatus.textContent   = "ATTENTION";
        demoTitle.innerHTML      = "Conflict Detected";
        demoMessage.textContent  =
            `Seats ${seatLabel(CONFLICT_A)} and ${seatLabel(CONFLICT_B)} contain students from the same course (CS301). ` +
            `SEATWISE is searching for a valid alternative.`;

        await wait(2000);


        systemStatus.textContent = "SEARCHING";
        gridStatus.textContent   = "SEARCHING";
        demoTitle.innerHTML      = "Constraint Search";
        demoMessage.textContent  = "Evaluating available positions and checking neighbouring-seat constraints.";

        await wait(1000);

        const seatC = grid.children[SWAP_TARGET];
        seatC.classList.add("sw-candidate");

        systemStatus.textContent = "OPTIMIZING";
        gridStatus.textContent   = "OPTIMIZING";
        demoTitle.innerHTML      = "Evaluating Candidate";
        demoMessage.textContent  =
            `Seat ${seatLabel(SWAP_TARGET)} (${liveData[SWAP_TARGET].roll}${liveData[SWAP_TARGET].course}) ` +
            `is a valid swap candidate — no same-course neighbours.`;

        await wait(1500);

        systemStatus.textContent = "SWITCHING STUDENT ASSIGNMENT";
        gridStatus.textContent   = "SWITCHING";
        demoTitle.innerHTML      = "Switching Student Assignment";
        demoMessage.textContent  =
            `Swapping ${liveData[CONFLICT_B].roll}${liveData[CONFLICT_B].course} ↔ ` +
            `${liveData[SWAP_TARGET].roll}${liveData[SWAP_TARGET].course}.`;

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


        conflictsEl.textContent  = "00";
        systemStatus.textContent = "SYSTEM OPTIMAL";
        gridStatus.textContent   = "RESOLVED";
        demoTitle.innerHTML      = "Conflict Resolved — System Optimal";
        demoMessage.textContent  =
            "The students were automatically reassigned to valid seats. " +
            "Final constraint validation confirms zero conflicts.";

        await wait(3000);


        systemStatus.textContent = "SYSTEM READY";
        gridStatus.textContent   = "OPTIMAL";
        demoTitle.innerHTML      = "Intelligent Conflict<br />Resolution";
        demoMessage.textContent  = "SEATWISE continuously checks seating constraints and resolves conflicts automatically.";

        createGrid();
    }

    function wait(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

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
