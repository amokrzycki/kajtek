import assert from "node:assert/strict";
import fs from "node:fs";

const { chromium } = await import(process.env.KAJTEK_PLAYWRIGHT_MODULE ?? "playwright");

const output = process.env.KAJTEK_QA_OUTPUT ?? "/tmp/kajtek-browser-qa";
fs.mkdirSync(output, { recursive: true });
const browser = await chromium.launch({
  headless: false,
  executablePath: process.env.KAJTEK_CHROMIUM ?? "/usr/bin/chromium",
  args: ["--no-sandbox", "--autoplay-policy=no-user-gesture-required"],
  env: { ...process.env, DISPLAY: process.env.DISPLAY ?? ":99" },
});
const ids = ["rmf", "maxxx", "classic", "eska_ra-4TNN-ZLtR-bGih"];
const preferences = [
  { scope: "artist", artist: "Liked", title: "", key: "artist:liked", value: "positive" },
  { scope: "artist", artist: "Bad", title: "", key: "artist:bad", value: "negative" },
  { scope: "track", artist: "Rejected", title: "Song", key: "track:rejected::song", value: "negative" },
];
const wav = Buffer.alloc(44 + 8000 * 2 * 300);
wav.write("RIFF", 0);
wav.writeUInt32LE(wav.length - 8, 4);
wav.write("WAVEfmt ", 8);
wav.writeUInt32LE(16, 16);
wav.writeUInt16LE(1, 20);
wav.writeUInt16LE(1, 22);
wav.writeUInt32LE(8000, 24);
wav.writeUInt32LE(16000, 28);
wav.writeUInt16LE(2, 32);
wav.writeUInt16LE(16, 34);
wav.write("data", 36);
wav.writeUInt32LE(wav.length - 44, 40);
for (let i = 0; i < 8000 * 300; i++) wav.writeInt16LE(Math.sin((i * 2 * Math.PI * 440) / 8000) * 1500, 44 + i * 2);
const results = [];
async function fixture(scenario, viewport = { width: 1280, height: 1000 }) {
  const context = await browser.newContext({ viewport, timezoneId: "Europe/Warsaw", reducedMotion: "reduce" });
  const page = await context.newPage();
  const base =
    scenario === "ui" ? Date.now() : Date.parse(scenario === "ad" ? "2026-10-05T11:59:00Z" : "2026-10-05T12:30:00Z");
  let now = base;
  let originPhase = scenario === "ad" ? "ad" : scenario === "negative" ? "negative" : "safe";
  let classicPhase = "liked";
  const errors = [],
    requests = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  if (scenario !== "ui") await page.clock.install({ time: new Date(base) });
  await page.addInitScript(
    ({ ids, preferences, scenario }) => {
      localStorage.setItem("kajtek_last_seen_version", "0.13.0");
      localStorage.setItem("kajtek_theme", "light");
      localStorage.setItem(
        "kajtek_smart_listening",
        JSON.stringify({
          version: 1,
          enabled: scenario !== "disabled",
          content: { advertisement: true, news: true, otherBreak: true },
          preferences,
        }),
      );
      localStorage.setItem(
        "kajtek_station_prefs",
        JSON.stringify(
          Object.fromEntries(
            ids.map((id) => [id, { id, enabled: true, favorite: false, smartEnabled: scenario !== "empty" }]),
          ),
        ),
      );
      if (scenario === "large") {
        const custom = Array.from({ length: 1000 }, (_, i) => ({
          id: `custom_${i}`,
          name: `Long station ${i}${" żółć ".repeat(12)}`,
          stream: `https://example.org/${i}`,
        }));
        localStorage.setItem("kajtek_custom_stations", JSON.stringify(custom));
      }
    },
    { ids, preferences: scenario === "blank" ? [] : preferences, scenario },
  );
  const playlist = (id) => {
    const sec = Math.floor(now / 1000),
      bs = Math.floor(base / 1000);
    if (id === "5" && originPhase === "ad")
      return [
        { order: 0, author: "Before", title: "Before", timestamp: bs - 400, length: 100 },
        { order: 1, author: "After", title: "After", timestamp: bs + 60, length: 1000 },
      ];
    if (id === "5" && originPhase === "news")
      return [
        { order: 0, author: "Before", title: "Before", timestamp: bs - 40, length: 100 },
        { order: 1, author: "After", title: "After", timestamp: bs + 300, length: 1000 },
      ];
    const artist =
      id === "5"
        ? originPhase === "negative"
          ? "Rejected"
          : "Origin Safe"
        : id === "7"
          ? classicPhase === "liked"
            ? "Liked"
            : "Bad"
          : "Neutral";
    return [{ order: 0, author: artist, title: "Song", timestamp: sec - 10, length: 1200 }];
  };
  await page.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (url.hostname === "localhost") {
      if (url.pathname.startsWith("/api/")) {
        requests.push(url.pathname);
        let payload = {};
        const match = url.pathname.match(/\/api\/rmf\/stations\/(\d+)\/playlist/);
        if (match && match[1] === "5" && originPhase === "missing")
          return route.fulfill({ status: 503, json: { error: "controlled outage" } });
        if (match) payload = playlist(match[1]);
        else if (url.pathname.includes("/music/v2/now_playing/"))
          payload = { current: { artists: ["Bad"], name: "Song" }, pasts: [], futures: [] };
        else if (url.pathname.endsWith("/streams")) payload = { playlistMp3: { item_mp3: [] } };
        else if (url.pathname.endsWith("/stations")) payload = [];
        else if (url.pathname.includes("/radio_stations/")) payload = [];
        return route.fulfill({ json: payload });
      }
      return route.continue();
    }
    if (url.hostname.includes("rmfstream") || url.hostname === "waw.ic.smcdn.pl")
      return route.fulfill({
        status: 200,
        headers: {
          "Access-Control-Allow-Origin": "http://localhost:3000",
          "Access-Control-Allow-Credentials": "true",
          "Content-Type": "audio/wav",
        },
        body: wav,
      });
    if (url.hostname.includes("fonts")) return route.fulfill({ status: 200, contentType: "text/css", body: "" });
    return route.fulfill({
      status: 200,
      contentType: "image/svg+xml",
      body: '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><rect width="100" height="100" fill="#332820"/></svg>',
    });
  });
  await page.goto("http://localhost:3000");
  await page.waitForTimeout(200);
  async function tick(ms) {
    if (scenario === "ui") {
      now += ms;
      await page.waitForTimeout(ms);
      return;
    }
    for (let t = 0; t < ms; t += 1000) {
      now += Math.min(1000, ms - t);
      await page.clock.runFor(Math.min(1000, ms - t));
      await page.waitForTimeout(20);
    }
  }
  const selected = () => page.locator("#np-station").textContent();
  return {
    context,
    page,
    errors,
    requests,
    tick,
    selected,
    setOrigin: (p) => (originPhase = p),
    setClassic: (p) => (classicPhase = p),
  };
}
try {
  const f = await fixture("ad");
  const { page, tick } = f;
  await page.locator('.station-card[data-id="rmf"] .station-select').click();
  await tick(2000);
  assert.match(await page.locator("#smart-warning").innerText(), /RMF CLASSIC.*lubiany artysta/s);
  await page.locator(".bl-warn-switch").focus();
  await tick(6000);
  assert.match(await f.selected(), /RMF CLASSIC/);
  assert.equal(await page.evaluate(() => document.activeElement?.classList.contains("bl-warn-revert")), true);
  assert.equal(await page.locator("#history-panel").evaluate((el) => el.classList.contains("open")), false);
  await page.screenshot({ path: `${output}/detour-desktop.png`, fullPage: true });
  f.setOrigin("news");
  await tick(70000);
  assert.match(await f.selected(), /RMF CLASSIC/);
  f.setOrigin("safe");
  await tick(35000);
  assert.match(await f.selected(), /RMF FM/);
  const stats = await page.evaluate(() => JSON.parse(localStorage.getItem("kajtek_statistics")));
  assert.equal(stats.allTime.adsAvoided, 1);
  assert.equal(stats.allTime.detours, 1);
  assert.deepEqual(f.errors, []);
  results.push({
    scenario: "RMF ad -> reject ESKA artist -> Classic liked -> news holds -> safe return",
    result: "PASS",
    stats: stats.allTime,
  });
  await f.context.close();
  const n = await fixture("negative");
  await n.page.locator('.station-card[data-id="rmf"] .station-select').click();
  await n.tick(8000);
  assert.match(await n.selected(), /RMF CLASSIC/);
  n.setClassic("bad");
  await n.tick(11000);
  assert.match(await n.selected(), /RMF MAXX/);
  assert.match(await n.page.locator("#smart-warning").innerText(), /RMF FM będzie/);
  n.setOrigin("safe");
  await n.tick(35000);
  assert.match(await n.selected(), /RMF FM/);
  assert.deepEqual(n.errors, []);
  results.push({ scenario: "negative track -> Classic becomes bad -> MAXX -> original RMF return", result: "PASS" });
  await n.context.close();
  const s = await fixture("safe");
  await s.page.locator('.station-card[data-id="rmf"] .station-select').click();
  await s.tick(65000);
  assert.match(await s.selected(), /RMF FM/);
  assert.equal(await s.page.locator("#smart-warning").evaluate((el) => el.classList.contains("open")), false);
  assert.deepEqual(s.errors, []);
  results.push({ scenario: "liked artist elsewhere without trigger never switches", result: "PASS" });
  await s.context.close();
  const u = await fixture("ui");
  await u.page.locator('.station-card[data-id="rmf"] .station-select').click();
  await u.tick(1000);
  await u.page.locator("#settings-toggle").focus();
  await u.page.keyboard.press("Enter");
  await u.tick(300);
  await u.page.waitForTimeout(200);
  await u.page.locator("#settings-smart-configure").focus();
  await u.page.keyboard.press("Enter");
  await u.tick(300);
  assert.equal(await u.page.locator("#smart-modal-title").textContent(), "Smart Listening");
  assert.equal(await u.page.getByRole("dialog", { name: "Smart Listening", exact: true }).isVisible(), true);
  assert.equal(await u.page.getByRole("checkbox", { name: "Włącz Smart Listening", exact: true }).isChecked(), true);
  await u.page.waitForTimeout(200);
  await u.page.locator("#smart-modal-close").focus();
  await u.page.keyboard.press("Shift+Tab");
  assert.equal(await u.page.evaluate(() => document.activeElement?.closest("details")?.id), "smart-music-section");
  await u.page.keyboard.press("Tab");
  assert.equal(await u.page.evaluate(() => document.activeElement?.id), "smart-modal-close");
  assert.notEqual(
    await u.page.locator("#smart-modal-close").evaluate((el) => getComputedStyle(el).outlineStyle),
    "none",
  );
  await u.page.screenshot({ path: `${output}/config-desktop.png`, fullPage: true });
  await u.page.locator("#smart-music-section > summary").click();
  await u.page.locator("#smart-preference-scope").selectOption("artist");
  await u.page.locator("#smart-preference-artist").fill(`Long artist ${"ąęź ".repeat(40)}`);
  await u.page.locator("#smart-preference-value").selectOption("positive");
  await u.page.locator("#smart-preference-save").click();
  await u.page.locator("#smart-saved-preferences").evaluate((el) => (el.open = true));
  await u.page.screenshot({ path: `${output}/preferences-desktop.png`, fullPage: true });
  await u.page.keyboard.press("Escape");
  await u.tick(300);
  assert.equal(await u.page.evaluate(() => document.activeElement?.id), "settings-toggle");
  results.push({ scenario: "keyboard settings/config/Escape restores original focus", result: "PASS" });
  await u.page.locator("#np-block-btn").click();
  await u.tick(300);
  assert.equal(await u.page.locator("#smart-preference-artist").inputValue(), "Origin Safe");
  assert.equal(await u.page.evaluate(() => document.activeElement?.id), "smart-preference-value");
  await u.page.keyboard.press("Escape");
  await u.tick(300);
  await u.page.setViewportSize({ width: 390, height: 844 });
  await u.page.locator("#settings-toggle").click();
  await u.tick(300);
  await u.page.locator("#settings-smart-configure").click();
  await u.tick(300);
  await u.page.locator("#smart-music-section > summary").click();
  await u.page.locator("#smart-saved-preferences").evaluate((el) => (el.open = true));
  await u.page.screenshot({ path: `${output}/preferences-mobile.png`, fullPage: true });
  assert.equal(await u.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  assert.equal(await u.page.locator(".k-smart-modal").evaluate((el) => el.scrollWidth <= el.clientWidth), true);
  await u.page.setViewportSize({ width: 1280, height: 1000 });
  await u.page.evaluate(() => (document.documentElement.style.zoom = "2"));
  await u.page.screenshot({ path: `${output}/preferences-zoom.png`, fullPage: true });
  assert.equal(await u.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  assert.equal(await u.page.locator(".k-smart-modal").evaluate((el) => el.scrollWidth <= el.clientWidth), true);
  results.push({ scenario: "mobile/long names/200% zoom/reduced motion", result: "PASS" });
  assert.deepEqual(u.errors, []);
  await u.context.close();

  const d = await fixture("disabled");
  d.setOrigin("negative");
  await d.page.locator('.station-card[data-id="rmf"] .station-select').click();
  await d.tick(40000);
  assert.match(await d.selected(), /RMF FM/);
  assert.equal(await d.page.locator("#smart-switch").getAttribute("aria-checked"), "false");
  assert.deepEqual(d.errors, []);
  assert.equal(
    d.requests.some((path) => /stations\/(6|7)\/playlist|now_playing/.test(path)),
    false,
  );
  results.push({
    scenario: "disabled Smart does not protectively switch or poll pool",
    result: "PASS",
    requests: d.requests,
  });
  await d.context.close();
  const e = await fixture("empty");
  e.setOrigin("negative");
  await e.page.locator('.station-card[data-id="rmf"] .station-select').click();
  await e.tick(40000);
  assert.match(await e.selected(), /RMF FM/);
  assert.match(await e.page.locator("#smart-warning").innerText(), /Brak odpowiedniej stacji/);
  assert.deepEqual(e.errors, []);
  results.push({ scenario: "empty pool explains unavailable destination without switching", result: "PASS" });
  await e.context.close();
  const p = await fixture("negative");
  await p.page.locator('.station-card[data-id="rmf"] .station-select').click();
  await p.tick(8000);
  assert.match(await p.selected(), /RMF CLASSIC/);
  await p.page.locator("#play-btn").click();
  await p.tick(30000);
  assert.match(await p.selected(), /RMF CLASSIC/);
  p.setOrigin("safe");
  await p.page.locator("#play-btn").click();
  await p.tick(35000);
  assert.match(await p.selected(), /RMF FM/);
  assert.deepEqual(p.errors, []);
  results.push({ scenario: "pause/resume retains detour and requires safe return", result: "PASS" });
  await p.context.close();
  const m = await fixture("negative");
  await m.page.locator('.station-card[data-id="rmf"] .station-select').click();
  await m.tick(8000);
  assert.match(await m.selected(), /RMF CLASSIC/);
  await m.page.locator('.station-card[data-id="maxxx"] .station-select').click();
  m.setOrigin("safe");
  await m.tick(40000);
  assert.match(await m.selected(), /RMF MAXX/);
  assert.equal(await m.page.locator("#smart-warning").evaluate((el) => el.classList.contains("open")), false);
  assert.deepEqual(m.errors, []);
  results.push({ scenario: "ordinary station selection cancels original return relationship", result: "PASS" });
  await m.context.close();
  const x = await fixture("negative");
  await x.page.locator('.station-card[data-id="rmf"] .station-select').click();
  await x.tick(8000);
  x.setOrigin("missing");
  await x.tick(160000);
  assert.match(await x.selected(), /RMF CLASSIC/);
  assert.equal(x.errors.filter((err) => !err.includes("503")).length, 0);
  results.push({
    scenario: "origin provider outage/stale evidence holds detour",
    result: "PASS",
    expectedNetworkErrors: x.errors.length,
  });
  await x.context.close();

  const l = await fixture("large");
  await l.page.locator("#settings-toggle").click();
  await l.tick(300);
  const openedAt = Date.now();
  await l.page.locator("#settings-smart-configure").click();
  await l.tick(300);
  await l.page.locator("#smart-stations-section > summary").click();
  assert.equal(await l.page.locator("#smart-station-list input").count(), 1007);
  await l.page.locator("#smart-station-search").fill("Long station 999");
  assert.equal(await l.page.locator("#smart-station-list label:visible").count(), 1);
  assert.equal(await l.page.locator(".k-smart-body").evaluate((el) => el.scrollWidth <= el.clientWidth), true);
  assert.deepEqual(l.errors, []);
  results.push({
    scenario: "1000 custom stations/search/long station names",
    result: "PASS",
    openAndSearchMs: Date.now() - openedAt,
  });
  await l.context.close();
  const q = await fixture("safe");
  await q.page.locator('.station-card[data-id="rmf"] .station-select').click();
  await q.tick(2000);
  const before = q.requests.filter((path) => path.includes("/playlist") || path.includes("now_playing")).length;
  await q.page.locator("#browser-now").click();
  await q.tick(1000);
  assert.equal(q.requests.filter((path) => path.includes("/playlist") || path.includes("now_playing")).length, before);
  await q.page.locator("#browser-stations").click();
  await q.page.evaluate(() => {
    Object.defineProperty(document, "hidden", { configurable: true, value: true });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await q.tick(20000);
  assert.match(await q.selected(), /RMF FM/);
  assert.ok(q.requests.filter((path) => path.includes("/stations/7/playlist")).length > 1);
  assert.deepEqual(q.errors, []);
  results.push({ scenario: "discovery reuses Smart snapshots and hidden-page playback keeps polling", result: "PASS" });
  await q.context.close();
  const c = await fixture("negative");
  await c.page.locator('.station-card[data-id="rmf"] .station-select').click();
  await c.tick(8000);
  assert.match(await c.selected(), /RMF CLASSIC/);
  await c.page.locator("#smart-switch").click();
  c.setOrigin("safe");
  await c.tick(45000);
  assert.match(await c.selected(), /RMF CLASSIC/);
  assert.equal(await c.page.locator("#smart-warning").evaluate((el) => el.classList.contains("open")), false);
  assert.deepEqual(c.errors, []);
  results.push({ scenario: "disable during detour keeps current audio and cancels return", result: "PASS" });
  await c.context.close();
  const b = await fixture("blank");
  await b.page.locator("#settings-toggle").click();
  await b.tick(300);
  await b.page.locator("#settings-smart-configure").click();
  await b.tick(300);
  await b.page.locator("#smart-music-section > summary").click();
  assert.equal(await b.page.locator("#smart-preference-empty").isVisible(), true);
  assert.equal(await b.page.locator("#smart-saved-preferences").isVisible(), false);
  assert.deepEqual(b.errors, []);
  results.push({ scenario: "empty preferences explain how to add a rule", result: "PASS" });
  await b.context.close();
  process.stdout.write(`${JSON.stringify(results, null, 2)}\n`);
  fs.writeFileSync(`${output}/results.json`, `${JSON.stringify(results, null, 2)}\n`);
} finally {
  await browser.close();
}
