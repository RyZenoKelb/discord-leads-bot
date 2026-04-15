/**
 * schema.ts — Crée les tables SQLite au démarrage + migrations.
 * Table "leads" : stocke chaque business trouvé (avec scoring).
 * Table "filter_presets" : stocke les presets de filtres par guild/user.
 * Table "scan_jobs" : suivi des scans en cours.
 * Table "call_sessions" : curseur call queue par utilisateur.
 * Table "settings" : paramètres persistants (ex: stats_message_id).
 * Table "lead_emails" : enrichissement et envoi d'emails.
 * Table "lead_notes" : notes / commentaires + raisons de rappel.
 * Table "activities" : suivi des activités quotidiennes.
 */

import Database from "better-sqlite3";
import path from "path";
import { logger } from "../utils/logger";

const DB_PATH = path.resolve(process.cwd(), "leads.db");

let db: Database.Database;

export function getDb(): Database.Database {
  if (!db) {
    db = new Database(DB_PATH);
    db.pragma("journal_mode = WAL"); // Performances en écriture
    db.pragma("foreign_keys = ON");
    logger.info(`📦 Base de données SQLite ouverte : ${DB_PATH}`);
    createTables();
    runMigrations();
  }
  return db;
}

function createTables(): void {
  const d = getDb();

  d.exec(`
    CREATE TABLE IF NOT EXISTS leads (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      place_id      TEXT    UNIQUE NOT NULL,
      name          TEXT    NOT NULL,
      address       TEXT,
      phone         TEXT,
      website       TEXT,
      email         TEXT,
      rating        REAL,
      reviews       INTEGER,
      types         TEXT,
      no_website    INTEGER DEFAULT 0,
      social_only   INTEGER DEFAULT 0,
      french_business INTEGER DEFAULT 0,
      status        TEXT    DEFAULT 'NEW',
      google_maps_url TEXT,
      scan_query    TEXT,
      scan_city     TEXT,
      guild_id      TEXT,
      scanned_at    TEXT    DEFAULT (datetime('now')),
      updated_at    TEXT    DEFAULT (datetime('now')),
      lead_score    INTEGER NOT NULL DEFAULT 0,
      followup_at   TEXT,
      last_contacted_at TEXT,
      call_owner_id TEXT,
      call_queue_at TEXT,
      tags          TEXT
    );
  `);

  d.exec(`
    CREATE TABLE IF NOT EXISTS filter_presets (
      id        INTEGER PRIMARY KEY AUTOINCREMENT,
      guild_id  TEXT    NOT NULL,
      user_id   TEXT    NOT NULL,
      name      TEXT    NOT NULL,
      config    TEXT    NOT NULL,
      created_at TEXT   DEFAULT (datetime('now')),
      UNIQUE(guild_id, name)
    );
  `);

  d.exec(`
    CREATE TABLE IF NOT EXISTS scan_jobs (
      id          TEXT PRIMARY KEY,
      guild_id    TEXT NOT NULL,
      user_id     TEXT NOT NULL,
      query       TEXT,
      city        TEXT,
      status      TEXT DEFAULT 'RUNNING',
      total_found INTEGER DEFAULT 0,
      total_kept  INTEGER DEFAULT 0,
      total_nosite INTEGER DEFAULT 0,
      started_at  TEXT DEFAULT (datetime('now')),
      finished_at TEXT
    );
  `);

  d.exec(`
    CREATE TABLE IF NOT EXISTS call_sessions (
      user_id          TEXT PRIMARY KEY,
      current_place_id TEXT,
      updated_at       TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  d.exec(`
    CREATE TABLE IF NOT EXISTS settings (
      key   TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);

  // ─── Lead Emails ──────────────────────────────
  d.exec(`
    CREATE TABLE IF NOT EXISTS lead_emails (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      place_id    TEXT    NOT NULL,
      email       TEXT    NOT NULL,
      source      TEXT    DEFAULT 'scraped',
      status      TEXT    DEFAULT 'found',
      sent_at     TEXT,
      subject     TEXT,
      template    TEXT,
      error       TEXT,
      created_at  TEXT    DEFAULT (datetime('now')),
      FOREIGN KEY (place_id) REFERENCES leads(place_id)
    );
  `);

  // ─── Lead Notes ───────────────────────────────
  d.exec(`
    CREATE TABLE IF NOT EXISTS lead_notes (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      place_id    TEXT    NOT NULL,
      user_id     TEXT    NOT NULL,
      user_tag    TEXT,
      type        TEXT    DEFAULT 'note',
      reason      TEXT,
      content     TEXT    NOT NULL,
      created_at  TEXT    DEFAULT (datetime('now')),
      FOREIGN KEY (place_id) REFERENCES leads(place_id)
    );
  `);

  // ─── Activities ───────────────────────────────
  d.exec(`
    CREATE TABLE IF NOT EXISTS activities (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      guild_id    TEXT    NOT NULL,
      user_id     TEXT    NOT NULL,
      user_tag    TEXT,
      type        TEXT    NOT NULL,
      place_id    TEXT,
      details     TEXT,
      revenue     REAL    DEFAULT 0,
      created_at  TEXT    DEFAULT (datetime('now'))
    );
  `);

  logger.info("✅ Tables créées / vérifiées.");
}

/** Migrations sûres — ALTER TABLE IF NOT EXISTS via pragma */
function runMigrations(): void {
  const d = getDb();

  // Vérifier si les nouvelles colonnes existent déjà, sinon les ajouter
  const columns = d.prepare("PRAGMA table_info(leads)").all() as Array<{ name: string }>;
  const colNames = new Set(columns.map((c) => c.name));

  const migrations: Array<{ col: string; sql: string }> = [
    { col: "lead_score", sql: "ALTER TABLE leads ADD COLUMN lead_score INTEGER NOT NULL DEFAULT 0" },
    { col: "followup_at", sql: "ALTER TABLE leads ADD COLUMN followup_at TEXT" },
    { col: "last_contacted_at", sql: "ALTER TABLE leads ADD COLUMN last_contacted_at TEXT" },
    { col: "call_owner_id", sql: "ALTER TABLE leads ADD COLUMN call_owner_id TEXT" },
    { col: "call_queue_at", sql: "ALTER TABLE leads ADD COLUMN call_queue_at TEXT" },
    { col: "tags", sql: "ALTER TABLE leads ADD COLUMN tags TEXT" },
    // ─── New columns for email/notes/activity ───
    { col: "last_emailed_at", sql: "ALTER TABLE leads ADD COLUMN last_emailed_at TEXT" },
    { col: "last_called_at", sql: "ALTER TABLE leads ADD COLUMN last_called_at TEXT" },
    { col: "email_status", sql: "ALTER TABLE leads ADD COLUMN email_status TEXT DEFAULT 'none'" },
  ];

  let migrated = 0;
  for (const m of migrations) {
    if (!colNames.has(m.col)) {
      d.exec(m.sql);
      migrated++;
      logger.info(`🔄 Migration: ajout colonne '${m.col}' à leads`);
    }
  }

  // Créer index pour performances call queue
  d.exec(`CREATE INDEX IF NOT EXISTS idx_leads_score ON leads (lead_score DESC)`);
  d.exec(`CREATE INDEX IF NOT EXISTS idx_leads_status ON leads (status)`);
  d.exec(`CREATE INDEX IF NOT EXISTS idx_leads_followup ON leads (followup_at)`);
  d.exec(`CREATE INDEX IF NOT EXISTS idx_leads_guild_status ON leads (guild_id, status)`);

  // ─── New indexes ──────────────────────────────
  d.exec(`CREATE INDEX IF NOT EXISTS idx_lead_emails_place ON lead_emails (place_id)`);
  d.exec(`CREATE INDEX IF NOT EXISTS idx_lead_notes_place ON lead_notes (place_id)`);
  d.exec(`CREATE INDEX IF NOT EXISTS idx_activities_guild_date ON activities (guild_id, created_at)`);
  d.exec(`CREATE INDEX IF NOT EXISTS idx_activities_user ON activities (user_id, created_at)`);
  d.exec(`CREATE INDEX IF NOT EXISTS idx_leads_email_status ON leads (email_status)`);

  if (migrated > 0) {
    logger.info(`✅ ${migrated} migration(s) appliquée(s).`);
  }
}
