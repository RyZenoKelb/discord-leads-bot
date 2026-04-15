/**
 * pipeline.ts — Commande /pipeline
 * Vue Kanban du pipeline commercial : affiche les leads par statut (NEW, CALL,
 * CHECK, DONE, IGNORE) avec stats rapides et top leads par score.
 *
 * Parfait pour avoir un aperçu instantané de l'état du prospecting Orlan.
 */

import {
  ChatInputCommandInteraction,
  SlashCommandBuilder,
  EmbedBuilder,
  MessageFlags,
} from "discord.js";
import { getDb } from "../../db/schema";
import { logger } from "../../utils/logger";

export const data = new SlashCommandBuilder()
  .setName("pipeline")
  .setDescription("📊 Vue pipeline commercial — répartition des leads par statut + top prospects")
  .addStringOption((opt) =>
    opt
      .setName("view")
      .setDescription("Type d'affichage")
      .addChoices(
        { name: "📊 Résumé (par défaut)", value: "summary" },
        { name: "🔥 Top 10 leads à fort score", value: "top_leads" },
        { name: "📅 Relances à venir (followup)", value: "followups" },
        { name: "📧 Leads avec email enrichi", value: "emailed" },
      )
  ) as SlashCommandBuilder;

// ─── Helper types ───────────────────────────────────

interface StatusRow { status: string; c: number }
interface LeadRow {
  name: string;
  scan_city: string | null;
  phone: string | null;
  lead_score: number;
  status: string;
  email: string | null;
  google_maps_url: string | null;
  followup_at: string | null;
  tags: string | null;
}

