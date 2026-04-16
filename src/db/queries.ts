/**
 * queries.ts — Toutes les requêtes base de données.
 * CRUD leads, presets, scan jobs, call sessions, settings, stats.
 */

import { getDb } from "./schema";
import { computeLeadScore, buildLeadTags } from "../scoring/computeScore";

// ─── Types ─────────────────────────────────────────

export interface Lead {
  id?: number;
  place_id: string;
  name: string;
  address?: string;
  phone?: string;
  website?: string;
  email?: string;
  rating?: number;
  reviews?: number;
  types?: string;
  no_website: boolean;
  social_only: boolean;
  french_business: boolean;
  status: string;
  google_maps_url?: string;
  scan_query?: string;
  scan_city?: string;
  guild_id?: string;
  scanned_at?: string;
  updated_at?: string;
  lead_score: number;
  followup_at?: string | null;
  last_contacted_at?: string | null;
  call_owner_id?: string | null;
  call_queue_at?: string | null;
  tags?: string | null;
  last_emailed_at?: string | null;
  last_called_at?: string | null;
  email_status?: string | null;
}

export interface FilterPreset {
  id?: number;
  guild_id: string;
  user_id: string;
  name: string;
  config: Record<string, unknown>;
}

export interface ScanJob {
  id: string;
  guild_id: string;
  user_id: string;
  query?: string;
  city?: string;
  status: string;
  total_found: number;
  total_kept: number;
  total_nosite: number;
  started_at?: string;
  finished_at?: string;
}

export interface CallSession {
  user_id: string;
  current_place_id: string | null;
  updated_at: string;
}

export interface LeadEmail {
  id?: number;
  place_id: string;
  email: string;
  source: string;
  status: string;
  sent_at?: string | null;
  subject?: string | null;
  template?: string | null;
  error?: string | null;
  created_at?: string;
}

export interface LeadNote {
  id?: number;
  place_id: string;
  user_id: string;
  user_tag?: string;
  type: string;       // 'note' | 'callback_reason' | 'meeting' | 'refusal'
  reason?: string | null;
  content: string;
  created_at?: string;
}

export type ActivityType =
  | "call"
  | "email_sent"
  | "email_enriched"
  | "meeting"
  | "refusal"
  | "closed"
  | "callback"
  | "note_added"
  | "lead_scanned"
  | "followup";

export interface Activity {
  id?: number;
  guild_id: string;
  user_id: string;
  user_tag?: string;
  type: ActivityType;
  place_id?: string | null;
  details?: string | null;
  revenue: number;
  created_at?: string;
}

export interface DailyStats {
  date: string;
  totalCalls: number;
  totalEmailsSent: number;
  totalEmailsEnriched: number;
  totalMeetings: number;
  totalRefusals: number;
  totalClosed: number;
  totalCallbacks: number;
  totalRevenue: number;
  totalNewLeads: number;
  topUsers: Array<{ user_id: string; user_tag: string; count: number }>;
}

// ...existing code...

/** Transforme une row SQLite en objet Lead propre */
function rowToLead(r: Record<string, unknown>): Lead {
  return {
    ...(r as Record<string, unknown>),
    no_website: !!(r.no_website),
    social_only: !!(r.social_only),
    french_business: !!(r.french_business),
    lead_score: (r.lead_score as number) ?? 0,
    followup_at: (r.followup_at as string) || null,
    last_contacted_at: (r.last_contacted_at as string) || null,
    call_owner_id: (r.call_owner_id as string) || null,
    call_queue_at: (r.call_queue_at as string) || null,
    tags: (r.tags as string) || null,
    last_emailed_at: (r.last_emailed_at as string) || null,
    last_called_at: (r.last_called_at as string) || null,
    email_status: (r.email_status as string) || null,
  } as Lead;
}

// ─── Leads ─────────────────────────────────────────

