/** biome-ignore-all lint/suspicious/noConsole: Dev server file */
import fs from "node:fs";
import http from "node:http";
import https from "node:https";
import os from "node:os";
import path from "node:path";
import { context } from "esbuild";
import { createUpstreamHeaders, resolvePublicPathname } from "./server-utils.mjs";

const pkg = JSON.parse(fs.readFileSync("./package.json", "utf-8"));
const port = Number.parseInt(process.env.KAJTEK_PORT ?? "3000", 10);

const ctx = await context({
  entryPoints: [
    { in: "src/app.ts", out: "app" },
    { in: "styles/index.css", out: "style" },
  ],
  bundle: true,
  sourcemap: true,
  splitting: true,
  outdir: "dist",
  format: "esm",
  loader: {
    ".md": "text",
  },
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
        headers: createUpstreamHeaders(req.headers, "api.rmfon.pl"),
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

    if (req.url?.startsWith("/api/eska/")) {
      const targetPath = req.url.replace(/^\/api\/eska/, "");

      const options = {
        hostname: "front-api.grupazprmedia.pl",
        port: 443,
        path: targetPath,
        method: req.method,
        headers: createUpstreamHeaders(req.headers, "front-api.grupazprmedia.pl"),
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

    if (req.url?.startsWith("/api/trojka/")) {
      const targetPath = req.url.replace(/^\/api\/trojka/, "");

      const options = {
        hostname: "trojka.polskieradio.pl",
        port: 443,
        path: targetPath,
        method: req.method,
        headers: createUpstreamHeaders(req.headers, "trojka.polskieradio.pl"),
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

    if (req.url?.startsWith("/api/leliwa/")) {
      const targetPath = req.url.replace(/^\/api\/leliwa/, "");

      const options = {
        hostname: "streaming.g-news.pl",
        port: 443,
        path: targetPath,
        method: req.method,
        headers: createUpstreamHeaders(req.headers, "streaming.g-news.pl"),
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
    const pathname = resolvePublicPathname(new URL(req.url ?? "/", "http://localhost").pathname);
    let filePath = pathname === "/" ? "./index.html" : "";
    if (pathname !== "/") {
      const distPath = `./dist${pathname}`;
      const publicPath = `./public${pathname}`;
      if (fs.existsSync(distPath) && !fs.statSync(distPath).isDirectory()) {
        filePath = distPath;
      } else if (fs.existsSync(publicPath) && !fs.statSync(publicPath).isDirectory()) {
        filePath = publicPath;
      }
    }

    if (!filePath) {
      res.writeHead(404);
      res.end("Not found");
      return;
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
        ".webp": "image/webp",
        ".png": "image/png",
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".svg": "image/svg+xml",
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
  .listen(port, "0.0.0.0", () => {
    console.log(`Dev server running at http://localhost:${port}`);
    for (const addresses of Object.values(os.networkInterfaces())) {
      for (const address of addresses ?? []) {
        if (address.family === "IPv4" && !address.internal) console.log(`Network: http://${address.address}:${port}`);
      }
    }
  });
