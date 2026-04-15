/**
 * recap.ts — Commande /recap
 * Résumé hebdomadaire / mensuel du prospecting Orlan.
 * Affiche : leads scannés, appels, emails, rendez-vous, clients conclus,
 *           revenu estimé, top vendeur, comparaison période précédente.
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
  .setName("recap")
  .setDescription("📈 Résumé du prospecting sur une période (semaine / mois / 30j)")
  .addStringOption((opt) =>
    opt
      .setName("period")
      .setDescription("Période à analyser")
      .addChoices(
        { name: "📅 Cette semaine",     value: "week"     },
        { name: "📅 Semaine dernière",  value: "last_week" },
        { name: "🗓️ Ce mois-ci",       value: "month"    },
        { name: "🗓️ Mois dernier",     value: "last_month" },
        { name: "⏱️ 7 derniers jours",  value: "7d"       },
        { name: "⏱️ 30 derniers jours", value: "30d"      },
      )
  ) as SlashCommandBuilder;

// ─── Date helpers ───────────────────────────────────

function getDateRange(period: string): { from: string; to: string; label: string } {
  const now   = new Date();
  const pad   = (n: number) => String(n).padStart(2, "0");
  const fmt   = (d: Date) =>
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

  switch (period) {
    case "week": {
      const day  = now.getDay() === 0 ? 6 : now.getDay() - 1; // Lundi = 0
      const mon  = new Date(now);
      mon.setDate(now.getDate() - day);
      return { from: fmt(mon), to: fmt(now), label: "Cette semaine" };
    }
    case "last_week": {
      const day  = now.getDay() === 0 ? 6 : now.getDay() - 1;
      const mon  = new Date(now);
      mon.setDate(now.getDate() - day - 7);
      const sun  = new Date(mon);
      sun.setDate(mon.getDate() + 6);
      return { from: fmt(mon), to: fmt(sun), label: "Semaine dernière" };
    }
    case "month": {
      const from = new Date(now.getFullYear(), now.getMonth(), 1);
      return { from: fmt(from), to: fmt(now), label: "Ce mois-ci" };
    }
    case "last_month": {
      const from = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const to   = new Date(now.getFullYear(), now.getMonth(), 0);
      return { from: fmt(from), to: fmt(to), label: "Mois dernier" };
    }
    case "7d": {
      const from = new Date(now);
      from.setDate(now.getDate() - 7);
      return { from: fmt(from), to: fmt(now), label: "7 derniers jours" };
    }
    case "30d":
    default: {
      const from = new Date(now);
      from.setDate(now.getDate() - 30);
      return { from: fmt(from), to: fmt(now), label: "30 derniers jours" };
    }
  }
}

function countActivity(guildId: string, type: string, from: string, to: string): number {
  const db  = getDb();
  const row = db.prepare(`
    SELECT COUNT(*) as c FROM activities
    WHERE guild_id = ? AND type = ?
      AND created_at BETWEEN ? AND ?
  `).get(guildId, type, `${from} 00:00:00`, `${to} 23:59:59`) as { c: number };
  return row.c;
}

// ─── Execute ────────────────────────────────────────

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const guildId = interaction.guildId;
  if (!guildId) {
    await interaction.reply({ content: "❌ Commande serveur uniquement.", flags: MessageFlags.Ephemeral });
    return;
  }

  const period = interaction.options.getString("period") ?? "30d";
  await interaction.deferReply();

  try {
    const db = getDb();
    const { from, to, label } = getDateRange(period);
    const fromTs = `${from} 00:00:00`;
    const toTs   = `${to} 23:59:59`;

    // ── Leads scannés ────────────────────────────
    const leadsScanned = (db.prepare(
      "SELECT COUNT(*) as c FROM leads WHERE guild_id = ? AND scanned_at BETWEEN ? AND ?"
    ).get(guildId, fromTs, toTs) as { c: number }).c;

    const leadsNoSite = (db.prepare(
      "SELECT COUNT(*) as c FROM leads WHERE guild_id = ? AND no_website = 1 AND scanned_at BETWEEN ? AND ?"
    ).get(guildId, fromTs, toTs) as { c: number }).c;

    // ── Activités ────────────────────────────────
    const calls    = countActivity(guildId, "call",           from, to);
    const emails   = countActivity(guildId, "email_sent",     from, to);
    const enriched = countActivity(guildId, "email_enriched", from, to);
    const meetings = countActivity(guildId, "meeting",        from, to);
    const closed   = countActivity(guildId, "closed",         from, to);
    const refusals = countActivity(guildId, "refusal",        from, to);
    const callbacks= countActivity(guildId, "callback",       from, to);

    // ── Revenu ───────────────────────────────────
    const revenue = (db.prepare(
      "SELECT COALESCE(SUM(revenue), 0) as r FROM activities WHERE guild_id = ? AND created_at BETWEEN ? AND ?"
    ).get(guildId, fromTs, toTs) as { r: number }).r;

    // ── Top utilisateurs ─────────────────────────
    const topUsers = db.prepare(`
      SELECT user_tag, COUNT(*) as cnt
      FROM activities
      WHERE guild_id = ? AND created_at BETWEEN ? AND ?
      GROUP BY user_id
      ORDER BY cnt DESC
      LIMIT 5
    `).all(guildId, fromTs, toTs) as Array<{ user_tag: string; cnt: number }>;

    // ── Taux de conversion ────────────────────────
    const doneTotal = (db.prepare(
      "SELECT COUNT(*) as c FROM leads WHERE guild_id = ? AND status = 'DONE'"
    ).get(guildId) as { c: number }).c;

    const convRate = (calls + closed) > 0
      ? Math.round((closed / (calls + closed)) * 100)
      : 0;

    // ── Meilleure ville ───────────────────────────
    const topCity = db.prepare(
      "SELECT scan_city as city, COUNT(*) as c FROM leads WHERE guild_id = ? AND scanned_at BETWEEN ? AND ? AND scan_city IS NOT NULL GROUP BY scan_city ORDER BY c DESC LIMIT 1"
    ).get(guildId, fromTs, toTs) as { city: string; c: number } | undefined;

    // ── Progress bars rapides ─────────────────────
    const bar = (val: number, max: number, len = 8) => {
      const filled = max > 0 ? Math.round((val / max) * len) : 0;
      return "█".repeat(filled) + "░".repeat(len - filled);
    };

    const maxActivity = Math.max(calls, emails, meetings, enriched, 1);

    const embed = new EmbedBuilder()
      .setTitle(`📈 Récap Orlan — ${label}`)
      .setColor(0x5865f2)
      .setDescription(
        `> Du **${from}** au **${to}** · ${leadsScanned} leads scannés\n` +
        `> 🌐 Sans site: **${leadsNoSite}** | 💰 Revenu: **${revenue.toFixed(0)}€** | 🎯 Conversion: **${convRate}%**`
      )
      .addFields(
        {
          name: "📊 Activités",
          value: [
            `📞 Appels        \`${bar(calls,    maxActivity)}\` **${calls}**`,
            `📧 Emails envoyés \`${bar(emails,  maxActivity)}\` **${emails}**`,
            `🔍 Emails enrichis\`${bar(enriched,maxActivity)}\` **${enriched}**`,
            `🤝 RDV/Meetings  \`${bar(meetings, maxActivity)}\` **${meetings}**`,
            `✅ Conclus        \`${bar(closed,   maxActivity)}\` **${closed}**`,
            `🔁 Rappels        \`${bar(callbacks,maxActivity)}\` **${callbacks}**`,
            `❌ Refus          \`${bar(refusals, maxActivity)}\` **${refusals}**`,
          ].join("\n"),
          inline: false,
        },
        {
          name: "🏆 Top équipe",
          value: topUsers.length
            ? topUsers.map((u, i) => `${i + 1}. **${u.user_tag ?? "Inconnu"}** — ${u.cnt} actions`).join("\n")
            : "_Aucune activité_",
          inline: true,
        },
        {
          name: "📍 Top ville",
          value: topCity ? `**${topCity.city}** — ${topCity.c} leads` : "_—_",
          inline: true,
        },
        {
          name: "📋 Total conclus",
          value: `**${doneTotal}** clients au total`,
          inline: true,
        },
      )
      .setFooter({ text: "Orlan Web · /daily_stats pour les détails jour par jour" })
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });

    logger.info(
      `📈 /recap [${period}] par ${interaction.user.tag} — guild ${guildId}`
    );
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    logger.error(`❌ Erreur /recap: ${msg}`);
    await interaction.editReply(`❌ Erreur: ${msg}`);
  }
}