/** Insère un lead avec score calculé. Retourne true si nouveau, false si déjà existant. */
export function upsertLead(lead: Omit<Lead, "id" | "lead_score" | "tags">): boolean {
  const db = getDb();

  const score = computeLeadScore({
    no_website: lead.no_website,
    social_only: lead.social_only,
    french_business: lead.french_business,
    rating: lead.rating,
    reviews: lead.reviews,
    phone: lead.phone,
    status: lead.status,
  });

  const tags = buildLeadTags({
    no_website: lead.no_website,
    social_only: lead.social_only,
    french_business: lead.french_business,
  });

  const stmt = db.prepare(`
    INSERT INTO leads (place_id, name, address, phone, website, email, rating, reviews, types,
                       no_website, social_only, french_business, status, google_maps_url,
                       scan_query, scan_city, guild_id, lead_score, tags)
    VALUES (@place_id, @name, @address, @phone, @website, @email, @rating, @reviews, @types,
            @no_website, @social_only, @french_business, @status, @google_maps_url,
            @scan_query, @scan_city, @guild_id, @lead_score, @tags)
    ON CONFLICT(place_id) DO UPDATE SET
      phone = COALESCE(excluded.phone, leads.phone),
      website = COALESCE(excluded.website, leads.website),
      rating = COALESCE(excluded.rating, leads.rating),
      reviews = COALESCE(excluded.reviews, leads.reviews),
      lead_score = excluded.lead_score,
      tags = excluded.tags,
      updated_at = datetime('now')
  `);

  const result = stmt.run({
    place_id: lead.place_id,
    name: lead.name,
    address: lead.address || null,
    phone: lead.phone || null,
    website: lead.website || null,
    email: lead.email || null,
    rating: lead.rating ?? null,
    reviews: lead.reviews ?? null,
    types: lead.types || null,
    no_website: lead.no_website ? 1 : 0,
    social_only: lead.social_only ? 1 : 0,
    french_business: lead.french_business ? 1 : 0,
    status: lead.status || "NEW",
    google_maps_url: lead.google_maps_url || null,
    scan_query: lead.scan_query || null,
    scan_city: lead.scan_city || null,
    guild_id: lead.guild_id || null,
    lead_score: score,
    tags,
  });

  return result.changes > 0;
}

/** Met à jour le status d'un lead + recalcule le score */
export function updateLeadStatus(placeId: string, status: string): void {
  const db = getDb();
  db.transaction(() => {
    db.prepare("UPDATE leads SET status = ?, updated_at = datetime('now') WHERE place_id = ?").run(status, placeId);
    // Recalculate score
    const lead = getLeadByPlaceId(placeId);
    if (lead) {
      const newScore = computeLeadScore({
        no_website: lead.no_website,
        social_only: lead.social_only,
        french_business: lead.french_business,
        rating: lead.rating,
        reviews: lead.reviews,
        phone: lead.phone,
        status,
      });
      db.prepare("UPDATE leads SET lead_score = ? WHERE place_id = ?").run(newScore, placeId);
    }
  })();
}

/** Récupère un lead par place_id */
export function getLeadByPlaceId(placeId: string): Lead | undefined {
  const db = getDb();
  const row = db.prepare("SELECT * FROM leads WHERE place_id = ?").get(placeId) as Record<string, unknown> | undefined;
  if (!row) return undefined;
  return rowToLead(row);
}

/** Vérifie si un place_id existe déjà */
export function leadExists(placeId: string): boolean {
  const db = getDb();
  const row = db.prepare("SELECT 1 FROM leads WHERE place_id = ?").get(placeId);
  return !!row;
}

/** Récupère les leads d'un scan (par query + city + guild) */
export function getLeadsByScan(guildId: string, query?: string, city?: string): Lead[] {
  const db = getDb();
  let sql = "SELECT * FROM leads WHERE guild_id = ?";
  const params: unknown[] = [guildId];

  if (query) {
    sql += " AND scan_query = ?";
    params.push(query);
  }
  if (city) {
    sql += " AND scan_city = ?";
    params.push(city);
  }

  sql += " ORDER BY scanned_at DESC";
  const rows = db.prepare(sql).all(...params) as Array<Record<string, unknown>>;
  return rows.map(rowToLead);
}

/** Récupère les leads récents (dernier scan) d'une guild */
export function getRecentLeads(guildId: string, limit: number = 200): Lead[] {
  const db = getDb();
  const rows = db
    .prepare("SELECT * FROM leads WHERE guild_id = ? ORDER BY scanned_at DESC LIMIT ?")
    .all(guildId, limit) as Array<Record<string, unknown>>;
  return rows.map(rowToLead);
}

