export function createLayoutTransition(container: HTMLElement, selector: string) {
  let frame: number | null = null;
  let pendingPositions: Map<string, DOMRect> | null = null;
  let generation = 0;
  const animations = new Map<HTMLElement, Animation>();
  const cancel = () => {
    generation++;
    if (frame !== null) cancelAnimationFrame(frame);
    frame = null;
    pendingPositions = null;
    animations.forEach((animation, card) => {
      animation.cancel();
      card.style.zIndex = "";
    });
    animations.clear();
  };
  const capture = () => {
    const first = pendingPositions ?? new Map<string, DOMRect>();
    if (!pendingPositions) {
      container.querySelectorAll<HTMLElement>(selector).forEach((card) => {
        if (card.dataset.id) first.set(card.dataset.id, card.getBoundingClientRect());
      });
    }
    cancel();
    return () => {
      if (!first.size || container.hidden || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
      const token = generation;
      pendingPositions = first;
      frame = requestAnimationFrame(() => {
        if (token !== generation) return;
        frame = null;
        pendingPositions = null;
        container.querySelectorAll<HTMLElement>(selector).forEach((card) => {
          const before = first.get(card.dataset.id ?? "");
          if (!before) return;
          const after = card.getBoundingClientRect();
          const x = before.left - after.left;
          const y = before.top - after.top;
          if (!x && !y) return;
          card.style.zIndex = "10";
          const animation = card.animate([{ transform: `translate(${x}px, ${y}px)` }, { transform: "none" }], {
            duration: 280,
            easing: "cubic-bezier(0.16, 1, 0.3, 1)",
          });
          animations.set(card, animation);
          void animation.finished
            .catch(() => undefined)
            .finally(() => {
              if (animations.get(card) !== animation) return;
              animations.delete(card);
              card.style.zIndex = "";
            });
        });
      });
    };
  };
  return { capture, cancel };
}

export function createBrowserTransition(
  container: HTMLElement,
  panels: readonly HTMLElement[],
): {
  switchTo: (incoming: HTMLElement, direction: number) => void;
  cancel: () => void;
} {
  let current = panels.find((panel) => !panel.hidden);
  let animations: Animation[] = [];
  let generation = 0;
  const settle = () => {
    generation++;
    animations.forEach((animation) => {
      animation.cancel();
    });
    animations = [];
    panels.forEach((panel) => {
      const inactive = panel !== current;
      panel.hidden = inactive;
      panel.inert = inactive;
      panel.setAttribute("aria-hidden", String(inactive));
      panel.classList.remove("is-leaving");
    });
    container.classList.remove("is-transitioning");
  };
  const switchTo = (incoming: HTMLElement, direction: number) => {
    const outgoing = current;
    const oldHeight = container.getBoundingClientRect().height;
    settle();
    current = incoming;
    if (outgoing?.contains(document.activeElement)) {
      document.getElementById(incoming.getAttribute("aria-labelledby") ?? "")?.focus({ preventScroll: true });
    }
    incoming.hidden = false;
    incoming.inert = false;
    incoming.setAttribute("aria-hidden", "false");
    if (outgoing) {
      outgoing.inert = true;
      outgoing.setAttribute("aria-hidden", "true");
      outgoing.hidden = true;
    }
    if (
      !outgoing ||
      outgoing === incoming ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches ||
      !incoming.animate
    ) {
      settle();
      return;
    }
    const newHeight = container.getBoundingClientRect().height;
    outgoing.classList.add("is-leaving");
    outgoing.hidden = false;
    container.classList.add("is-transitioning");
    const easing = "cubic-bezier(0.16, 1, 0.3, 1)";
    animations = [
      outgoing.animate(
        [
          { opacity: 1, transform: "translateX(0)" },
          { opacity: 0, transform: `translateX(${-direction * 8}px)` },
        ],
        { duration: 150, easing, fill: "forwards" },
      ),
      incoming.animate(
        [
          { opacity: 0, transform: `translateX(${direction * 12}px)` },
          { opacity: 1, transform: "translateX(0)" },
        ],
        { duration: 230, easing },
      ),
      container.animate([{ height: `${oldHeight}px` }, { height: `${newHeight}px` }], { duration: 230, easing }),
    ];
    const token = generation;
    void Promise.all(animations.map((animation) => animation.finished)).then(
      () => {
        if (token === generation) settle();
      },
      () => {
        if (token === generation) settle();
      },
    );
  };
  return { switchTo, cancel: settle };
}
