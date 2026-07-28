/** biome-ignore-all lint/suspicious/noConsole: Dev server file */
import fs from "node:fs";
import http from "node:http";
import https from "node:https";
import path from "node:path";
import { context } from "esbuild";

const pkg = JSON.parse(fs.readFileSync("./package.json", "utf-8"));

const ctx = await context({
  entryPoints: [
    { in: "src/app.ts", out: "app" },
    { in: "styles/index.css", out: "style" },
  ],
  bundle: true,
  sourcemap: true,
  outdir: "dist",
  format: "esm",
  define: {
    APP_VERSION: JSON.stringify(pkg.version),
  },
});

await ctx.watch();
console.log("ESbuild watching...");

http
  .createServer((req, res) => {
    if (req.url?.startsWith("/api/rmf/")) {
      const targetPath = req.url.replace(/^\/api\/rmf/, "");

      const options = {
        hostname: "api.rmfon.pl",
        port: 443,
        path: targetPath,
        method: req.method,
        headers: {
          ...req.headers,
          host: "api.rmfon.pl",
          "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
        },
      };

      const proxyReq = https.request(options, (proxyRes) => {
        const headers = {
          ...proxyRes.headers,
          "access-control-allow-origin": "*",
        };
        res.writeHead(proxyRes.statusCode || 200, headers);
        proxyRes.pipe(res);
      });

      proxyReq.on("error", (err) => {
        res.writeHead(502);
        res.end(`Proxy error: ${err.message}`);
      });

      req.pipe(proxyReq);
      return;
    }

    // check dist/ then public/ so compiled/static assets shadow raw root files
    let filePath = req.url === "/" ? "./index.html" : `.${req.url}`;
    if (req.url !== "/") {
      const distPath = `./dist${req.url}`;
      const publicPath = `./public${req.url}`;
      if (fs.existsSync(distPath) && !fs.statSync(distPath).isDirectory()) {
        filePath = distPath;
      } else if (fs.existsSync(publicPath) && !fs.statSync(publicPath).isDirectory()) {
        filePath = publicPath;
      }
    }

    fs.readFile(filePath, (err, data) => {
      if (err) {
        res.writeHead(404);
        res.end("Not found");
        return;
      }
      const ext = path.extname(filePath);
      const mimeMap = {
        ".html": "text/html",
        ".js": "text/javascript",
        ".css": "text/css",
        ".json": "application/json",
      };
      res.writeHead(200, {
        "Content-Type": mimeMap[ext] || "text/plain",
        "Cache-Control": "no-cache, no-store, must-revalidate",
        Pragma: "no-cache",
        Expires: "0",
      });
      res.end(data);
    });
  })
  .listen(3000, () => {
    console.log("Dev server running at http://localhost:3000");
  });