/** Récupère les leads par plage de dates */
export function getLeadsByDateRange(
  guildId: string,
  from: string,
  to: string
): Lead[] {
  const db = getDb();
  const rows = db
    .prepare(
      "SELECT * FROM leads WHERE guild_id = ? AND scanned_at BETWEEN ? AND ? ORDER BY scanned_at DESC"
    )
    .all(guildId, from, to) as Array<Record<string, unknown>>;
  return rows.map(rowToLead);
}

// ─── Filter Presets ────────────────────────────────

/** Récupère les leads à traiter : status CALL, CHECK ou NEW, triés par score */
export function getActionableLeads(guildId: string): Lead[] {
  const db = getDb();
  const rows = db
    .prepare(
      "SELECT * FROM leads WHERE guild_id = ? AND status IN ('CALL', 'CHECK', 'NEW') ORDER BY lead_score DESC, scanned_at DESC"
    )
    .all(guildId) as Array<Record<string, unknown>>;
  return rows.map(rowToLead);
}

export function savePreset(preset: FilterPreset): void {
  const db = getDb();
  db.prepare(
    `INSERT INTO filter_presets (guild_id, user_id, name, config)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(guild_id, name) DO UPDATE SET config = excluded.config, user_id = excluded.user_id`
  ).run(preset.guild_id, preset.user_id, preset.name, JSON.stringify(preset.config));
}

export function getPreset(guildId: string, name: string): FilterPreset | undefined {
  const db = getDb();
  const row = db
    .prepare("SELECT * FROM filter_presets WHERE guild_id = ? AND name = ?")
    .get(guildId, name) as any;
  if (!row) return undefined;
  return { ...row, config: JSON.parse(row.config) };
}

export function listPresets(guildId: string): FilterPreset[] {
  const db = getDb();
  const rows = db
    .prepare("SELECT * FROM filter_presets WHERE guild_id = ? ORDER BY name")
    .all(guildId) as Array<Record<string, unknown>>;
  return rows.map((r) => ({ ...r, config: JSON.parse(r.config as string) } as FilterPreset));
}

// ─── Scan Jobs ─────────────────────────────────────

