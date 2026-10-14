import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { SplitText } from "gsap/SplitText";

/**
 * Motion for the gallery theme, driven by data attributes:
 *   data-intro     shown by the intro timeline (hidden until then, see Base.astro)
 *   data-words     words rise out of their lines
 *   data-count     number counts up from zero (the HTML holds the final value)
 *   data-sticker   pops in, then spins slowly
 *   data-gallery   desktop: pinned and scrolled sideways; elsewhere a plain vertical list
 *   data-cloud     tags tumble in
 *   data-reveal    fades up on scroll; data-tilt straightens a screenshot; data-rise lifts the footer
 */
gsap.registerPlugin(ScrollTrigger, SplitText);

const root = document.documentElement;

function intro(): void {
  const tl = gsap.timeline({ defaults: { ease: "power3.out" } });
  const intro = gsap.utils.toArray<HTMLElement>("[data-intro]");
  for (const el of intro) {
    if (el.hasAttribute("data-words")) {
      const split = SplitText.create(el, { type: "lines,words", mask: "lines", linesClass: "split-mask" });
      tl.from(split.words, { yPercent: 110, duration: 1, ease: "expo.out", stagger: 0.07, onComplete: () => split.revert() }, "<0.15");
    } else if (el.hasAttribute("data-sticker")) {
      tl.from(el, { scale: 0, rotation: -120, duration: 0.9, ease: "back.out(2)" }, "<0.2");
    } else {
      tl.from(el, { autoAlpha: 0, y: 20, duration: 0.6 }, "<0.12");
    }
  }
  const wave = document.querySelector(".wave");
  if (wave) tl.to(wave, { rotation: 18, duration: 0.18, repeat: 5, yoyo: true, ease: "sine.inOut" }, 0.3);

  for (const el of document.querySelectorAll<HTMLElement>("[data-count]")) {
    const target = Number(el.dataset.count);
    const value = { n: 0 };
    el.textContent = "0";
    gsap.to(value, { n: target, duration: 1.6, delay: 0.8, ease: "power2.out", onUpdate: () => (el.textContent = String(Math.round(value.n))) });
  }
  gsap.to("[data-sticker]", { rotation: "+=360", duration: 22, repeat: -1, ease: "none", delay: 1.2 });
}

function scrolling(): void {
  for (const el of document.querySelectorAll<HTMLElement>("[data-reveal]")) {
    gsap.from(el, { autoAlpha: 0, y: 48, duration: 0.9, ease: "power3.out", scrollTrigger: { trigger: el, start: "top 90%" } });
  }
  for (const el of document.querySelectorAll<HTMLElement>("[data-tilt]")) {
    gsap.fromTo(
      el,
      { rotate: -3, scale: 0.92, y: 40 },
      { rotate: 0, scale: 1, y: 0, ease: "none", scrollTrigger: { trigger: el, start: "top bottom", end: "top 30%", scrub: true } },
    );
  }
  gsap.from("[data-cloud] li", {
    autoAlpha: 0,
    y: 40,
    rotation: () => gsap.utils.random(-10, 10),
    duration: 0.8,
    ease: "back.out(1.7)",
    stagger: { each: 0.03, from: "random" },
    scrollTrigger: { trigger: "[data-cloud]", start: "top 85%" },
  });
  gsap.from("[data-rise]", {
    yPercent: 18,
    ease: "none",
    scrollTrigger: { trigger: "[data-rise]", start: "top bottom", end: "top 50%", scrub: true },
  });
}

/** Desktop: pin the gallery and move the track sideways; screenshots drift inside their frames. */
function horizontalGallery(): () => void {
  const gallery = document.querySelector<HTMLElement>("[data-gallery]");
  const track = gallery?.querySelector<HTMLElement>("[data-track]");
  if (!gallery || !track) return () => {};
  gallery.classList.add("is-horizontal");
  const counter = gallery.querySelector<HTMLElement>("[data-counter]");
  const progress = gallery.querySelector<HTMLElement>("[data-progress]");
  const panels = gsap.utils.toArray<HTMLElement>("[data-panel]", gallery);
  const total = counter?.dataset.total ?? String(panels.length);
  const distance = () => track.scrollWidth - window.innerWidth;

  const move = gsap.to(track, {
    x: () => -distance(),
    ease: "none",
    scrollTrigger: {
      trigger: gallery,
      pin: true,
      scrub: 0.8,
      end: () => `+=${distance()}`,
      invalidateOnRefresh: true,
      onUpdate: (self) => {
        if (progress) gsap.set(progress, { scaleX: self.progress });
        const i = Math.min(panels.length, Math.floor(self.progress * panels.length) + 1);
        if (counter) counter.textContent = `${String(i).padStart(2, "0")} / ${total}`;
      },
    },
  });
  for (const panel of panels) {
    const img = panel.querySelector("img");
    if (img) {
      gsap.fromTo(
        img,
        { xPercent: -8, scale: 1.16 },
        { xPercent: 8, ease: "none", scrollTrigger: { trigger: panel, containerAnimation: move, start: "left right", end: "right left", scrub: true } },
      );
    }
    gsap.from(panel, {
      rotation: 4,
      y: 60,
      opacity: 0.3,
      ease: "power2.out",
      scrollTrigger: { trigger: panel, containerAnimation: move, start: "left 95%", end: "left 55%", scrub: true },
    });
  }
  ScrollTrigger.refresh();
  return () => {
    gallery.classList.remove("is-horizontal");
    if (counter) counter.textContent = total;
  };
}

if (root.classList.contains("motion")) {
  document.fonts.ready.then(() => {
    const mm = gsap.matchMedia();
    mm.add("(prefers-reduced-motion: no-preference)", () => {
      intro();
      scrolling();
    });
    mm.add("(prefers-reduced-motion: no-preference) and (min-width: 761px)", horizontalGallery);
    root.classList.add("motion-ready");
  });
}
