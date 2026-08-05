export function openModal(modalEl: HTMLElement): void {
  modalEl.removeAttribute("aria-hidden");
  document.body.style.overflow = "hidden";
  requestAnimationFrame(() => modalEl.classList.add("is-open"));
}

export function closeModal(modalEl: HTMLElement, restoreFocusEl?: HTMLElement | null): void {
  if (!modalEl.classList.contains("is-open")) return;
  if (document.activeElement && modalEl.contains(document.activeElement)) {
    (document.activeElement as HTMLElement).blur();
  }
  if (restoreFocusEl && typeof restoreFocusEl.focus === "function") {
    restoreFocusEl.focus();
  }
  modalEl.classList.remove("is-open");
  modalEl.setAttribute("aria-hidden", "true");
  document.body.style.overflow = "";
}

export function bindModalDismiss(modalEl: HTMLElement, close: () => void): void {
  modalEl.addEventListener("click", (e) => {
    if (e.target === modalEl) close();
  });
  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && modalEl.classList.contains("is-open")) close();
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
