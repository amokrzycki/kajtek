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
