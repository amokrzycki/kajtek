(() => {
  const systemTheme = window.matchMedia("(prefers-color-scheme: dark)");
  let dark = systemTheme.matches;
  let followsSystem = true;
  let shell = "red";
  try {
    const theme = localStorage.getItem("kajtek_theme");
    const savedCase = localStorage.getItem("kajtek_case");
    if (theme === "dark" || theme === "light") {
      dark = theme === "dark";
      followsSystem = false;
    }
    if (["red", "green", "yellow", "blue", "pink", "black"].includes(savedCase)) shell = savedCase;
  } catch {
    // Keep system defaults when browser storage is unavailable.
  }
  document.documentElement.dataset.case = shell;
  function applyTheme() {
    document.documentElement.classList.toggle("dark", dark);
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", dark ? "#1a1816" : "#eeebe3");
  }
  applyTheme();
  systemTheme.addEventListener("change", () => {
    if (!followsSystem) return;
    dark = systemTheme.matches;
    applyTheme();
  });
})();
