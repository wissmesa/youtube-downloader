import express from "express";
import cors from "cors";
import { spawn } from "child_process";
import path from "path";
import fs from "fs";
import os from "node:os";
import { randomUUID } from "crypto";
import { fileURLToPath } from "url";
import { initDB } from "./db.js";
import authRoutes from "./routes/auth.js";
import songsRoutes from "./routes/songs.js";
import playlistsRoutes from "./routes/playlists.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
const PORT = process.env.PORT || 3001;
const DOWNLOADS_DIR = path.resolve("downloads");
const CLIENT_DIST = path.resolve(__dirname, "../client/dist");
const YT_DLP_TIMEOUT = 30_000;
const DOWNLOAD_TIMEOUT = 180_000;

if (!fs.existsSync(DOWNLOADS_DIR)) {
  fs.mkdirSync(DOWNLOADS_DIR, { recursive: true });
}

app.use(cors());
app.use(express.json());

function log(tag, ...args) {
  const ts = new Date().toISOString().slice(11, 23);
  console.log(`[${ts}][${tag}]`, ...args);
}

const SUPPORTED_HOSTS = [
  /youtube\.com/,
  /youtu\.be/,
  /soundcloud\.com/,
];

function isValidUrl(url) {
  try {
    const parsed = new URL(url);
    return SUPPORTED_HOSTS.some(re => re.test(parsed.hostname));
  } catch {
    return false;
  }
}

function cleanUrl(url) {
  try {
    const parsed = new URL(url);
    if (parsed.hostname.includes("youtube.com")) {
      const videoId = parsed.searchParams.get("v");
      if (videoId) return `https://www.youtube.com/watch?v=${videoId}`;
    }
    return url;
  } catch {
    return url;
  }
}

function detectPlatform(url) {
  try {
    const host = new URL(url).hostname;
    if (/youtube|youtu\.be/.test(host)) return "youtube";
    if (/soundcloud/.test(host)) return "soundcloud";
    return "unknown";
  } catch {
    return "unknown";
  }
}

function isPlaylistUrl(url) {
  try {
    const parsed = new URL(url);
    return (parsed.hostname.includes("youtube.com") && parsed.pathname === "/playlist" && parsed.searchParams.has("list"))
      || (parsed.hostname.includes("youtube.com") && parsed.searchParams.has("list") && parsed.searchParams.has("v"));
  } catch {
    return false;
  }
}

function getPlaylistUrl(url) {
  try {
    const parsed = new URL(url);
    const listId = parsed.searchParams.get("list");
    if (listId) return `https://www.youtube.com/playlist?list=${listId}`;
    return url;
  } catch {
    return url;
  }
}

const COOKIES_FILE = path.resolve(__dirname, "cookies.txt");

/**
 * Cookies para yt-dlp (YouTube):
 * - Local: coloca `server/cookies.txt` (Netscape) o regenera Base64 con:
 *   `base64 -i server/cookies.txt | tr -d '\n' > server/cookies.txt.b64`
 * - Railway: copia el contenido de `server/cookies.txt.b64` (una sola línea) y pégalo en
 *   Railway → tu proyecto → el servicio (Node) → Variables → New Variable
 *   Nombre: YT_DLP_COOKIES_B64  |  Valor: (pegar)  |  marcar como Sensitive si existe la opción.
 * Prioridad al arrancar: variable de entorno YT_DLP_COOKIES_B64 > archivo cookies.txt
 */
function resolveCookiesPath() {
  const b64 = process.env.YT_DLP_COOKIES_B64?.trim();
  if (b64) {
    try {
      const raw = Buffer.from(b64.replace(/\s/g, ""), "base64").toString("utf8");
      const tmp = path.join(os.tmpdir(), "youtube-cookies.txt");
      fs.writeFileSync(tmp, raw, "utf8");
      log("server", "Cookies cargadas desde variable YT_DLP_COOKIES_B64 →", tmp);
      return tmp;
    } catch (e) {
      log("server", "YT_DLP_COOKIES_B64 inválida:", e.message);
    }
  }
  if (fs.existsSync(COOKIES_FILE)) {
    log("server", "Archivo de cookies encontrado:", COOKIES_FILE);
    return COOKIES_FILE;
  }
  return null;
}

