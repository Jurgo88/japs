import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { SplitText } from "gsap/SplitText";

/**
 * Motion for the editorial theme, driven by data attributes in the markup:
 *   data-split="chars|words"  text rises out of its lines (on load with data-intro, else on scroll)
 *   data-curtain              a frame opens like a curtain while scrolling; its image drifts
 *   data-stagger              children fade up one after another when scrolled into view
 *   data-intro                hidden until the intro runs (see the inline script in Base.astro)
 * Without JS or with reduced motion none of this runs and everything is simply visible.
 */
gsap.registerPlugin(ScrollTrigger, SplitText);

const root = document.documentElement;

function splitRise(el: HTMLElement, intro: boolean): void {
  const type = el.dataset.split === "words" ? "words" : "chars";
  const split = SplitText.create(el, { type: `lines,${type}`, mask: "lines", linesClass: "split-mask" });
  gsap.from(split[type], {
    yPercent: 115,
    duration: type === "chars" ? 1.1 : 1,
    ease: "expo.out",
    stagger: type === "chars" ? 0.03 : 0.06,
    delay: intro ? 0.1 : 0,
    scrollTrigger: intro ? undefined : { trigger: el, start: "top 85%" },
    // Back to plain text: no clipped descenders, normal selection and reflow on resize.
    onComplete: () => split.revert(),
  });
}

function setup(): void {
  for (const el of document.querySelectorAll<HTMLElement>("[data-split]")) splitRise(el, el.hasAttribute("data-intro"));

  gsap.from("[data-intro]:not([data-split])", {
    autoAlpha: 0,
    y: 24,
    duration: 0.9,
    ease: "power3.out",
    stagger: 0.08,
    delay: 0.5,
  });

  for (const frame of document.querySelectorAll<HTMLElement>("[data-curtain]")) {
    gsap.fromTo(
      frame,
      { clipPath: "inset(16% 20% 16% 0%)" },
      { clipPath: "inset(0% 0% 0% 0%)", ease: "none", scrollTrigger: { trigger: frame, start: "top 92%", end: "top 35%", scrub: true } },
    );
    const img = frame.querySelector("img");
    if (img) {
      gsap.fromTo(
        img,
        { yPercent: -10 },
        { yPercent: 0, ease: "none", scrollTrigger: { trigger: frame, start: "top bottom", end: "bottom top", scrub: true } },
      );
    }
  }

  for (const group of document.querySelectorAll<HTMLElement>("[data-stagger]")) {
    gsap.from(group.children, {
      autoAlpha: 0,
      y: 22,
      duration: 0.8,
      ease: "power3.out",
      stagger: 0.08,
      scrollTrigger: { trigger: group, start: "top 80%" },
    });
  }
}

if (root.classList.contains("motion")) {
  // Lines are measured after the fonts are in, or SplitText breaks them in the wrong places.
  document.fonts.ready.then(() => {
    gsap.matchMedia().add("(prefers-reduced-motion: no-preference)", setup);
    root.classList.add("motion-ready");
  });
}
