export function bindTabKeys(tabs: readonly HTMLButtonElement[]): void {
  tabs.forEach((tab, index) => {
    tab.onkeydown = (event) => {
      if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
      event.preventDefault();
      const next =
        event.key === "Home"
          ? 0
          : event.key === "End"
            ? tabs.length - 1
            : (index + (event.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length;
      tabs[next]?.click();
      tabs[next]?.focus();
    };
  });
}
