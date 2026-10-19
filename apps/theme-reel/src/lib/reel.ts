// Progressive enhancement for the home page. Without this script the carousel is a
// scroll-snap strip, every showcase card is visible and screenshots stay duotone.

const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
const mod = (n: number, m: number) => ((n % m) + m) % m;

function initCarousel(): void {
  const root = document.querySelector<HTMLElement>("[data-reel]");
  const stage = root?.querySelector<HTMLElement>("[data-reel-stage]");
  const ring = stage?.querySelector<HTMLElement>("[data-reel-ring]");
  const controls = root?.querySelector<HTMLElement>("[data-reel-controls]");
  const slides = ring ? [...ring.querySelectorAll<HTMLElement>("[data-reel-slide]")] : [];
  // A ring needs at least three cards to read as one.
  if (!root || !stage || !ring || !controls || slides.length < 3) return;

  const caption = controls.querySelector<HTMLElement>("[data-reel-caption]")!;
  const indexEl = controls.querySelector<HTMLElement>("[data-reel-index]")!;
  const titleEl = controls.querySelector<HTMLElement>("[data-reel-title]")!;
  const summaryEl = controls.querySelector<HTMLElement>("[data-reel-summary]")!;
  const tagsEl = controls.querySelector<HTMLElement>("[data-reel-tags]")!;
  const linkEl = controls.querySelector<HTMLAnchorElement>("[data-reel-link]")!;
  const pauseBtn = controls.querySelector<HTMLButtonElement>("[data-reel-pause]")!;
  const prevNum = controls.querySelector<HTMLElement>("[data-reel-prev-num]")!;
  const nextNum = controls.querySelector<HTMLElement>("[data-reel-next-num]")!;
  const links = slides.map((slide) => slide.querySelector("a")!);

  const count = slides.length;
  const step = 360 / count;
  const speed = 7; // degrees per second while auto-rotating
  let radius = 0;
  let angle = 0;
  let target: number | null = null;
  let current = -1;
  let paused = false;
  let hovering = false;
  let focused = false;
  let drag: { x: number; angle: number; moved: boolean; id: number } | null = null;
  let suppressClick = false;
  let last = performance.now();

  stage.classList.add("is-3d");
  controls.hidden = false;

  const rotating = () => !paused && !hovering && !focused && !drag && target === null && !reducedMotion.matches;

  const layout = () => {
    const width = slides[0]!.offsetWidth;
    radius = Math.round(width / 2 / Math.tan(Math.PI / count)) + Math.max(24, width * 0.12);
    slides.forEach((slide, i) => {
      slide.style.transform = `rotateY(${i * step}deg) translateZ(${radius}px)`;
    });
    render();
  };

  const select = (index: number) => {
    current = index;
    const slide = slides[index]!;
    slides.forEach((s, i) => s.classList.toggle("is-front", i === index));
    links.forEach((link, i) => (link.tabIndex = i === index ? 0 : -1));
    indexEl.textContent = String(index + 1).padStart(2, "0");
    titleEl.textContent = slide.dataset.title ?? "";
    summaryEl.textContent = slide.dataset.summary ?? "";
    tagsEl.textContent = slide.dataset.tags ?? "";
    linkEl.href = slide.dataset.href ?? "#";
    linkEl.title = slide.dataset.title ?? "";
    prevNum.textContent = String(mod(index - 1, count) + 1).padStart(2, "0");
    nextNum.textContent = String(mod(index + 1, count) + 1).padStart(2, "0");
  };

  const render = () => {
    ring.style.transform = `translateZ(${-radius}px) rotateY(${-angle}deg)`;
    slides.forEach((slide, i) => {
      const facing = Math.cos(((i * step - angle) * Math.PI) / 180);
      slide.style.setProperty("--front", Math.max(0, facing).toFixed(3));
      slide.style.pointerEvents = facing > 0.2 ? "" : "none";
    });
    pauseBtn.style.setProperty("--progress", mod(angle / step + 0.5, 1).toFixed(3));
    const front = mod(Math.round(angle / step), count);
    if (front !== current) select(front);
  };

  const goTo = (index: number) => {
    const from = target ?? angle;
    const delta = mod(index * step - from + 180, 360) - 180;
    target = from + delta;
    if (reducedMotion.matches) {
      angle = target;
      target = null;
      render();
    }
  };

  const tick = (now: number) => {
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    if (target !== null) {
      angle += (target - angle) * Math.min(1, dt * 7);
      if (Math.abs(target - angle) < 0.05) {
        angle = target;
        target = null;
      }
      render();
    } else if (rotating()) {
      angle += speed * dt;
      render();
    }
    requestAnimationFrame(tick);
  };

  // Screen readers hear caption changes only when the user drives the carousel.
  const syncLive = () => caption.setAttribute("aria-live", !paused && !hovering && !focused && !reducedMotion.matches ? "off" : "polite");

  pauseBtn.addEventListener("click", () => {
    paused = !paused;
    pauseBtn.setAttribute("aria-pressed", String(paused));
    pauseBtn.setAttribute("aria-label", (paused ? root.dataset.playLabel : root.dataset.pauseLabel) ?? "");
    syncLive();
  });
  // Steps count from where the ring is heading, so quick repeated presses add up.
  const heading = () => (target !== null ? Math.round(target / step) : current);
  controls.querySelector("[data-reel-prev]")!.addEventListener("click", () => goTo(heading() - 1));
  controls.querySelector("[data-reel-next]")!.addEventListener("click", () => goTo(heading() + 1));

  stage.addEventListener("pointerenter", () => { hovering = true; syncLive(); });
  stage.addEventListener("pointerleave", () => { hovering = false; syncLive(); });
  root.addEventListener("focusin", () => { focused = true; syncLive(); });
  root.addEventListener("focusout", (event) => {
    if (!root.contains(event.relatedTarget as Node | null)) { focused = false; syncLive(); }
  });

  // Arrow keys work anywhere inside the carousel; focus follows only when it was on a card.
  root.addEventListener("keydown", (event) => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    const next = heading() + (event.key === "ArrowRight" ? 1 : -1);
    goTo(next);
    if (stage.contains(document.activeElement)) links[mod(next, count)]!.focus({ preventScroll: true });
  });

  // Cards are links: stop the browser's native link/image drag, which would cancel the pointer drag.
  links.forEach((link) => (link.draggable = false));
  stage.addEventListener("dragstart", (event) => event.preventDefault());

  stage.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) return;
    drag = { x: event.clientX, angle: target ?? angle, moved: false, id: event.pointerId };
    target = null;
  });
  stage.addEventListener("pointermove", (event) => {
    if (!drag || event.pointerId !== drag.id) return;
    const dx = event.clientX - drag.x;
    if (!drag.moved && Math.abs(dx) > 6) {
      drag.moved = true;
      stage.classList.add("is-dragging");
      // Capture only once it is a real drag, so a plain click still reaches the link.
      stage.setPointerCapture(event.pointerId);
    }
    if (drag.moved) {
      angle = drag.angle - (dx / slides[0]!.offsetWidth) * step;
      render();
    }
  });
  const endDrag = (event: PointerEvent) => {
    if (!drag || event.pointerId !== drag.id) return;
    if (drag.moved) {
      suppressClick = true;
      setTimeout(() => (suppressClick = false), 0);
      goTo(Math.round(angle / step));
    }
    drag = null;
    stage.classList.remove("is-dragging");
  };
  stage.addEventListener("pointerup", endDrag);
  stage.addEventListener("pointercancel", endDrag);

  // Clicking a side card brings it to the front; only the front card navigates.
  stage.addEventListener("click", (event) => {
    if (suppressClick) {
      event.preventDefault();
      return;
    }
    const slide = (event.target as Element).closest<HTMLElement>("[data-reel-slide]");
    const index = slide ? slides.indexOf(slide) : -1;
    if (index >= 0 && index !== current) {
      event.preventDefault();
      goTo(index);
    }
  }, true);

  new ResizeObserver(layout).observe(stage);
  layout();
  syncLive();
  requestAnimationFrame(tick);
}

