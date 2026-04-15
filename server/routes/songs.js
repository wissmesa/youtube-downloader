import { Router } from "express";
import pool from "../db.js";
import { authMiddleware } from "./auth.js";

const router = Router();

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
  const { name, url, platform, thumbnail, channel, duration } = req.body;

  if (!name || !url) {
    return res.status(400).json({ error: "Nombre y URL son requeridos" });
  }

  try {
    const existing = await pool.query(
      "SELECT id FROM songs WHERE url = $1 AND created_by = $2",
      [url, req.user.id]
    );
    if (existing.rows.length > 0) {
      return res.json(existing.rows[0]);
    }

    const result = await pool.query(
      `INSERT INTO songs (name, url, platform, thumbnail, channel, duration, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
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
