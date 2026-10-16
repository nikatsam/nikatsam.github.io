(() => {
  const root = document.documentElement;
  root.classList.add("js");

  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // Scroll reveal
  const revealItems = document.querySelectorAll(".reveal");
  if ("IntersectionObserver" in window && !reduceMotion) {
    const io = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-visible");
          io.unobserve(entry.target);
        }
      }
    }, { threshold: 0.12, rootMargin: "0px 0px -40px 0px" });
    revealItems.forEach((el) => io.observe(el));
  } else {
    revealItems.forEach((el) => el.classList.add("is-visible"));
  }

  // Count-up stats (end values are in data-count; text is the fallback)
  const counters = document.querySelectorAll("[data-count]");
  const animateCount = (el) => {
    const end = Number(el.dataset.count);
    const duration = 900;
    const start = performance.now();
    const step = (now) => {
      const t = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - t, 3);
      el.textContent = String(Math.round(end * eased));
      if (t < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  };
  if (!reduceMotion && "IntersectionObserver" in window) {
    const countIo = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          animateCount(entry.target);
          countIo.unobserve(entry.target);
        }
      }
    }, { threshold: 0.5 });
    counters.forEach((el) => {
      el.textContent = "0";
      countIo.observe(el);
    });
  }

  // Project filters
  const buttons = document.querySelectorAll("[data-filter]");
  const cards = document.querySelectorAll("#project-grid .card");
  const empty = document.getElementById("empty-state");

  const applyFilter = (filter) => {
    let visible = 0;
    cards.forEach((card) => {
      const match = filter === "all" || card.dataset.cat === filter;
      card.hidden = !match;
      if (match) visible += 1;
    });
    empty.hidden = visible !== 0;
  };

  buttons.forEach((btn) => {
    btn.addEventListener("click", () => {
      buttons.forEach((b) => {
        const active = b === btn;
        b.classList.toggle("is-active", active);
        b.setAttribute("aria-pressed", String(active));
      });
      applyFilter(btn.dataset.filter);
    });
  });
})();

// Theme switch: follows the system until the visitor picks one, then remembers it.
(() => {
  const root = document.documentElement;
  const toggle = document.getElementById("theme-toggle");
  const systemLight = window.matchMedia("(prefers-color-scheme: light)");
  const KEY = "theme";

  const saved = () => {
    try { return localStorage.getItem(KEY); } catch { return null; }
  };
  const save = (value) => {
    try { localStorage.setItem(KEY, value); } catch { /* private mode: keep it for this visit only */ }
  };
  const current = () => root.dataset.theme || (systemLight.matches ? "light" : "dark");

  const render = () => {
    if (!toggle) return; // app pages have no header button, but still follow the theme and T shortcut
    const isLight = current() === "light";
    toggle.setAttribute("aria-label", isLight ? "Switch to dark theme" : "Switch to light theme");
    toggle.querySelector("span").textContent = isLight ? "Dark" : "Light";
  };

  const stored = saved();
  if (stored === "light" || stored === "dark") root.dataset.theme = stored;
  render();

  const flip = () => {
    const next = current() === "light" ? "dark" : "light";
    root.dataset.theme = next;
    save(next);
    render();
  };
  toggle?.addEventListener("click", flip);

  // T toggles the theme, unless the visitor is typing or uses a modifier key
  document.addEventListener("keydown", (e) => {
    if (e.key.toLowerCase() !== "t" || e.ctrlKey || e.metaKey || e.altKey) return;
    const typing = e.target.closest?.("input, textarea, select, [contenteditable='true']");
    if (typing) return;
    flip();
  });
  systemLight.addEventListener("change", () => { if (!root.dataset.theme) render(); });
})();

// Subtle 3D parallax on the background art, driven by pointer position
(() => {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  if (!window.matchMedia("(pointer: fine)").matches) return;
  const root = document.documentElement;
  let frame = 0;
  window.addEventListener("pointermove", (e) => {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => {
      root.style.setProperty("--px", ((e.clientX / window.innerWidth) * 2 - 1).toFixed(3));
      root.style.setProperty("--py", ((e.clientY / window.innerHeight) * 2 - 1).toFixed(3));
    });
  }, { passive: true });
})();

// Sort projects: A–Z, oldest first, or newest first (age = first commit in the repo)
(() => {
  const grid = document.getElementById("project-grid");
  const buttons = document.querySelectorAll("[data-sort]");
  if (!grid) return;
  const cards = [...grid.querySelectorAll(".card")];
  const sorters = {
    az: (a, b) => a.dataset.name.localeCompare(b.dataset.name),
    oldest: (a, b) => a.dataset.added.localeCompare(b.dataset.added),
    newest: (a, b) => b.dataset.added.localeCompare(a.dataset.added),
  };

  buttons.forEach((btn) => {
    btn.addEventListener("click", () => {
      buttons.forEach((b) => {
        const active = b === btn;
        b.classList.toggle("is-active", active);
        b.setAttribute("aria-pressed", String(active));
      });
      [...cards].sort(sorters[btn.dataset.sort]).forEach((card) => grid.appendChild(card));
    });
  });
})();

// Project detail dialogs: open from a card, close with the button, Escape, or a click outside
(() => {
  document.querySelectorAll("[data-open]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const dlg = document.getElementById(btn.dataset.open);
      if (dlg && typeof dlg.showModal === "function") dlg.showModal();
    });
  });
  document.querySelectorAll("dialog.project-dialog").forEach((dlg) => {
    dlg.addEventListener("click", (e) => { if (e.target === dlg) dlg.close(); });
  });
})();

// Clicking anywhere on a card opens its details. Links and buttons inside the card keep their own action.
(() => {
  document.querySelectorAll("#project-grid .card").forEach((card) => {
    const opener = card.querySelector("[data-open]");
    if (!opener) return;
    card.classList.add("is-clickable");
    card.addEventListener("click", (e) => {
      if (e.target.closest("a, button")) return;
      opener.click();
    });
  });
})();
