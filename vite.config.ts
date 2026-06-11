import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { createReadStream, createWriteStream, statSync, mkdirSync, existsSync } from "node:fs";
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
      // POST /media-upload?slug=<story>&name=<filename> — body is the raw file.
      // Liz attaches assets she made elsewhere (Higgsfield with reference
      // images, screenshots…) straight into a story's design folder.
      server.middlewares.use("/media-upload", (req: any, res: any) => {
        if (req.method !== "POST") { res.statusCode = 405; return res.end(); }
        const url = new URL(req.url, "http://x");
        const slug = (url.searchParams.get("slug") ?? "").replace(/[^a-z0-9-]/gi, "");
        const name = (url.searchParams.get("name") ?? "upload.png").replace(/[^a-zA-Z0-9._ -]/g, "");
        if (!slug) { res.statusCode = 400; return res.end("missing slug"); }
        const dir = join(VAULT, slug, "design", "uploads");
        mkdirSync(dir, { recursive: true });
        let file = join(dir, name);
        if (existsSync(file)) {
          file = join(dir, `${Date.now()}-${name}`);
        }
        const out = createWriteStream(file);
        req.pipe(out);
        out.on("finish", () => {
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify({ path: file }));
        });
        out.on("error", () => { res.statusCode = 500; res.end("write failed"); });
      });
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
