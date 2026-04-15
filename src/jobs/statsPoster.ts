/**
 * statsPoster.ts — Job planifié qui poste les stats périodiquement.
 * Utilise setInterval pour poster dans STATS_CHANNEL_ID.
 * Édite le même message (pinned) au lieu de spammer.
 */

import { Client, TextChannel } from "discord.js";
import { config } from "../config";
import { logger } from "../utils/logger";
import { computeStats } from "../db/queries";
import { buildStatsEmbed } from "../bot/embeds";
import { postOrEditStats } from "../bot/commands/statsNow";

let statsInterval: ReturnType<typeof setInterval> | null = null;

export function startStatsPoster(client: Client): void {
  if (!config.statsChannelId) {
    logger.info("📊 Stats auto désactivé (STATS_CHANNEL_ID non configuré).");
    return;
  }

  const intervalMs = config.statsPostIntervalMin * 60 * 1000;
  logger.info(`📊 Stats auto: toutes les ${config.statsPostIntervalMin} min dans <#${config.statsChannelId}>`);

  statsInterval = setInterval(async () => {
    try {
      const channel = await client.channels.fetch(config.statsChannelId);
      if (!channel || !(channel instanceof TextChannel)) {
        logger.warn("📊 Stats auto: salon introuvable.");
        return;
      }

      // On utilise le guild_id du channel
      const guildId = channel.guildId;
      const stats = computeStats(guildId);
      const embed = buildStatsEmbed(stats);

      await postOrEditStats(channel, embed, guildId);
      logger.info(`📊 Stats auto postées (${stats.total} leads, score moyen ${stats.avgScore}).`);

    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      logger.error(`❌ Erreur stats auto: ${msg}`);
    }
  }, intervalMs);

  // Poster immédiatement au démarrage (après un court délai)
  setTimeout(async () => {
    try {
      const channel = await client.channels.fetch(config.statsChannelId);
      if (channel instanceof TextChannel) {
        const guildId = channel.guildId;
        const stats = computeStats(guildId);
        const embed = buildStatsEmbed(stats);
        await postOrEditStats(channel, embed, guildId);
        logger.info("📊 Stats initiales postées.");
      }
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      logger.warn(`📊 Stats initiales: ${msg}`);
    }
  }, 5000);
}

export function stopStatsPoster(): void {
  if (statsInterval) {
    clearInterval(statsInterval);
    statsInterval = null;
    logger.info("📊 Stats auto arrêté.");
  }
}