export function createScanJob(job: ScanJob): void {
  const db = getDb();
  db.prepare(
    `INSERT INTO scan_jobs (id, guild_id, user_id, query, city, status, total_found, total_kept, total_nosite)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    job.id,
    job.guild_id,
    job.user_id,
    job.query || null,
    job.city || null,
    job.status,
    job.total_found,
    job.total_kept,
    job.total_nosite
  );
}

export function updateScanJob(
  jobId: string,
  updates: Partial<Pick<ScanJob, "status" | "total_found" | "total_kept" | "total_nosite">>
): void {
  const db = getDb();
  const parts: string[] = [];
  const params: unknown[] = [];

  if (updates.status !== undefined) {
    parts.push("status = ?");
    params.push(updates.status);
  }
  if (updates.total_found !== undefined) {
    parts.push("total_found = ?");
    params.push(updates.total_found);
  }
  if (updates.total_kept !== undefined) {
    parts.push("total_kept = ?");
    params.push(updates.total_kept);
  }
  if (updates.total_nosite !== undefined) {
    parts.push("total_nosite = ?");
    params.push(updates.total_nosite);
  }

  if (updates.status === "DONE" || updates.status === "ERROR") {
    parts.push("finished_at = datetime('now')");
  }

  if (parts.length === 0) return;

  params.push(jobId);
  db.prepare(`UPDATE scan_jobs SET ${parts.join(", ")} WHERE id = ?`).run(...params);
}

export function getRunningJobs(guildId: string): ScanJob[] {
  const db = getDb();
  return db
    .prepare("SELECT * FROM scan_jobs WHERE guild_id = ? AND status = 'RUNNING' ORDER BY started_at DESC")
    .all(guildId) as ScanJob[];
}

export function getRecentJobs(guildId: string, limit: number = 10): ScanJob[] {
  const db = getDb();
  return db
    .prepare("SELECT * FROM scan_jobs WHERE guild_id = ? ORDER BY started_at DESC LIMIT ?")
    .all(guildId, limit) as ScanJob[];
}

// ─── Call Queue ────────────────────────────────────

/** Récupère le prochain lead de la call queue pour un user.
 *  Tri: score DESC, reviews DESC, scanned_at DESC.
 *  Exclut IGNORE et DONE. Exclut les leads "pris" par un autre user (sauf > 24h). */
export function getNextCallQueueLead(guildId: string, userId: string, excludePlaceId?: string): Lead | undefined {
  const db = getDb();
  let sql = `
    SELECT * FROM leads
    WHERE guild_id = ?
      AND status NOT IN ('IGNORE', 'DONE')
      AND (call_owner_id IS NULL OR call_owner_id = ? OR
           call_queue_at < datetime('now', '-24 hours'))
  `;
  const params: unknown[] = [guildId, userId];

  if (excludePlaceId) {
    sql += ` AND place_id != ?`;
    params.push(excludePlaceId);
  }

  sql += ` ORDER BY lead_score DESC, reviews DESC, scanned_at DESC LIMIT 1`;

  const row = db.prepare(sql).get(...params) as Record<string, unknown> | undefined;
  return row ? rowToLead(row) : undefined;
}

/** Sauvegarde / met à jour la session call queue d'un user */
export function upsertCallSession(userId: string, placeId: string | null): void {
  const db = getDb();
  db.prepare(`
    INSERT INTO call_sessions (user_id, current_place_id, updated_at)
    VALUES (?, ?, datetime('now'))
    ON CONFLICT(user_id) DO UPDATE SET
      current_place_id = excluded.current_place_id,
      updated_at = datetime('now')
  `).run(userId, placeId);
}

/** Récupère la session call queue d'un user */
export function getCallSession(userId: string): CallSession | undefined {
  const db = getDb();
  return db.prepare("SELECT * FROM call_sessions WHERE user_id = ?").get(userId) as CallSession | undefined;
}

/** Marque un lead comme "pris" par un user dans la call queue */
export function claimLead(placeId: string, userId: string): void {
  const db = getDb();
  db.prepare(
    "UPDATE leads SET call_owner_id = ?, call_queue_at = datetime('now'), status = 'CALL', updated_at = datetime('now') WHERE place_id = ?"
  ).run(userId, placeId);
}

/** Marque un lead comme DONE + set last_contacted_at */
export function markLeadDone(placeId: string): void {
  const db = getDb();
  db.transaction(() => {
    db.prepare(
      "UPDATE leads SET status = 'DONE', last_contacted_at = datetime('now'), updated_at = datetime('now') WHERE place_id = ?"
    ).run(placeId);
    // Recalc score
    const lead = getLeadByPlaceId(placeId);
    if (lead) {
      const score = computeLeadScore({ ...lead, status: "DONE" });
      db.prepare("UPDATE leads SET lead_score = ? WHERE place_id = ?").run(score, placeId);
    }
  })();
}

/** Set followup_at sur un lead */
export function setFollowup(placeId: string, days: number, status?: string): void {
  const db = getDb();
  const st = status || "CALL";
  db.prepare(
    `UPDATE leads SET followup_at = datetime('now', '+${days} days'), status = ?, updated_at = datetime('now') WHERE place_id = ?`
  ).run(st, placeId);
}

/** Clear followup_at et set last_contacted_at */
export function clearFollowup(placeId: string): void {
  const db = getDb();
  db.prepare(
    "UPDATE leads SET followup_at = NULL, last_contacted_at = datetime('now'), updated_at = datetime('now') WHERE place_id = ?"
  ).run(placeId);
}

// ─── Follow-up ─────────────────────────────────────

/** Récupère les leads dont la relance est due */
export function getDueFollowups(): Lead[] {
  const db = getDb();
  const rows = db.prepare(
    "SELECT * FROM leads WHERE followup_at IS NOT NULL AND followup_at <= datetime('now') AND status NOT IN ('DONE', 'IGNORE') ORDER BY followup_at ASC"
  ).all() as Array<Record<string, unknown>>;
  return rows.map(rowToLead);
}

// ─── Stats ─────────────────────────────────────────

export interface LeadStats {
  total: number;
  newToday: number;
  noWebsite: number;
  socialOnly: number;
  avgScore: number;
  byStatus: Record<string, number>;
  topCities: Array<{ city: string; count: number }>;
  topQueries: Array<{ query: string; count: number }>;
  conversionRate: number;
}

export function computeStats(guildId: string): LeadStats {
  const db = getDb();

  const total = (db.prepare("SELECT COUNT(*) as c FROM leads WHERE guild_id = ?").get(guildId) as { c: number }).c;
  const newToday = (db.prepare(
    "SELECT COUNT(*) as c FROM leads WHERE guild_id = ? AND scanned_at >= date('now')"
  ).get(guildId) as { c: number }).c;
  const noWebsite = (db.prepare(
    "SELECT COUNT(*) as c FROM leads WHERE guild_id = ? AND no_website = 1"
  ).get(guildId) as { c: number }).c;
  const socialOnly = (db.prepare(
    "SELECT COUNT(*) as c FROM leads WHERE guild_id = ? AND social_only = 1"
  ).get(guildId) as { c: number }).c;
  const avgScoreRow = db.prepare(
    "SELECT AVG(lead_score) as a FROM leads WHERE guild_id = ?"
  ).get(guildId) as { a: number | null };
  const avgScore = Math.round(avgScoreRow.a ?? 0);

  // Status breakdown
  const statusRows = db.prepare(
    "SELECT status, COUNT(*) as c FROM leads WHERE guild_id = ? GROUP BY status"
  ).all(guildId) as Array<{ status: string; c: number }>;
  const byStatus: Record<string, number> = {};
  for (const r of statusRows) byStatus[r.status] = r.c;

  // Top 5 cities
  const topCities = db.prepare(
    "SELECT scan_city as city, COUNT(*) as count FROM leads WHERE guild_id = ? AND scan_city IS NOT NULL GROUP BY scan_city ORDER BY count DESC LIMIT 5"
  ).all(guildId) as Array<{ city: string; count: number }>;

  // Top 5 queries
  const topQueries = db.prepare(
    "SELECT scan_query as query, COUNT(*) as count FROM leads WHERE guild_id = ? AND scan_query IS NOT NULL GROUP BY scan_query ORDER BY count DESC LIMIT 5"
  ).all(guildId) as Array<{ query: string; count: number }>;

  // Conversion rate: DONE / (CALL + DONE)
  const doneCount = byStatus["DONE"] || 0;
  const callCount = byStatus["CALL"] || 0;
  const conversionRate = (callCount + doneCount) > 0 ? doneCount / (callCount + doneCount) : 0;

  return { total, newToday, noWebsite, socialOnly, avgScore, byStatus, topCities, topQueries, conversionRate };
}

// ─── Settings (key-value store) ────────────────────

export function getSetting(key: string): string | undefined {
  const db = getDb();
  const row = db.prepare("SELECT value FROM settings WHERE key = ?").get(key) as { value: string } | undefined;
  return row?.value;
}

export function setSetting(key: string, value: string): void {
  const db = getDb();
  db.prepare(
    "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value"
  ).run(key, value);
}

// ─── Lead Emails ───────────────────────────────────

/** Ajoute un email enrichi pour un lead */
export function addLeadEmail(entry: Omit<LeadEmail, "id" | "created_at">): void {
  const db = getDb();
  db.prepare(`
    INSERT INTO lead_emails (place_id, email, source, status, sent_at, subject, template, error)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    entry.place_id,
    entry.email,
    entry.source || "scraped",
    entry.status || "found",
    entry.sent_at || null,
    entry.subject || null,
    entry.template || null,
    entry.error || null
  );
  // Update lead email_status
  db.prepare(
    "UPDATE leads SET email_status = 'enriched', email = COALESCE(email, ?), updated_at = datetime('now') WHERE place_id = ?"
  ).run(entry.email, entry.place_id);
}