// ─── Execute ────────────────────────────────────────

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const guildId = interaction.guildId;
  if (!guildId) {
    await interaction.reply({ content: "❌ Commande serveur uniquement.", flags: MessageFlags.Ephemeral });
    return;
  }

  const view = interaction.options.getString("view") ?? "summary";
  await interaction.deferReply();

  try {
    const db = getDb();

    if (view === "summary") {
      // ── Stats par statut ──────────────────────────
      const statusRows = db.prepare(
        "SELECT status, COUNT(*) as c FROM leads WHERE guild_id = ? GROUP BY status ORDER BY c DESC"
      ).all(guildId) as StatusRow[];

      const totalLeads = statusRows.reduce((s, r) => s + r.c, 0);

      const byStatus: Record<string, number> = {};
      for (const r of statusRows) byStatus[r.status] = r.c;

      const avgScore = (db.prepare(
        "SELECT COALESCE(AVG(lead_score), 0) as a FROM leads WHERE guild_id = ? AND status NOT IN ('IGNORE','DONE')"
      ).get(guildId) as { a: number }).a;

      const noWebsite = (db.prepare(
        "SELECT COUNT(*) as c FROM leads WHERE guild_id = ? AND no_website = 1 AND status NOT IN ('IGNORE','DONE')"
      ).get(guildId) as { c: number }).c;

      const withPhone = (db.prepare(
        "SELECT COUNT(*) as c FROM leads WHERE guild_id = ? AND phone IS NOT NULL AND phone != '' AND status NOT IN ('IGNORE','DONE')"
      ).get(guildId) as { c: number }).c;

      const withEmail = (db.prepare(
        "SELECT COUNT(*) as c FROM leads WHERE guild_id = ? AND (email IS NOT NULL AND email != '') AND status NOT IN ('IGNORE','DONE')"
      ).get(guildId) as { c: number }).c;

      const dueFollowups = (db.prepare(
        "SELECT COUNT(*) as c FROM leads WHERE guild_id = ? AND followup_at IS NOT NULL AND followup_at <= datetime('now') AND status NOT IN ('DONE','IGNORE')"
      ).get(guildId) as { c: number }).c;

      const statusEmojis: Record<string, string> = {
        NEW:    "🆕",
        CALL:   "📞",
        CHECK:  "🔍",
        DONE:   "✅",
        IGNORE: "🚫",
      };

      const statusLines = Object.entries(byStatus)
        .map(([st, count]) => {
          const bar = "█".repeat(Math.min(10, Math.round((count / Math.max(totalLeads, 1)) * 10)));
          return `${statusEmojis[st] ?? "❓"} **${st}** — ${count} leads \`${bar}\``;
        })
        .join("\n");

      const doneCount = byStatus["DONE"] ?? 0;
      const callCount = byStatus["CALL"] ?? 0;
      const convRate  = (callCount + doneCount) > 0
        ? Math.round((doneCount / (callCount + doneCount)) * 100)
        : 0;

      const embed = new EmbedBuilder()
        .setTitle("📊 Pipeline Commercial — Orlan Web")
        .setColor(0x5865f2)
        .setDescription(
          `> **${totalLeads}** leads au total · Score moyen actif: **${Math.round(avgScore)}/100**\n\n` +
          statusLines
        )
        .addFields(
          { name: "🌐 Sans site web", value: `**${noWebsite}**`, inline: true },
          { name: "📞 Avec téléphone", value: `**${withPhone}**`, inline: true },
          { name: "📧 Avec email", value: `**${withEmail}**`, inline: true },
          { name: "🔁 Relances dues", value: dueFollowups > 0 ? `**⚠️ ${dueFollowups}**` : "**0**", inline: true },
          { name: "🎯 Taux conversion", value: `**${convRate}%**`, inline: true },
          { name: "✅ Conclus", value: `**${doneCount}**`, inline: true },
        )
        .setFooter({ text: "Utilisez /pipeline view:top_leads pour voir les meilleurs prospects" })
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });

    } else if (view === "top_leads") {
      // ── Top 10 leads par score ────────────────────
      const topLeads = db.prepare(`
        SELECT name, scan_city, phone, lead_score, status, email, google_maps_url, followup_at, tags
        FROM leads
        WHERE guild_id = ? AND status NOT IN ('IGNORE', 'DONE')
        ORDER BY lead_score DESC, reviews DESC
        LIMIT 10
      `).all(guildId) as LeadRow[];

      if (topLeads.length === 0) {
        await interaction.editReply("📭 Aucun lead actif dans le pipeline.");
        return;
      }

      const lines = topLeads.map((l, i) => {
        const score   = `\`${l.lead_score}/100\``;
        const city    = l.scan_city ? `📍 ${l.scan_city}` : "";
        const phone   = l.phone ? `📞 ${l.phone}` : "  _pas de tél_";
        const mailTag = l.email ? "📧 ✅" : "📧 ✗";
        const maps    = l.google_maps_url ? `[Maps](${l.google_maps_url})` : "";
        const tags    = l.tags ? `\`${l.tags}\`` : "";
        return `**${i + 1}. ${l.name}** ${score}\n└ ${city} ${phone} ${mailTag} ${maps} ${tags}`;
      });

      const embed = new EmbedBuilder()
        .setTitle("🔥 Top 10 — Meilleurs prospects")
        .setColor(0xff6b35)
        .setDescription(lines.join("\n\n"))
        .setFooter({ text: "Triés par lead_score décroissant · Non DONE/IGNORE" })
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });

    } else if (view === "followups") {
      // ── Relances à venir ──────────────────────────
      const followups = db.prepare(`
        SELECT name, scan_city, phone, lead_score, status, email, google_maps_url, followup_at, tags
        FROM leads
        WHERE guild_id = ?
          AND followup_at IS NOT NULL
          AND status NOT IN ('DONE', 'IGNORE')
        ORDER BY followup_at ASC
        LIMIT 15
      `).all(guildId) as LeadRow[];

      if (followups.length === 0) {
        await interaction.editReply("📭 Aucune relance planifiée.");
        return;
      }

      const now = Date.now();
      const lines = followups.map((l, i) => {
        const date    = new Date(l.followup_at! + "Z");
        const isPast  = date.getTime() <= now;
        const dateStr = `<t:${Math.floor(date.getTime() / 1000)}:R>`;
        const flag    = isPast ? "⚠️" : "🕐";
        const phone   = l.phone ?? "—";
        return `${flag} **${i + 1}. ${l.name}** — ${dateStr}\n└ 📍 ${l.scan_city ?? "?"} · 📞 ${phone} · Score \`${l.lead_score}\``;
      });

      const embed = new EmbedBuilder()
        .setTitle("📅 Relances planifiées")
        .setColor(0xfaa61a)
        .setDescription(lines.join("\n\n"))
        .setFooter({ text: "⚠️ = relances dues (passées) · /call_queue pour traiter" })
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });

    } else if (view === "emailed") {
      // ── Leads avec email enrichi ──────────────────
      const emailed = db.prepare(`
        SELECT name, scan_city, phone, lead_score, status, email, google_maps_url, followup_at, tags
        FROM leads
        WHERE guild_id = ?
          AND (email IS NOT NULL AND email != '')
          AND status NOT IN ('IGNORE')
        ORDER BY lead_score DESC
        LIMIT 15
      `).all(guildId) as LeadRow[];

      if (emailed.length === 0) {
        await interaction.editReply("📭 Aucun lead avec email enrichi.");
        return;
      }

      const lines = emailed.map((l, i) => {
        const emailStr = l.email ? `\`${l.email}\`` : "_inconnu_";
        const sentTag  = l.status === "DONE" ? "✅ Conclu" : `📊 ${l.status}`;
        return `**${i + 1}. ${l.name}** — ${emailStr}\n└ 📍 ${l.scan_city ?? "?"} · ${sentTag} · Score \`${l.lead_score}\``;
      });

      const embed = new EmbedBuilder()
        .setTitle("📧 Leads avec email enrichi")
        .setColor(0x57f287)
        .setDescription(lines.join("\n\n"))
        .setFooter({ text: "Triés par score décroissant · /enrich_email pour enrichir plus" })
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });
    }

    logger.info(`📊 /pipeline [${view}] par ${interaction.user.tag} — guild ${guildId}`);

  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    logger.error(`❌ Erreur /pipeline: ${msg}`);
    await interaction.editReply(`❌ Erreur: ${msg}`);
  }
}