const cookiesPathForYtdlp = resolveCookiesPath();
const hasCookies = Boolean(cookiesPathForYtdlp);

function ytdlpArgs(extra = []) {
  const base = ["--no-warnings"];
  if (hasCookies) base.push("--cookies", cookiesPathForYtdlp);
  return [...base, ...extra];
}

function spawnWithTimeout(cmd, args, timeoutMs) {
  const proc = spawn(cmd, args);
  const timer = setTimeout(() => {
    log("timeout", `Proceso ${cmd} excedió ${timeoutMs}ms, matando...`);
    proc.kill("SIGKILL");
  }, timeoutMs);
  proc.on("close", () => clearTimeout(timer));
  proc.on("error", () => clearTimeout(timer));
  return proc;
}

// Estado de descargas en memoria
const downloads = new Map();

// ─── Info del video ────────────────────────────────────────────
app.post("/api/info", (req, res) => {
  const rawUrl = req.body.url;
  log("info", "Solicitud recibida:", rawUrl);

  if (!rawUrl || !isValidUrl(rawUrl)) {
    log("info", "URL no válida:", rawUrl);
    return res.status(400).json({ error: "URL no soportada. Usa YouTube o SoundCloud." });
  }

  const url = cleanUrl(rawUrl);
  const platform = detectPlatform(url);
  log("info", `[${platform}] URL limpia:`, url);

  const ytdlp = spawnWithTimeout("yt-dlp", ytdlpArgs([
    "--dump-json",
    "--no-download",
    "--no-playlist",
    url,
  ]), YT_DLP_TIMEOUT);

  let data = "";
  let stderrData = "";

  ytdlp.stdout.on("data", (chunk) => {
    data += chunk;
  });

  ytdlp.stderr.on("data", (chunk) => {
    stderrData += chunk;
    log("info", "stderr:", chunk.toString().trim());
  });

  ytdlp.on("error", (err) => {
    log("info", "ERROR spawn:", err.message);
    if (!res.headersSent) {
      res.status(500).json({ error: "yt-dlp no encontrado. Instálalo con: brew install yt-dlp" });
    }
  });

  ytdlp.on("close", (code, signal) => {
    log("info", `Proceso terminó — code: ${code}, signal: ${signal}`);
    if (res.headersSent) return;

    if (signal === "SIGKILL") {
      return res.status(504).json({ error: "Tiempo de espera agotado" });
    }
    if (code !== 0) {
      log("info", "stderr:", stderrData);
      const detail = stderrData.trim().split("\n").pop() || "Error desconocido";
      return res.status(500).json({ error: `yt-dlp error: ${detail}` });
    }

    try {
      const info = JSON.parse(data);
      log("info", "OK:", info.title);
      res.json({
        title: info.title,
        thumbnail: info.thumbnail,
        duration: info.duration_string || "",
        channel: info.channel || info.uploader || "",
        platform,
      });
    } catch (e) {
      log("info", "Error parseando JSON:", e.message);
      res.status(500).json({ error: "Error procesando info del video" });
    }
  });
});

