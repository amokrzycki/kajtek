import fs from "node:fs";
import path from "node:path";

const dist = "dist";
const files = fs.readdirSync(dist);
const jsFile = files.find((f) => /^app-.+\.js$/.test(f));
const cssFile = files.find((f) => /^style-.+\.css$/.test(f));

if (!jsFile || !cssFile) {
  throw new Error(`Hashed build output not found in ${dist}/ (js: ${jsFile}, css: ${cssFile})`);
}

const htmlPath = path.join(dist, "index.html");
const html = fs
  .readFileSync(htmlPath, "utf-8")
  .replace('src="app.js"', `src="${jsFile}"`)
  .replace('href="style.css"', `href="${cssFile}"`);

fs.writeFileSync(htmlPath, html);
