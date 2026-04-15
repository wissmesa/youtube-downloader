import pg from "pg";

if (!process.env.DATABASE_URL) {
  console.error("[db] ERROR: DATABASE_URL no está definida. Agrega un archivo .env con DATABASE_URL.");
  process.exit(1);
}

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

export async function initDB() {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        email VARCHAR(255) UNIQUE NOT NULL,
        password VARCHAR(255) NOT NULL,
        name VARCHAR(255) NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS songs (
        id SERIAL PRIMARY KEY,
        name VARCHAR(500) NOT NULL,
        url TEXT NOT NULL,
        platform VARCHAR(50) DEFAULT 'youtube',
        thumbnail TEXT,
        channel VARCHAR(255),
        duration VARCHAR(50),
        created_at TIMESTAMPTZ DEFAULT NOW(),
        created_by INTEGER REFERENCES users(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS playlists (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        songs INTEGER[] DEFAULT '{}',
        created_at TIMESTAMPTZ DEFAULT NOW(),
        created_by INTEGER REFERENCES users(id) ON DELETE CASCADE
      );
    `);
    console.log("[db] Tablas inicializadas");
  } finally {
    client.release();
  }
}

export default pool;
