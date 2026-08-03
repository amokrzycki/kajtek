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