/** Récupère tous les emails d'un lead */
export function getLeadEmails(placeId: string): LeadEmail[] {
  const db = getDb();
  return db.prepare(
    "SELECT * FROM lead_emails WHERE place_id = ? ORDER BY created_at DESC"
  ).all(placeId) as LeadEmail[];
}

/** Marque un email comme envoyé */
export function markEmailSent(emailId: number, subject: string, template: string): void {
  const db = getDb();
  db.prepare(
    "UPDATE lead_emails SET status = 'sent', sent_at = datetime('now'), subject = ?, template = ? WHERE id = ?"
  ).run(subject, template, emailId);
  // Also update lead
  const emailRow = db.prepare("SELECT place_id FROM lead_emails WHERE id = ?").get(emailId) as { place_id: string } | undefined;
  if (emailRow) {
    db.prepare(
      "UPDATE leads SET email_status = 'sent', last_emailed_at = datetime('now'), updated_at = datetime('now') WHERE place_id = ?"
    ).run(emailRow.place_id);
  }
}

/** Marque un email en erreur */
export function markEmailError(emailId: number, error: string): void {
  const db = getDb();
  db.prepare(
    "UPDATE lead_emails SET status = 'error', error = ? WHERE id = ?"
  ).run(error, emailId);
}

/** Compte les emails envoyés dans les N dernières minutes */
export function countRecentEmailsSent(minutes: number): number {
  const db = getDb();
  const row = db.prepare(
    `SELECT COUNT(*) as c FROM lead_emails WHERE status = 'sent' AND sent_at >= datetime('now', '-${minutes} minutes')`
  ).get() as { c: number };
  return row.c;
}