// ─── Info de playlist (retorna lista de videos) ──────────────
app.post("/api/playlist-info", (req, res) => {
  const rawUrl = req.body.url;
  log("playlist", "Solicitud recibida:", rawUrl);

  if (!rawUrl || !isPlaylistUrl(rawUrl)) {
    return res.status(400).json({ error: "URL de playlist no válida" });
  }

  const url = getPlaylistUrl(rawUrl);
  log("playlist", "URL playlist:", url);

  const PLAYLIST_TIMEOUT = 60_000;
  const ytdlp = spawnWithTimeout("yt-dlp", ytdlpArgs([
    "--flat-playlist",
    "--dump-json",
    url,
  ]), PLAYLIST_TIMEOUT);

  let data = "";
  let stderrData = "";

  ytdlp.stdout.on("data", (chunk) => { data += chunk; });
  ytdlp.stderr.on("data", (chunk) => { stderrData += chunk; });

  ytdlp.on("error", (err) => {
    log("playlist", "ERROR:", err.message);
    if (!res.headersSent) {
      res.status(500).json({ error: "Error al procesar playlist" });
    }
  });

  ytdlp.on("close", (code, signal) => {
    if (res.headersSent) return;

    if (signal === "SIGKILL") {
      return res.status(504).json({ error: "Tiempo de espera agotado" });
    }
    if (code !== 0) {
      const detail = stderrData.trim().split("\n").pop() || "Error desconocido";
      return res.status(500).json({ error: `yt-dlp error: ${detail}` });
    }

    try {
      const lines = data.trim().split("\n").filter(Boolean);
      const videos = lines.map(line => {
        const info = JSON.parse(line);
        let videoUrl = info.webpage_url || info.url || "";
        if (videoUrl && !videoUrl.startsWith("http")) {
          videoUrl = `https://www.youtube.com/watch?v=${videoUrl}`;
        }
        return {
          url: videoUrl,
          title: info.title || "Sin título",
          duration: info.duration_string || info.duration
            ? `${Math.floor((info.duration || 0) / 60)}:${String((info.duration || 0) % 60).padStart(2, "0")}`
            : "",
          channel: info.channel || info.uploader || "",
          thumbnail: info.thumbnails?.[0]?.url || info.thumbnail || "",
        };
      }).filter(v => v.url);

      log("playlist", `OK: ${videos.length} videos encontrados`);
      res.json({ videos });
    } catch (e) {
      log("playlist", "Error parseando:", e.message);
      res.status(500).json({ error: "Error procesando playlist" });
    }
  });
});

// ─── Iniciar descarga (retorna fileId, descarga en background) ─
app.post("/api/download", (req, res) => {
  const rawUrl = req.body.url;
  log("download", "Solicitud recibida:", rawUrl);

  if (!rawUrl || !isValidUrl(rawUrl)) {
    log("download", "URL no válida");
    return res.status(400).json({ error: "URL no soportada. Usa YouTube o SoundCloud." });
  }

  const url = cleanUrl(rawUrl);
  const fileId = randomUUID();
  const outputTemplate = path.join(DOWNLOADS_DIR, `${fileId}.%(ext)s`);
  log("download", "fileId:", fileId, "| URL:", url);

  const state = { status: "downloading", progress: 0, error: null };
  downloads.set(fileId, state);

  res.json({ fileId });

  const ytdlp = spawnWithTimeout("yt-dlp", ytdlpArgs([
    "-x",
    "--audio-format", "mp3",
    "--audio-quality", "0",
    "-o", outputTemplate,
    "--no-playlist",
    "--newline",
    url,
  ]), DOWNLOAD_TIMEOUT);

  ytdlp.stderr.on("data", (chunk) => {
    const text = chunk.toString();
    log("download", `[${fileId.slice(0, 8)}] stderr:`, text.trim());
    const match = text.match(/(\d+\.?\d*)%/);
    if (match) state.progress = parseFloat(match[1]);
  });

  ytdlp.stdout.on("data", (chunk) => {
    const text = chunk.toString();
    log("download", `[${fileId.slice(0, 8)}] stdout:`, text.trim());
    const match = text.match(/(\d+\.?\d*)%/);
    if (match) state.progress = parseFloat(match[1]);
  });

  ytdlp.on("error", (err) => {
    log("download", `[${fileId.slice(0, 8)}] ERROR spawn:`, err.message);
    state.status = "error";
    state.error = "No se pudo iniciar la descarga";
  });

  ytdlp.on("close", (code, signal) => {
    log("download", `[${fileId.slice(0, 8)}] Proceso terminó — code: ${code}, signal: ${signal}`);

    if (signal === "SIGKILL") {
      state.status = "error";
      state.error = "Tiempo de espera agotado";
      return;
    }
    if (code !== 0) {
      state.status = "error";
      state.error = "Error al descargar el audio";
      return;
    }

    const mp3Path = path.join(DOWNLOADS_DIR, `${fileId}.mp3`);
    if (fs.existsSync(mp3Path)) {
      const sizeKB = (fs.statSync(mp3Path).size / 1024).toFixed(0);
      log("download", `[${fileId.slice(0, 8)}] MP3 listo: ${sizeKB} KB`);
      state.status = "done";
      state.progress = 100;
    } else {
      log("download", `[${fileId.slice(0, 8)}] MP3 no encontrado`);
      const files = fs.readdirSync(DOWNLOADS_DIR).filter(f => f.startsWith(fileId));
      log("download", `[${fileId.slice(0, 8)}] Archivos:`, files);
      state.status = "error";
      state.error = "No se generó el archivo MP3";
    }

    setTimeout(() => downloads.delete(fileId), 300_000);
  });
});

