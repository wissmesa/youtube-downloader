import express from "express";
import cors from "cors";
import { spawn } from "child_process";
import path from "path";
import fs from "fs";
import { randomUUID } from "crypto";
import { fileURLToPath } from "url";

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

function isValidYoutubeUrl(url) {
  return /^(https?:\/\/)?(www\.)?(youtube\.com\/(watch\?v=|shorts\/)|youtu\.be\/)[\w-]+/.test(url);
}

function cleanYoutubeUrl(url) {
  try {
    const parsed = new URL(url);
    if (parsed.hostname.includes("youtu.be")) return url.split("?")[0];
    const videoId = parsed.searchParams.get("v");
    if (videoId) return `https://www.youtube.com/watch?v=${videoId}`;
    return url;
  } catch {
    return url;
  }
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

  if (!rawUrl || !isValidYoutubeUrl(rawUrl)) {
    log("info", "URL no válida");
    return res.status(400).json({ error: "URL de YouTube no válida" });
  }

  const url = cleanYoutubeUrl(rawUrl);
  log("info", "URL limpia:", url);

  const ytdlp = spawnWithTimeout("yt-dlp", [
    "--dump-json",
    "--no-download",
    "--no-playlist",
    "--no-warnings",
    url,
  ], YT_DLP_TIMEOUT);

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
      return res.status(500).json({ error: "No se pudo obtener info del video" });
    }

    try {
      const info = JSON.parse(data);
      log("info", "OK:", info.title);
      res.json({
        title: info.title,
        thumbnail: info.thumbnail,
        duration: info.duration_string,
        channel: info.channel,
      });
    } catch (e) {
      log("info", "Error parseando JSON:", e.message);
      res.status(500).json({ error: "Error procesando info del video" });
    }
  });
});

// ─── Iniciar descarga (retorna fileId, descarga en background) ─
app.post("/api/download", (req, res) => {
  const rawUrl = req.body.url;
  log("download", "Solicitud recibida:", rawUrl);

  if (!rawUrl || !isValidYoutubeUrl(rawUrl)) {
    log("download", "URL no válida");
    return res.status(400).json({ error: "URL de YouTube no válida" });
  }

  const url = cleanYoutubeUrl(rawUrl);
  const fileId = randomUUID();
  const outputTemplate = path.join(DOWNLOADS_DIR, `${fileId}.%(ext)s`);
  log("download", "fileId:", fileId, "| URL:", url);

  const state = { status: "downloading", progress: 0, error: null };
  downloads.set(fileId, state);

  res.json({ fileId });

  const ytdlp = spawnWithTimeout("yt-dlp", [
    "-x",
    "--audio-format", "mp3",
    "--audio-quality", "0",
    "-o", outputTemplate,
    "--no-playlist",
    "--newline",
    url,
  ], DOWNLOAD_TIMEOUT);

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

  res.download(filePath, "audio.mp3", (err) => {
    if (err) {
      log("file", "Error enviando:", err.message);
    } else {
      log("file", "Enviado OK, se borrará en 60s");
      setTimeout(() => fs.unlink(filePath, () => {}), 60_000);
    }
  });
});

// ─── Servir frontend (build de React) ─────────────────────────
if (fs.existsSync(CLIENT_DIST)) {
  app.use(express.static(CLIENT_DIST));
  app.get("*", (req, res) => {
    res.sendFile(path.join(CLIENT_DIST, "index.html"));
  });
  log("server", `Sirviendo frontend desde ${CLIENT_DIST}`);
}

const server = app.listen(PORT, () => {
  log("server", `Servidor corriendo en http://localhost:${PORT}`);
});

server.on("error", (err) => {
  if (err.code === "EADDRINUSE") {
    log("server", `ERROR: Puerto ${PORT} en uso. Ejecuta: lsof -ti:${PORT} | xargs kill -9`);
  } else {
    log("server", "ERROR:", err.message);
  }
  process.exit(1);
});