/** Récupère les leads sans email enrichi (avec un site web OU social only) pour enrichissement */
export function getLeadsForEmailEnrichment(guildId: string, limit: number = 50): Lead[] {
  const db = getDb();
  const rows = db.prepare(`
    SELECT * FROM leads
    WHERE guild_id = ?
      AND (email IS NULL OR email = '')
      AND (email_status IS NULL OR email_status = 'none')
      AND (
        (website IS NOT NULL AND website != '')
      )
      AND status NOT IN ('IGNORE', 'DONE')
    ORDER BY lead_score DESC
    LIMIT ?
  `).all(guildId, limit) as Array<Record<string, unknown>>;
  return rows.map(rowToLead);
}

// ─── Lead Notes ────────────────────────────────────

/** Ajoute une note/commentaire à un lead */
export function addLeadNote(note: Omit<LeadNote, "id" | "created_at">): void {
  const db = getDb();
  db.prepare(`
    INSERT INTO lead_notes (place_id, user_id, user_tag, type, reason, content)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    note.place_id,
    note.user_id,
    note.user_tag || null,
    note.type || "note",
    note.reason || null,
    note.content
  );
}

/** Récupère les notes d'un lead */
export function getLeadNotes(placeId: string): LeadNote[] {
  const db = getDb();
  return db.prepare(
    "SELECT * FROM lead_notes WHERE place_id = ? ORDER BY created_at DESC"
  ).all(placeId) as LeadNote[];
}

/** Récupère la dernière raison de rappel pour un lead */
export function getLastCallbackReason(placeId: string): LeadNote | undefined {
  const db = getDb();
  return db.prepare(
    "SELECT * FROM lead_notes WHERE place_id = ? AND type = 'callback_reason' ORDER BY created_at DESC LIMIT 1"
  ).get(placeId) as LeadNote | undefined;
}

/** Compte les notes d'un lead */
export function countLeadNotes(placeId: string): number {
  const db = getDb();
  const row = db.prepare(
    "SELECT COUNT(*) as c FROM lead_notes WHERE place_id = ?"
  ).get(placeId) as { c: number };
  return row.c;
}

// ─── Activities ────────────────────────────────────

/** Enregistre une activité */
export function logActivity(activity: Omit<Activity, "id" | "created_at">): void {
  const db = getDb();
  db.prepare(`
    INSERT INTO activities (guild_id, user_id, user_tag, type, place_id, details, revenue)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    activity.guild_id,
    activity.user_id,
    activity.user_tag || null,
    activity.type,
    activity.place_id || null,
    activity.details || null,
    activity.revenue || 0
  );
}

