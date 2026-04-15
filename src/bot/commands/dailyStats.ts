/**
 * dailyStats.ts — Commande /daily_stats
 * Affiche les stats quotidiennes (aujourd'hui, hier, ou date spécifique).
 */

import {
  ChatInputCommandInteraction,
  SlashCommandBuilder,
  MessageFlags,
  EmbedBuilder,
} from "discord.js";
import { logger } from "../../utils/logger";
import { computeDailyStats, type DailyStats } from "../../db/queries";

export const data = new SlashCommandBuilder()
  .setName("daily_stats")
  .setDescription("📊 Affiche les stats d'activité : appels, emails, RDV, revenu…")
  .addStringOption((opt) =>
    opt
      .setName("period")
      .setDescription("Quelle période afficher ?")
      .setRequired(false)
      .addChoices(
        { name: "📅 Aujourd'hui", value: "today" },
        { name: "📅 Hier", value: "yesterday" },
        { name: "📅 Cette semaine", value: "week" }
      )
  ) as SlashCommandBuilder;

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const guildId = interaction.guildId;
  if (!guildId) {
    await interaction.reply({ content: "❌ Commande serveur uniquement.", flags: MessageFlags.Ephemeral });
    return;
  }

  const period = interaction.options.getString("period") || "today";

  await interaction.deferReply();

  try {
    if (period === "week") {
      // Show last 7 days
      const embeds: EmbedBuilder[] = [];
      const now = new Date();

      for (let i = 0; i < 7; i++) {
        const date = new Date(now);
        date.setDate(date.getDate() - i);
        const dateStr = date.toISOString().split("T")[0];
        const stats = computeDailyStats(guildId, dateStr);

        if (hasActivity(stats)) {
          embeds.push(buildDailyStatsEmbed(stats));
        }
      }

      if (embeds.length === 0) {
        await interaction.editReply("📊 Aucune activité cette semaine.");
        return;
      }

      // Discord limits to 10 embeds
      await interaction.editReply({
        content: "📊 **Stats de la semaine**",
        embeds: embeds.slice(0, 10),
      });
    } else {
      const date = getDateForPeriod(period);
      const stats = computeDailyStats(guildId, date);
      const embed = buildDailyStatsEmbed(stats);

      await interaction.editReply({
        content: `📊 **Stats ${period === "today" ? "d'aujourd'hui" : "d'hier"}**`,
        embeds: [embed],
      });
    }

    logger.info(`📊 /daily_stats ${period} par ${interaction.user.tag}`);
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    await interaction.editReply(`❌ Erreur: ${msg}`);
  }
}

function getDateForPeriod(period: string): string {
  const now = new Date();
  if (period === "yesterday") {
    now.setDate(now.getDate() - 1);
  }
  return now.toISOString().split("T")[0];
}

function hasActivity(stats: DailyStats): boolean {
  return (
    stats.totalCalls > 0 ||
    stats.totalEmailsSent > 0 ||
    stats.totalMeetings > 0 ||
    stats.totalRefusals > 0 ||
    stats.totalClosed > 0 ||
    stats.totalCallbacks > 0 ||
    stats.totalNewLeads > 0 ||
    stats.totalRevenue > 0
  );
}

export function buildDailyStatsEmbed(stats: DailyStats): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setColor(0x9b59b6)
    .setTitle(`📊 Stats du ${stats.date}`)
    .addFields(
      {
        name: "📞 Activité commerciale",
        value: [
          `📞 Appels : **${stats.totalCalls}**`,
          `📧 Emails envoyés : **${stats.totalEmailsSent}**`,
          `🔍 Emails enrichis : **${stats.totalEmailsEnriched}**`,
          `📅 RDV : **${stats.totalMeetings}**`,
          `🔄 Rappels : **${stats.totalCallbacks}**`,
          `❌ Refus : **${stats.totalRefusals}**`,
          `🤝 Conclus : **${stats.totalClosed}**`,
        ].join("\n"),
        inline: true,
      },
      {
        name: "💰 Résultats",
        value: [
          `💰 Revenu total : **${stats.totalRevenue.toFixed(2)}€**`,
          `🆕 Nouveaux leads : **${stats.totalNewLeads}**`,
        ].join("\n"),
        inline: true,
      }
    )
    .setTimestamp();

  // Top users
  if (stats.topUsers.length > 0) {
    embed.addFields({
      name: "🏆 Top contributeurs",
      value: stats.topUsers
        .map((u, i) => `${i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `${i + 1}.`} <@${u.user_id}> — ${u.count} actions`)
        .join("\n"),
      inline: false,
    });
  }

  return embed;
}
