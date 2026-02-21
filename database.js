const { open } = require("sqlite");
const sqlite3 = require("sqlite3");
const path = require("path");
const logger = require("./utils/logger");

let db;
const DB_PATH =
  process.env.TRAKT_DB_PATH ||
  (process.env.VERCEL === "1"
    ? path.join("/tmp", "trakt_tokens.db")
    : path.join(__dirname, "trakt_tokens.db"));

async function initDb() {
  try {
    db = await open({
      filename: DB_PATH,
      driver: sqlite3.Database,
    });

    // Create the tokens table if it doesn't exist
    await db.exec(`
      CREATE TABLE IF NOT EXISTS tokens (
        trakt_username TEXT PRIMARY KEY,
        access_token TEXT NOT NULL,
        refresh_token TEXT NOT NULL,
        expires_at INTEGER NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create a trigger to automatically update the updated_at timestamp
    await db.exec(`
      CREATE TRIGGER IF NOT EXISTS update_tokens_updated_at
      AFTER UPDATE ON tokens
      FOR EACH ROW
      BEGIN
        UPDATE tokens SET updated_at = CURRENT_TIMESTAMP WHERE trakt_username = OLD.trakt_username;
      END;
    `);

    logger.info("Database initialized successfully.", { dbPath: DB_PATH });
  } catch (error) {
    logger.error("Failed to initialize database", { error: error.message, stack: error.stack });
    throw error;
  }
}

/**
 * Stores or updates Trakt tokens for a user.
 */
async function storeTokens(username, accessToken, refreshToken, expiresIn) {
  if (!db) {
    logger.error("Database not initialized; cannot store tokens", { username });
    return;
  }
  const expiresAt = Date.now() + expiresIn * 1000;
  try {
    await db.run(
      `INSERT INTO tokens (trakt_username, access_token, refresh_token, expires_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(trakt_username) DO UPDATE SET
         access_token = excluded.access_token,
         refresh_token = excluded.refresh_token,
         expires_at = excluded.expires_at`,
      [username, accessToken, refreshToken, expiresAt]
    );
    logger.info(`Tokens stored successfully for user: ${username}`);
  } catch (error) {
    logger.error(`Failed to store tokens for user: ${username}`, { error: error.message });
  }
}

/**
 * Retrieves Trakt tokens for a user.
 */
async function getTokens(username) {
  if (!db) {
    logger.error("Database not initialized; cannot get tokens", { username });
    return null;
  }
  try {
    const tokenData = await db.get("SELECT * FROM tokens WHERE trakt_username = ?", [username]);
    if (tokenData) {
      logger.debug(`Tokens retrieved for user: ${username}`);
    } else {
      logger.warn(`No tokens found for user: ${username}`);
    }
    return tokenData;
  } catch (error) {
    logger.error(`Failed to retrieve tokens for user: ${username}`, { error: error.message });
    return null;
  }
}

module.exports = { initDb, storeTokens, getTokens };
