/**
 * dailyStatsPoster.ts — Job planifié pour poster le résumé quotidien.
 * Poste automatiquement les stats à l'heure configurée (DAILY_STATS_TIME).
 * Utilise l'heure Israël (Asia/Jerusalem).
 */

import { Client, TextChannel } from "discord.js";
import { config } from "../config";
import { logger } from "../utils/logger";
import { computeDailyStats } from "../db/queries";
import { buildDailyStatsEmbed } from "../bot/commands/dailyStats";

let dailyStatsTimeout: ReturnType<typeof setTimeout> | null = null;

export function startDailyStatsPoster(client: Client): void {
  if (!config.statsChannelId) {
    logger.info("📊 Daily stats auto désactivé (STATS_CHANNEL_ID non configuré).");
    return;
  }

  logger.info(`📊 Daily stats auto: post quotidien à ${config.dailyStatsTime} (heure Israël) dans <#${config.statsChannelId}>`);

  scheduleDailyStats(client);
}

function scheduleDailyStats(client: Client): void {
  const nextPostMs = getNextPostDelay();
  logger.info(`📊 Prochain post quotidien dans ${Math.round(nextPostMs / 60_000)} minutes.`);

  dailyStatsTimeout = setTimeout(async () => {
    await postDailyStats(client);
    // Re-schedule for next day
    scheduleDailyStats(client);
  }, nextPostMs);
}

function getNextPostDelay(): number {
  const [hours, minutes] = config.dailyStatsTime.split(":").map(Number);

  // Get current time in Israel timezone
  const now = new Date();
  const israelTime = new Date(
    now.toLocaleString("en-US", { timeZone: "Asia/Jerusalem" })
  );

  // Calculate target time today
  const target = new Date(israelTime);
  target.setHours(hours, minutes, 0, 0);

  // If target is in the past, schedule for tomorrow
  if (target <= israelTime) {
    target.setDate(target.getDate() + 1);
  }

  // Calculate delay in ms
  const delayMs = target.getTime() - israelTime.getTime();
  return Math.max(delayMs, 60_000); // Minimum 1 minute
}

async function postDailyStats(client: Client): Promise<void> {
  try {
    const channel = await client.channels.fetch(config.statsChannelId);
    if (!channel || !(channel instanceof TextChannel)) {
      logger.warn("📊 Daily stats: salon introuvable.");
      return;
    }

    const guildId = channel.guildId;
    const today = new Date().toISOString().split("T")[0];
    const stats = computeDailyStats(guildId, today);
    const embed = buildDailyStatsEmbed(stats);

    // Mention if there's an associate
    const mention = config.associateUserId ? `<@${config.associateUserId}>` : "";

    await channel.send({
      content: `${mention} 📊 **Résumé quotidien — ${today}**`.trim(),
      embeds: [embed],
    });

    logger.info(`📊 Daily stats postées pour ${today} (${stats.totalCalls} appels, ${stats.totalRevenue}€ revenue).`);
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    logger.error(`❌ Erreur daily stats: ${msg}`);
  }
}

export function stopDailyStatsPoster(): void {
  if (dailyStatsTimeout) {
    clearTimeout(dailyStatsTimeout);
    dailyStatsTimeout = null;
    logger.info("📊 Daily stats auto arrêté.");
  }
}
