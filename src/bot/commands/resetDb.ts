/**
 * resetDb.ts — Commande /reset_db
 * Vide toutes les tables de la base de données (leads, emails, notes,
 * activités, jobs, sessions, presets, settings).
 *
 * Sécurité : l'utilisateur doit taper "CONFIRMER" pour valider.
 * Réservé aux administrateurs du serveur.
 */

import {
  ChatInputCommandInteraction,
  SlashCommandBuilder,
  EmbedBuilder,
  MessageFlags,
  PermissionFlagsBits,
} from "discord.js";
import { getDb } from "../../db/schema";
import { logger } from "../../utils/logger";

export const data = new SlashCommandBuilder()
  .setName("reset_db")
  .setDescription("🗑️ [ADMIN] Vide toute la base de données du bot (leads, notes, emails, stats…)")
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  .addStringOption((opt) =>
    opt
      .setName("confirmation")
      .setDescription('Tape exactement "CONFIRMER" pour valider la suppression totale')
      .setRequired(true)
  )
  .addStringOption((opt) =>
    opt
      .setName("scope")
      .setDescription("Que vider ? (défaut : tout)")
      .addChoices(
        { name: "🗑️ Tout (leads + emails + notes + activités + jobs)", value: "all" },
        { name: "📋 Leads uniquement (garde emails / notes)", value: "leads_only" },
        { name: "📊 Statistiques & activités uniquement", value: "stats_only" },
        { name: "🔍 Jobs de scan uniquement", value: "jobs_only" },
      )
  ) as SlashCommandBuilder;

// ─── Tables à vider selon le scope ─────────────────

interface ResetResult {
  table: string;
  deleted: number;
}

function resetAll(): ResetResult[] {
  const db = getDb();
  const results: ResetResult[] = [];

  const tables = [
    "lead_emails",
    "lead_notes",
    "activities",
    "scan_jobs",
    "call_sessions",
    "filter_presets",
    "leads",
    "settings",
  ];

  db.transaction(() => {
    for (const table of tables) {
      const info = db.prepare(`DELETE FROM ${table}`).run();
      results.push({ table, deleted: info.changes });
    }
    // Reset auto-increment
    db.prepare("DELETE FROM sqlite_sequence").run();
  })();

  return results;
}

function resetLeadsOnly(): ResetResult[] {
  const db = getDb();
  const results: ResetResult[] = [];

  db.transaction(() => {
    // Doit supprimer les FK d'abord
    const emails = db.prepare("DELETE FROM lead_emails").run();
    const notes  = db.prepare("DELETE FROM lead_notes").run();
    const sess   = db.prepare("DELETE FROM call_sessions").run();
    const leads  = db.prepare("DELETE FROM leads").run();
    results.push(
      { table: "lead_emails", deleted: emails.changes },
      { table: "lead_notes",  deleted: notes.changes  },
      { table: "call_sessions", deleted: sess.changes },
      { table: "leads",       deleted: leads.changes  },
    );
  })();

  return results;
}

function resetStatsOnly(): ResetResult[] {
  const db = getDb();
  const act = db.prepare("DELETE FROM activities").run();
  return [{ table: "activities", deleted: act.changes }];
}

function resetJobsOnly(): ResetResult[] {
  const db = getDb();
  const jobs = db.prepare("DELETE FROM scan_jobs").run();
  return [{ table: "scan_jobs", deleted: jobs.changes }];
}

// ─── Execute ────────────────────────────────────────

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const confirmation = interaction.options.getString("confirmation", true);
  const scope        = interaction.options.getString("scope") ?? "all";

  // Vérification du mot de passe
  if (confirmation !== "CONFIRMER") {
    await interaction.reply({
      content:
        "❌ Confirmation invalide. Tu dois taper exactement `CONFIRMER` pour exécuter cette commande.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  try {
    let results: ResetResult[];

    switch (scope) {
      case "leads_only":
        results = resetLeadsOnly();
        break;
      case "stats_only":
        results = resetStatsOnly();
        break;
      case "jobs_only":
        results = resetJobsOnly();
        break;
      default:
        results = resetAll();
    }

    const totalDeleted = results.reduce((s, r) => s + r.deleted, 0);

    const scopeLabels: Record<string, string> = {
      all:        "🗑️ Réinitialisation TOTALE",
      leads_only: "📋 Leads uniquement",
      stats_only: "📊 Statistiques & activités",
      jobs_only:  "🔍 Jobs de scan",
    };

    const embed = new EmbedBuilder()
      .setTitle("🗑️ Base de données réinitialisée")
      .setColor(0xff4444)
      .setDescription(`**${scopeLabels[scope]}** effectuée par ${interaction.user}`)
      .addFields(
        results
          .filter((r) => r.deleted > 0)
          .map((r) => ({
            name: `\`${r.table}\``,
            value: `${r.deleted} ligne(s) supprimée(s)`,
            inline: true,
          }))
      )
      .addFields({ name: "📊 Total", value: `**${totalDeleted}** enregistrements supprimés`, inline: false })
      .setFooter({ text: `Exécuté par ${interaction.user.tag}` })
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });

    logger.warn(
      `⚠️ /reset_db [${scope}] par ${interaction.user.tag} — ${totalDeleted} lignes supprimées`
    );
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    logger.error(`❌ Erreur /reset_db: ${msg}`);
    await interaction.editReply(`❌ Erreur lors du reset: ${msg}`);
  }
}
