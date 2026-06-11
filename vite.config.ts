import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { createReadStream, statSync } from "node:fs";
import { join, normalize } from "node:path";

const VAULT = join(process.cwd(), "media-vault");
const MIME: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".srt": "text/plain",
  ".md": "text/markdown",
};

// Serve the media vault at /media/* so the dashboard can show generated
// images and assembled video masters inline at the gates. Range requests are
// supported so <video> can seek.
function mediaVault() {
  return {
    name: "media-vault",
    configureServer(server: any) {
      server.middlewares.use("/media", (req: any, res: any, next: any) => {
        try {
          const rel = normalize(decodeURIComponent(req.url.split("?")[0]));
          if (rel.includes("..")) { res.statusCode = 403; return res.end("no"); }
          const file = join(VAULT, rel);
          const stat = statSync(file);
          const ext = file.slice(file.lastIndexOf(".")).toLowerCase();
          res.setHeader("Content-Type", MIME[ext] ?? "application/octet-stream");
          const range = req.headers.range;
          if (range && /^bytes=/.test(range)) {
            const [s, e] = range.replace("bytes=", "").split("-");
            const start = Number(s);
            const end = e ? Number(e) : stat.size - 1;
            res.statusCode = 206;
            res.setHeader("Accept-Ranges", "bytes");
            res.setHeader("Content-Range", `bytes ${start}-${end}/${stat.size}`);
            res.setHeader("Content-Length", end - start + 1);
            return createReadStream(file, { start, end }).pipe(res);
          }
          res.setHeader("Content-Length", stat.size);
          createReadStream(file).pipe(res);
        } catch {
          next();
        }
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), mediaVault()],
  server: { port: 5180 },
});
