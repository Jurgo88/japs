import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { SplitText } from "gsap/SplitText";

/**
 * Motion for the studio theme, driven by data attributes:
 *   data-fit       one-line heading scaled to the full width (also without motion)
 *   data-chars     letters rise from the centre on load
 *   data-words     words rise out of their lines on load
 *   data-intro     fades in on load (hidden until then, see Base.astro)
 *   data-marquee   endless tag strip that speeds up and reverses with the scroll
 *   data-reveal    fades up when scrolled into view
 *   data-zoom      image settles from a slight zoom while scrolling
 *   data-rows      project rows; on pointer devices a screenshot follows the cursor
 */
gsap.registerPlugin(ScrollTrigger, SplitText);

const root = document.documentElement;

/** Sizes a nowrap heading so its text spans exactly the available width. */
function fit(el: HTMLElement): void {
  el.style.fontSize = "100px";
  const range = document.createRange();
  range.selectNodeContents(el);
  const width = range.getBoundingClientRect().width;
  if (width > 0) el.style.fontSize = `${(100 * el.clientWidth) / width}px`;
}

function fitAll(): void {
  for (const el of document.querySelectorAll<HTMLElement>("[data-fit]")) fit(el);
}

function intro(): void {
  for (const el of document.querySelectorAll<HTMLElement>("[data-chars]")) {
    const split = SplitText.create(el, { type: "chars" });
    gsap.from(split.chars, {
      yPercent: 100,
      autoAlpha: 0,
      duration: 0.9,
      ease: "power4.out",
      stagger: { each: 0.03, from: "center" },
      onComplete: () => split.revert(),
    });
  }
  for (const el of document.querySelectorAll<HTMLElement>("[data-words]")) {
    const split = SplitText.create(el, { type: "lines,words", mask: "lines", linesClass: "split-mask" });
    gsap.from(split.words, { yPercent: 110, duration: 1, ease: "expo.out", stagger: 0.06, onComplete: () => split.revert() });
  }
  gsap.from("[data-intro]:not([data-chars]):not([data-words])", {
    autoAlpha: 0,
    y: 16,
    duration: 0.8,
    delay: 0.45,
    stagger: 0.08,
    ease: "power3.out",
  });
}

function scrolling(): void {
  const track = document.querySelector<HTMLElement>("[data-marquee]");
  if (track) {
    const loop = gsap.to(track, { xPercent: -50, duration: 30, ease: "none", repeat: -1 });
    ScrollTrigger.create({
      onUpdate: (self) => {
        const boost = Math.min(Math.abs(self.getVelocity()) / 400, 4);
        gsap.to(loop, { timeScale: self.direction * (1 + boost), duration: 0.3, overwrite: true });
        gsap.to(loop, { timeScale: self.direction, duration: 1.2, delay: 0.3 });
      },
    });
  }
  for (const el of document.querySelectorAll<HTMLElement>("[data-reveal]")) {
    gsap.from(el, { autoAlpha: 0, y: 40, duration: 0.9, ease: "power3.out", scrollTrigger: { trigger: el, start: "top 92%" } });
  }
  for (const img of document.querySelectorAll<HTMLElement>("[data-zoom]")) {
    gsap.fromTo(img, { scale: 1.12 }, { scale: 1, ease: "none", scrollTrigger: { trigger: img, start: "top bottom", end: "bottom 60%", scrub: true } });
  }
}

/** Screenshot that trails the cursor over the project rows and tilts with its speed. */
function cursorPreview(): () => void {
  const preview = document.querySelector<HTMLElement>("[data-preview]");
  const rows = document.querySelector<HTMLElement>("[data-rows]");
  if (!preview || !rows) return () => {};

  gsap.set(preview, { xPercent: -50, yPercent: -50, scale: 0, autoAlpha: 1 });
  const xTo = gsap.quickTo(preview, "x", { duration: 0.55, ease: "power3" });
  const yTo = gsap.quickTo(preview, "y", { duration: 0.55, ease: "power3" });
  const rTo = gsap.quickTo(preview, "rotation", { duration: 0.6, ease: "power3" });
  let lastX = 0;
  const move = (e: PointerEvent) => {
    xTo(e.clientX);
    yTo(e.clientY);
    rTo(gsap.utils.clamp(-12, 12, (e.clientX - lastX) * 0.6));
    lastX = e.clientX;
  };

  const show = (link: HTMLAnchorElement) => {
    const layer = document.createElement("div");
    if (link.dataset.shot) {
      const img = document.createElement("img");
      img.src = link.dataset.shot;
      img.alt = "";
      layer.append(img);
    } else {
      layer.className = "ph";
      layer.textContent = link.dataset.initial ?? "";
    }
    preview.append(layer);
    gsap.fromTo(
      layer,
      { clipPath: "inset(100% 0 0 0)" },
      {
        clipPath: "inset(0% 0 0 0)",
        duration: 0.5,
        ease: "power3.out",
        onComplete: () => {
          while (preview.children.length > 1) preview.firstElementChild?.remove();
        },
      },
    );
  };
  const over = (e: PointerEvent) => {
    const link = (e.target as Element).closest<HTMLAnchorElement>("a[data-initial]");
    if (link && !link.contains(e.relatedTarget as Node | null)) show(link);
  };
  const enter = () => gsap.to(preview, { scale: 1, duration: 0.5, ease: "back.out(1.6)" });
  const leave = () => gsap.to(preview, { scale: 0, duration: 0.35, ease: "power3.in" });

  window.addEventListener("pointermove", move);
  rows.addEventListener("pointerover", over);
  rows.addEventListener("pointerenter", enter);
  rows.addEventListener("pointerleave", leave);
  return () => {
    window.removeEventListener("pointermove", move);
    rows.removeEventListener("pointerover", over);
    rows.removeEventListener("pointerenter", enter);
    rows.removeEventListener("pointerleave", leave);
    gsap.set(preview, { autoAlpha: 0 });
  };
}

document.fonts.ready.then(() => {
  fitAll();
  addEventListener("resize", fitAll);
  if (!root.classList.contains("motion")) return;
  const mm = gsap.matchMedia();
  mm.add("(prefers-reduced-motion: no-preference)", () => {
    intro();
    scrolling();
  });
  mm.add("(prefers-reduced-motion: no-preference) and (hover: hover) and (min-width: 761px)", cursorPreview);
  root.classList.add("motion-ready");
});
