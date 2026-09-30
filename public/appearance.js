(() => {
  let dark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  let shell = "red";
  try {
    const theme = localStorage.getItem("kajtek_theme");
    const savedCase = localStorage.getItem("kajtek_case");
    if (theme) dark = theme === "dark";
    if (["red", "green", "yellow", "blue", "pink", "black"].includes(savedCase)) shell = savedCase;
  } catch {
    // Keep system defaults when browser storage is unavailable.
  }
  document.documentElement.classList.toggle("dark", dark);
  document.documentElement.dataset.case = shell;
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", dark ? "#1a1816" : "#eeebe3");
})();
