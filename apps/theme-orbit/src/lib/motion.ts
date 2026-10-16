import { gsap } from "gsap";

const stage = document.querySelector<HTMLElement>("[data-orbit-stage]");
const nodeLayer = stage?.querySelector<HTMLElement>("[data-orbit-nodes]");
const nodes = nodeLayer ? [...nodeLayer.querySelectorAll<HTMLAnchorElement>("[data-orbit-node]")] : [];
const dossier = document.querySelector<HTMLElement>("[data-dossier]");

if (stage && nodeLayer && dossier && nodes.length) {
  const title = dossier.querySelector<HTMLElement>("[data-detail-title]");
  const summary = dossier.querySelector<HTMLElement>("[data-detail-summary]");
  const image = dossier.querySelector<HTMLImageElement>("[data-detail-image]");
  const imageFrame = dossier.querySelector<HTMLAnchorElement>("[data-detail-image-frame]");
  const imageLabel = dossier.querySelector<HTMLElement>(".image-label");
  const placeholder = dossier.querySelector<HTMLElement>("[data-detail-placeholder]");
  const placeholderLetter = placeholder?.querySelector<HTMLElement>("span");
  const index = dossier.querySelector<HTMLElement>("[data-detail-index]");
  const tags = dossier.querySelector<HTMLElement>("[data-detail-tags]");
  const role = dossier.querySelector<HTMLElement>("[data-detail-role]");
  const period = dossier.querySelector<HTMLElement>("[data-detail-period]");
  const live = dossier.querySelector<HTMLAnchorElement>("[data-detail-live]");
  const repo = dossier.querySelector<HTMLAnchorElement>("[data-detail-repo]");
  const openCase = dossier.querySelector<HTMLAnchorElement>("[data-open-case]");
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const planetPaths = new Map(nodes.map((node, i) => [node, {
    phase: 0,
    radiusX: 0,
    radiusY: 0,
    angle: 0,
    direction: 1,
    duration: 62 + (i % 7) * 11,
  }]));
  const rings = [...stage.querySelectorAll<HTMLElement>("[data-orbit-ring]")];
  let arranged = false;

  const place = (node: HTMLAnchorElement, path: { phase: number; radiusX: number; radiusY: number; angle: number }) => {
    gsap.set(node, {
      x: Math.cos(path.phase + path.angle) * path.radiusX,
      y: Math.sin(path.phase + path.angle) * path.radiusY,
      xPercent: -50,
      yPercent: -50,
    });
  };

  const arrange = () => {
    const { width, height } = stage.getBoundingClientRect();
    const ringCount = Math.min(4, Math.max(1, Math.ceil(nodes.length / 4)));
    const grouped = Array.from({ length: ringCount }, () => [] as HTMLAnchorElement[]);
    nodes.forEach((node, i) => grouped[i % ringCount]!.push(node));
    const xFactors = width < 360 ? [0.84, 0.82, 0.8, 0.78] : width < 760 ? [0.84, 0.78, 0.72, 0.66] : [0.9, 0.8, 0.7, 0.6];
    const yFactors = width < 430 ? [0.6, 0.56, 0.52, 0.48] : width < 760 ? [0.82, 0.72, 0.62, 0.52] : [0.82, 0.72, 0.62, 0.52];
    const planetSize = width < 360 ? 42 : width < 430 ? 48 : width < 760 ? 70 : Math.min(96, Math.max(76, width * 0.06));
    const radiusX = Math.max(0, width / 2 - planetSize / 2 - 12);
    const radiusY = Math.max(0, height / 2 - planetSize / 2 - 12);

    grouped.forEach((group, ringIndex) => {
      group.forEach((node, position) => {
        const path = planetPaths.get(node)!;
        const ringPhase = [0, Math.PI / 4, Math.PI / 8, (3 * Math.PI) / 8][ringIndex]!;
        path.phase = (position / group.length) * Math.PI * 2 + ringPhase - Math.PI / 2;
        path.radiusX = Math.min(width * xFactors[ringIndex]! / 2, radiusX);
        path.radiusY = Math.min(height * yFactors[ringIndex]! / 2, radiusY);
        place(node, path);
      });
    });

    stage.classList.add("orbit-ready");
    if (reducedMotion.matches || arranged) {
      gsap.set(nodes, { scale: 1, autoAlpha: 1 });
    } else {
      gsap.fromTo(nodes, { scale: 0, autoAlpha: 0 }, {
        scale: 1,
        autoAlpha: 1,
        duration: 0.72,
        ease: "back.out(1.6)",
        stagger: { each: 0.045, from: "random" },
      });
    }
    arranged = true;
  };

  const select = (node: HTMLAnchorElement, animate = true) => {
    const update = () => {
      nodes.forEach((item) => {
        const selected = item === node;
        item.classList.toggle("selected", selected);
        if (selected) item.setAttribute("aria-current", "true");
        else item.removeAttribute("aria-current");
      });
      if (title) title.textContent = node.dataset.title ?? "";
      if (summary) summary.textContent = node.dataset.summary ?? "";
      if (index) index.textContent = node.dataset.index ?? "";
      if (role) role.textContent = node.dataset.role ?? "";
      if (period) period.textContent = node.dataset.period ?? "";
      if (image && imageFrame && placeholder) {
        const src = node.dataset.image ?? "";
        imageFrame.hidden = !src;
        image.hidden = !src;
        placeholder.hidden = Boolean(src);
        imageFrame.href = node.href;
        if (placeholderLetter) placeholderLetter.textContent = node.dataset.title?.slice(0, 1) ?? "";
        if (src) {
          image.setAttribute("src", src);
          image.alt = node.dataset.alt ?? node.dataset.title ?? "";
        } else {
          image.removeAttribute("src");
          image.alt = "";
        }
      }
      if (imageLabel) imageLabel.textContent = `SIGNAL / ${node.dataset.index ?? ""}`;
      if (tags) tags.textContent = node.dataset.tags ?? "";
      if (live) {
        live.hidden = !node.dataset.live;
        live.href = node.dataset.live || "#";
      }
      if (repo) {
        repo.hidden = !node.dataset.repo;
        repo.href = node.dataset.repo || "#";
      }
      if (openCase) openCase.href = node.href;
    };

    if (!animate || reducedMotion.matches) {
      update();
      return;
    }
    gsap.timeline().to(dossier, { autoAlpha: 0.35, y: 8, duration: 0.16, ease: "power1.in" })
      .call(update)
      .to(dossier, { autoAlpha: 1, y: 0, duration: 0.34, ease: "power2.out" });
  };

  const first = nodes[0];
  if (first) select(first, false);

  nodeLayer.addEventListener("click", (event) => {
    const target = event.target instanceof Element ? event.target.closest<HTMLAnchorElement>("[data-orbit-node]") : null;
    if (!target || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    select(target);
  });

  arrange();

  const media = gsap.matchMedia();
  media.add("(prefers-reduced-motion: no-preference)", () => {
    nodes.forEach((node) => {
      const path = planetPaths.get(node)!;
      gsap.to(path, {
        angle: path.direction * Math.PI * 2,
        duration: path.duration,
        ease: "none",
        repeat: -1,
        onUpdate: () => place(node, path),
      });
    });

    rings.forEach((ring, i) => {
      const marker = ring.querySelector<HTMLElement>("i");
      if (!marker) return;
      const track = { angle: i * Math.PI / 2 };
      const moveMarker = () => {
        const radiusX = Math.max(0, ring.clientWidth / 2 - marker.offsetWidth / 2);
        const radiusY = Math.max(0, ring.clientHeight / 2 - marker.offsetHeight / 2);
        gsap.set(marker, {
          x: Math.cos(track.angle) * radiusX,
          y: Math.sin(track.angle) * radiusY,
          xPercent: -50,
          yPercent: -50,
        });
      };
      moveMarker();
      gsap.to(track, {
        angle: track.angle + Math.PI * 2,
        duration: 24 + i * 13,
        ease: "none",
        repeat: -1,
        onUpdate: moveMarker,
      });
    });

    gsap.to("[data-hub-pulse]", { scale: 1.12, opacity: 0.3, duration: 2.4, ease: "sine.inOut", repeat: -1, yoyo: true });
  });

  const observer = new ResizeObserver(arrange);
  observer.observe(stage);
  window.addEventListener("pagehide", () => {
    observer.disconnect();
    media.revert();
  }, { once: true });
}