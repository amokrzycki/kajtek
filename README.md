# KAJTEK Radio

An ultra-lightweight retro-style web internet radio player inspired by the iconic Polish PRL cassette tape player (Unitra PS-101 / KAJTEK).

---

## Features

1. **Internet Radio Streaming** - Play live audio streams with real-time station management.
2. **Dark / Light Theme** - Retro-styled theme toggle persisted in `localStorage`.
3. **Favorite Stations** - Bookmark your favorite stations with ★ and keep them saved locally.
4. **Sleep Timer** - Automatically turn off audio after 15, 30, 60, or 90 minutes.
5. **VU Meter & Cassette Reels** - Smooth cassette tape reel animations and an interactive VU meter during playback.

---

## Project Structure

- `index.html` - Core HTML5 layout and semantic structure.
- `style.css` - Retro design system (CSS variables, dark/light modes, animations).
- `js/` - Modular application logic (station management, audio streams, timers, UI reactivity).
- `biome.json` - Code formatting configuration (dev environment).

---

## Development & Formatting

`biome.json` is used for code formatting in the development environment:

```bash
npx @biomejs/biome format --write ./
```

---

## Getting Started

Simply open `index.html` directly in any browser, or run a simple local HTTP server:

```bash
python3 -m http.server 8080
```

Then navigate to `http://localhost:8080` in your web browser.
