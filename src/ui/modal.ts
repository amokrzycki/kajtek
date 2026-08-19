const previousFocus = new WeakMap<HTMLElement, HTMLElement>();

function getFocusableElements(modalEl: HTMLElement): HTMLElement[] {
  return Array.from(
    modalEl.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), summary, textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
    ),
  ).filter((element) => element.getClientRects().length > 0 && element.getAttribute("aria-hidden") !== "true");
}

export function openModal(modalEl: HTMLElement): void {
  if (document.activeElement instanceof HTMLElement) previousFocus.set(modalEl, document.activeElement);
  modalEl.removeAttribute("aria-hidden");
  document.body.style.overflow = "hidden";
  requestAnimationFrame(() => {
    modalEl.classList.add("is-open");
    (modalEl.querySelector<HTMLElement>("[autofocus]") ?? getFocusableElements(modalEl)[0])?.focus();
  });
}

export function closeModal(modalEl: HTMLElement, restoreFocusEl?: HTMLElement | null): void {
  if (!modalEl.classList.contains("is-open")) return;
  if (document.activeElement && modalEl.contains(document.activeElement)) {
    (document.activeElement as HTMLElement).blur();
  }
  modalEl.classList.remove("is-open");
  modalEl.setAttribute("aria-hidden", "true");
  if (!document.querySelector(".k-modal-overlay.is-open")) document.body.style.overflow = "";
  (restoreFocusEl ?? previousFocus.get(modalEl))?.focus();
  previousFocus.delete(modalEl);
}

export function bindModalDismiss(modalEl: HTMLElement, close: () => void): void {
  modalEl.addEventListener("click", (e) => {
    if (e.target === modalEl) close();
  });
  window.addEventListener("keydown", (e) => {
    const topmostModal = Array.from(document.querySelectorAll<HTMLElement>(".k-modal-overlay.is-open")).at(-1);
    if (topmostModal !== modalEl) return;
    if (e.key === "Escape") {
      close();
      return;
    }
    if (e.key !== "Tab") return;

    const focusable = getFocusableElements(modalEl);
    const first = focusable[0];
    const last = focusable.at(-1);
    if (!first || !last) {
      e.preventDefault();
    } else if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  });
}

export function animateHeightChange(modalBox: HTMLElement, apply: () => void): void {
  const prevHeight = modalBox.getBoundingClientRect().height;
  apply();

  const newHeight = modalBox.getBoundingClientRect().height;
  if (Math.abs(newHeight - prevHeight) > 1) {
    modalBox.style.height = `${prevHeight}px`;
    modalBox.style.transition = "height 220ms cubic-bezier(0.2, 0, 0, 1)";
    requestAnimationFrame(() => {
      modalBox.style.height = `${newHeight}px`;
    });
    window.setTimeout(() => {
      modalBox.style.height = "";
      modalBox.style.transition = "";
    }, 240);
  }
}

export function animateTabSwitch(
  listContainer: HTMLElement,
  modalBox: HTMLElement,
  render: () => void,
  pendingTimer: number | undefined,
): number {
  if (pendingTimer) window.clearTimeout(pendingTimer);
  listContainer.classList.add("is-switching");

  return window.setTimeout(() => {
    animateHeightChange(modalBox, render);
    requestAnimationFrame(() => listContainer.classList.remove("is-switching"));
  }, 140);
}