/** Calcule les stats quotidiennes pour un guild et une date donnée */
export function computeDailyStats(guildId: string, date: string): DailyStats {
  const db = getDb();
  const dayStart = `${date} 00:00:00`;
  const dayEnd = `${date} 23:59:59`;

  const countByType = (type: string): number => {
    const row = db.prepare(
      "SELECT COUNT(*) as c FROM activities WHERE guild_id = ? AND type = ? AND created_at BETWEEN ? AND ?"
    ).get(guildId, type, dayStart, dayEnd) as { c: number };
    return row.c;
  };

  const totalRevenue = (() => {
    const row = db.prepare(
      "SELECT COALESCE(SUM(revenue), 0) as r FROM activities WHERE guild_id = ? AND created_at BETWEEN ? AND ?"
    ).get(guildId, dayStart, dayEnd) as { r: number };
    return row.r;
  })();

  const totalNewLeads = (() => {
    const row = db.prepare(
      "SELECT COUNT(*) as c FROM leads WHERE guild_id = ? AND scanned_at BETWEEN ? AND ?"
    ).get(guildId, dayStart, dayEnd) as { c: number };
    return row.c;
  })();

  const topUsers = db.prepare(`
    SELECT user_id, user_tag, COUNT(*) as count
    FROM activities
    WHERE guild_id = ? AND created_at BETWEEN ? AND ?
    GROUP BY user_id
    ORDER BY count DESC
    LIMIT 5
  `).all(guildId, dayStart, dayEnd) as Array<{ user_id: string; user_tag: string; count: number }>;

  return {
    date,
    totalCalls: countByType("call"),
    totalEmailsSent: countByType("email_sent"),
    totalEmailsEnriched: countByType("email_enriched"),
    totalMeetings: countByType("meeting"),
    totalRefusals: countByType("refusal"),
    totalClosed: countByType("closed"),
    totalCallbacks: countByType("callback"),
    totalRevenue,
    totalNewLeads,
    topUsers,
  };
}

/** Met à jour last_called_at sur un lead */
export function markLeadCalled(placeId: string): void {
  const db = getDb();
  db.prepare(
    "UPDATE leads SET last_called_at = datetime('now'), updated_at = datetime('now') WHERE place_id = ?"
  ).run(placeId);
}

// ─── Global Stats (pour statut bot rotatif) ────────

export interface GlobalLeadCounts {
  totalScanned: number;
  toCall: number;
  concluded: number;
  webRequests: number;
}

/** Compte global des leads toutes guilds confondues (pour le statut du bot) */
export function getGlobalLeadCounts(): GlobalLeadCounts {
  const db = getDb();
  const totalScanned = (db.prepare("SELECT COUNT(*) as c FROM leads").get() as { c: number }).c;
  const toCall = (db.prepare("SELECT COUNT(*) as c FROM leads WHERE status IN ('CALL', 'CHECK', 'NEW')").get() as { c: number }).c;
  const concluded = (db.prepare("SELECT COUNT(*) as c FROM leads WHERE status = 'DONE'").get() as { c: number }).c;
  const webRequests = (db.prepare("SELECT COUNT(*) as c FROM web_requests WHERE status = 'NEW'").get() as { c: number }).c;
  return { totalScanned, toCall, concluded, webRequests };
}

// ─── Web Requests (Mode Hunt) ──────────────────────

export interface WebRequest {
  id?: number;
  source: string;
  url: string;
  title?: string;
  snippet?: string;
  author?: string;
  domain: string;
  location?: string;
  request_type: string;
  relevance_score: number;
  language: string;
  posted_at?: string;
  detected_at?: string;
  status: string;         // NEW, CONTACTED, IGNORE, SAVED
  guild_id?: string;
  notes?: string;
  contact?: string;
}

/** Insère ou ignore une web request (déduplique par URL) */
export function upsertWebRequest(req: Omit<WebRequest, "id" | "detected_at">): boolean {
  const db = getDb();
  const result = db.prepare(`
    INSERT INTO web_requests (source, url, title, snippet, author, domain, location,
      request_type, relevance_score, language, posted_at, status, guild_id, notes, contact)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(url) DO NOTHING
  `).run(
    req.source,
    req.url,
    req.title ?? null,
    req.snippet ?? null,
    req.author ?? null,
    req.domain ?? "other",
    req.location ?? null,
    req.request_type ?? "vitrine",
    req.relevance_score ?? 0,
    req.language ?? "fr",
    req.posted_at ?? null,
    req.status ?? "NEW",
    req.guild_id ?? null,
    req.notes ?? null,
    req.contact ?? null,
  );
  return result.changes > 0;
}