// ─── Consultar progreso ────────────────────────────────────────
app.get("/api/status/:fileId", (req, res) => {
  const { fileId } = req.params;
  const state = downloads.get(fileId);

  if (!state) {
    return res.status(404).json({ error: "Descarga no encontrada" });
  }

  log("status", `[${fileId.slice(0, 8)}] ${state.status} ${state.progress}%`);
  res.json(state);
});

// ─── Servir archivo MP3 ───────────────────────────────────────
app.get("/api/file/:fileId", (req, res) => {
  const { fileId } = req.params;
  log("file", "Solicitud:", fileId);

  if (!/^[\w-]+$/.test(fileId)) {
    return res.status(400).json({ error: "ID no válido" });
  }

  const filePath = path.join(DOWNLOADS_DIR, `${fileId}.mp3`);

  if (!fs.existsSync(filePath)) {
    log("file", "No encontrado:", filePath);
    return res.status(404).json({ error: "Archivo no encontrado" });
  }

  const sizeKB = (fs.statSync(filePath).size / 1024).toFixed(0);
  log("file", `Enviando: ${sizeKB} KB`);

  const fileName = req.query.name ? `${req.query.name}.mp3` : "audio.mp3";
  res.download(filePath, fileName, (err) => {
    if (err) {
      log("file", "Error enviando:", err.message);
    } else {
      log("file", "Enviado OK, se borrará en 60s");
      setTimeout(() => fs.unlink(filePath, () => {}), 60_000);
    }
  });
});

// ─── Auth, Songs, Playlists ──────────────────────────────────
app.use("/api/auth", authRoutes);
app.use("/api/songs", songsRoutes);
app.use("/api/playlists", playlistsRoutes);

// ─── Health check ─────────────────────────────────────────────
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", port: PORT });
});

// ─── Servir frontend (build de React) ─────────────────────────
if (fs.existsSync(CLIENT_DIST)) {
  app.use(express.static(CLIENT_DIST));
  app.get("*", (req, res) => {
    if (req.path.startsWith("/api")) {
      return res.status(404).json({ error: "Endpoint no encontrado" });
    }
    res.sendFile(path.join(CLIENT_DIST, "index.html"));
  });
  log("server", `Sirviendo frontend desde ${CLIENT_DIST}`);
}

initDB().catch((err) => log("db", "Error inicializando DB:", err.message));

const server = app.listen(PORT, "0.0.0.0", () => {
  log("server", `Servidor corriendo en 0.0.0.0:${PORT}`);
});

server.on("error", (err) => {
  if (err.code === "EADDRINUSE") {
    log("server", `ERROR: Puerto ${PORT} en uso. Ejecuta: lsof -ti:${PORT} | xargs kill -9`);
  } else {
    log("server", "ERROR:", err.message);
  }
  process.exit(1);
});
