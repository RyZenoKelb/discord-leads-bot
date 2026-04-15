/**
 * followupChecker.ts — Job planifié qui vérifie les relances dues.
 * Poste dans FOLLOWUP_CHANNEL_ID quand followup_at <= now.
 * Mentionne l'associé + embed du lead + boutons.
 */

import { Client, TextChannel } from "discord.js";
import { config } from "../config";
import { logger } from "../utils/logger";
import { getDueFollowups } from "../db/queries";
import { buildFollowupEmbed, buildFollowupButtons } from "../bot/embeds";

let followupInterval: ReturnType<typeof setInterval> | null = null;

export function startFollowupChecker(client: Client): void {
  if (!config.followupChannelId) {
    logger.info("🔔 Relance auto désactivé (FOLLOWUP_CHANNEL_ID non configuré).");
    return;
  }

  const intervalMs = config.followupCheckIntervalMin * 60 * 1000;
  logger.info(`🔔 Relance auto: check toutes les ${config.followupCheckIntervalMin} min dans <#${config.followupChannelId}>`);

  followupInterval = setInterval(() => void checkFollowups(client), intervalMs);

  // Premier check après 10 secondes
  setTimeout(() => void checkFollowups(client), 10_000);
}

async function checkFollowups(client: Client): Promise<void> {
  try {
    const dueLeads = getDueFollowups();
    if (dueLeads.length === 0) return;

    const channel = await client.channels.fetch(config.followupChannelId);
    if (!channel || !(channel instanceof TextChannel)) {
      logger.warn("🔔 Followup: salon introuvable.");
      return;
    }

    const mention = config.associateUserId ? `<@${config.associateUserId}>` : "";

    for (const lead of dueLeads) {
      const embed = buildFollowupEmbed(lead);
      const buttons = buildFollowupButtons(lead.place_id);

      await channel.send({
        content: mention ? `${mention} 🔔 **Relance à faire !**` : "🔔 **Relance à faire !**",
        embeds: [embed],
        components: [buttons],
      });

      // Rate limit
      await new Promise((r) => setTimeout(r, 500));
    }

    logger.info(`🔔 ${dueLeads.length} relance(s) postée(s) dans #${channel.name}`);

  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    logger.error(`❌ Erreur followup check: ${msg}`);
  }
}

export function stopFollowupChecker(): void {
  if (followupInterval) {
    clearInterval(followupInterval);
    followupInterval = null;
    logger.info("🔔 Relance auto arrêté.");
  }
}