/** Récupère les web requests avec filtres */
export function getWebRequests(opts: {
  guild_id?: string;
  domain?: string;
  source?: string;
  status?: string;
  dateRange?: "day" | "week" | "month" | "all";
  limit?: number;
  minScore?: number;
}): WebRequest[] {
  const db = getDb();
  const conditions: string[] = [];
  const params: unknown[] = [];

  if (opts.guild_id) { conditions.push("guild_id = ?"); params.push(opts.guild_id); }
  if (opts.domain && opts.domain !== "all") { conditions.push("domain = ?"); params.push(opts.domain); }
  if (opts.source && opts.source !== "all") { conditions.push("source = ?"); params.push(opts.source); }
  if (opts.status) { conditions.push("status = ?"); params.push(opts.status); }
  if (opts.minScore) { conditions.push("relevance_score >= ?"); params.push(opts.minScore); }

  if (opts.dateRange && opts.dateRange !== "all") {
    const interval = opts.dateRange === "day" ? "-1 day" : opts.dateRange === "week" ? "-7 days" : "-30 days";
    conditions.push(`detected_at >= datetime('now', '${interval}')`);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  const limit = opts.limit ?? 50;

  const rows = db.prepare(`
    SELECT * FROM web_requests ${where}
    ORDER BY relevance_score DESC, detected_at DESC
    LIMIT ?
  `).all(...params, limit) as WebRequest[];

  return rows;
}

/** Met à jour le status d'une web request */
export function updateWebRequestStatus(id: number, status: string, notes?: string): void {
  const db = getDb();
  if (notes) {
    db.prepare("UPDATE web_requests SET status = ?, notes = ? WHERE id = ?").run(status, notes, id);
  } else {
    db.prepare("UPDATE web_requests SET status = ? WHERE id = ?").run(status, id);
  }
}

/** Récupère une web request par ID */
export function getWebRequestById(id: number): WebRequest | undefined {
  const db = getDb();
  return db.prepare("SELECT * FROM web_requests WHERE id = ?").get(id) as WebRequest | undefined;
}

/** Stats des web requests pour un guild */
export function getWebRequestStats(guild_id: string): {
  total: number;
  newToday: number;
  byDomain: Record<string, number>;
  bySource: Record<string, number>;
  byStatus: Record<string, number>;
} {
  const db = getDb();
  const total = (db.prepare("SELECT COUNT(*) as c FROM web_requests WHERE guild_id = ?").get(guild_id) as { c: number }).c;
  const newToday = (db.prepare(
    "SELECT COUNT(*) as c FROM web_requests WHERE guild_id = ? AND detected_at >= date('now')"
  ).get(guild_id) as { c: number }).c;

  const domainRows = db.prepare(
    "SELECT domain, COUNT(*) as c FROM web_requests WHERE guild_id = ? GROUP BY domain"
  ).all(guild_id) as Array<{ domain: string; c: number }>;
  const byDomain: Record<string, number> = {};
  for (const r of domainRows) byDomain[r.domain] = r.c;

  const sourceRows = db.prepare(
    "SELECT source, COUNT(*) as c FROM web_requests WHERE guild_id = ? GROUP BY source"
  ).all(guild_id) as Array<{ source: string; c: number }>;
  const bySource: Record<string, number> = {};
  for (const r of sourceRows) bySource[r.source] = r.c;

  const statusRows = db.prepare(
    "SELECT status, COUNT(*) as c FROM web_requests WHERE guild_id = ? GROUP BY status"
  ).all(guild_id) as Array<{ status: string; c: number }>;
  const byStatus: Record<string, number> = {};
  for (const r of statusRows) byStatus[r.status] = r.c;

  return { total, newToday, byDomain, bySource, byStatus };
}

/** Vérifie si une URL a déjà été vue */
export function webRequestExists(url: string): boolean {
  const db = getDb();
  return !!db.prepare("SELECT 1 FROM web_requests WHERE url = ?").get(url);
}
