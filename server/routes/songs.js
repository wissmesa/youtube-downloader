import { Router } from "express";
import pool from "../db.js";
import { authMiddleware } from "./auth.js";

const router = Router();

function normalizeUrl(raw) {
  try {
    const parsed = new URL(raw);
    if (/youtube\.com/.test(parsed.hostname)) {
      const v = parsed.searchParams.get("v");
      if (v) return `https://www.youtube.com/watch?v=${v}`;
    }
    if (/youtu\.be/.test(parsed.hostname)) {
      return `https://www.youtube.com/watch?v=${parsed.pathname.slice(1)}`;
    }
    return `${parsed.origin}${parsed.pathname}`.replace(/\/$/, "");
  } catch {
    return raw;
  }
}

router.use(authMiddleware);

router.get("/", async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT * FROM songs WHERE created_by = $1 ORDER BY created_at DESC",
      [req.user.id]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: "Error al obtener canciones" });
  }
});

router.post("/", async (req, res) => {
  const { name, url: rawUrl, platform, thumbnail, channel, duration } = req.body;

  if (!name || !rawUrl) {
    return res.status(400).json({ error: "Nombre y URL son requeridos" });
  }

  const url = normalizeUrl(rawUrl);

  try {
    const result = await pool.query(
      `INSERT INTO songs (name, url, platform, thumbnail, channel, duration, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (url, created_by) DO UPDATE SET name = EXCLUDED.name
       RETURNING *`,
      [name, url, platform || "youtube", thumbnail || null, channel || null, duration || null, req.user.id]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error("[songs] Error:", err.message);
    res.status(500).json({ error: "Error al guardar canción" });
  }
});

router.delete("/:id", async (req, res) => {
  try {
    await pool.query("DELETE FROM songs WHERE id = $1 AND created_by = $2", [req.params.id, req.user.id]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: "Error al eliminar canción" });
  }
});

export default router;
