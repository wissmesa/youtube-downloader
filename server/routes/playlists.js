import { Router } from "express";
import pool from "../db.js";
import { authMiddleware } from "./auth.js";

const router = Router();

router.use(authMiddleware);

router.get("/", async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT p.*, u.name AS creator_name
       FROM playlists p
       LEFT JOIN users u ON u.id = p.created_by
       ORDER BY p.created_at DESC`
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: "Error al obtener playlists" });
  }
});

router.post("/", async (req, res) => {
  const { name } = req.body;
  if (!name) return res.status(400).json({ error: "Nombre requerido" });

  try {
    const result = await pool.query(
      "INSERT INTO playlists (name, songs, created_by) VALUES ($1, $2, $3) RETURNING *",
      [name, "{}", req.user.id]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: "Error al crear playlist" });
  }
});

router.put("/:id", async (req, res) => {
  const { name, songs } = req.body;
  try {
    const result = await pool.query(
      "UPDATE playlists SET name = COALESCE($1, name), songs = COALESCE($2, songs) WHERE id = $3 RETURNING *",
      [name || null, songs || null, req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: "Playlist no encontrada" });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: "Error al actualizar playlist" });
  }
});

router.post("/:id/songs", async (req, res) => {
  const { songId } = req.body;
  if (!songId) return res.status(400).json({ error: "songId requerido" });

  try {
    const result = await pool.query(
      "UPDATE playlists SET songs = array_append(songs, $1) WHERE id = $2 AND NOT ($1 = ANY(songs)) RETURNING *",
      [songId, req.params.id]
    );
    if (result.rows.length === 0) {
      const existing = await pool.query("SELECT * FROM playlists WHERE id = $1", [req.params.id]);
      if (existing.rows.length === 0) return res.status(404).json({ error: "Playlist no encontrada" });
      return res.json(existing.rows[0]);
    }
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: "Error al agregar canción" });
  }
});

router.delete("/:id/songs/:songId", async (req, res) => {
  try {
    const result = await pool.query(
      "UPDATE playlists SET songs = array_remove(songs, $1) WHERE id = $2 RETURNING *",
      [parseInt(req.params.songId), req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: "Playlist no encontrada" });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: "Error al eliminar canción de playlist" });
  }
});

router.delete("/:id", async (req, res) => {
  try {
    await pool.query("DELETE FROM playlists WHERE id = $1", [req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: "Error al eliminar playlist" });
  }
});

export default router;