function initFilter(): void {
  const bar = document.querySelector<HTMLElement>("[data-filter]");
  const status = document.querySelector<HTMLElement>("[data-filter-status]");
  const cards = [...document.querySelectorAll<HTMLElement>("[data-card]")];
  if (!bar || !status || !cards.length) return;
  const buttons = [...bar.querySelectorAll<HTMLButtonElement>("button[data-tag]")];
  const cardTags = new Map(cards.map((card) => [card, JSON.parse(card.dataset.tags ?? "[]") as string[]]));
  bar.hidden = false;

  const apply = (tag: string) => {
    let shown = 0;
    for (const card of cards) {
      const visible = !tag || cardTags.get(card)!.includes(tag);
      card.hidden = !visible;
      if (visible) shown++;
    }
    buttons.forEach((button) => button.setAttribute("aria-pressed", String(button.dataset.tag === tag)));
    status.textContent = tag ? (bar.dataset.showing ?? "").replace("{shown}", String(shown)).replace("{total}", String(cards.length)) : "";
  };

  bar.addEventListener("click", (event) => {
    const button = (event.target as Element).closest<HTMLButtonElement>("button[data-tag]");
    if (!button || button.getAttribute("aria-pressed") === "true") return;
    const tag = button.dataset.tag ?? "";
    if ("startViewTransition" in document && !reducedMotion.matches) document.startViewTransition(() => apply(tag));
    else apply(tag);
  });
}

function initSpotlight(): void {
  if (!window.matchMedia("(hover: hover)").matches) return;
  for (const shot of document.querySelectorAll<HTMLElement>("[data-spot]")) {
    shot.addEventListener("pointermove", (event) => {
      const box = shot.getBoundingClientRect();
      shot.style.setProperty("--x", `${event.clientX - box.left}px`);
      shot.style.setProperty("--y", `${event.clientY - box.top}px`);
    });
  }
}

initCarousel();
initFilter();
initSpotlight();
