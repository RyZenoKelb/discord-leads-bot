/**
 * statsNow.ts — Commande /stats_now
 * Force la publication immédiate des statistiques.
 */

import {
  ChatInputCommandInteraction,
  SlashCommandBuilder,
  TextChannel,
  MessageFlags,
} from "discord.js";
import { config } from "../../config";
import { logger } from "../../utils/logger";
import { computeStats, getSetting, setSetting } from "../../db/queries";
import { buildStatsEmbed } from "../embeds";

export const data = new SlashCommandBuilder()
  .setName("stats_now")
  .setDescription("📊 Affiche les statistiques complètes des leads immédiatement") as SlashCommandBuilder;

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const guildId = interaction.guildId;
  if (!guildId) {
    await interaction.reply({ content: "❌ Commande serveur uniquement.", flags: MessageFlags.Ephemeral });
    return;
  }

  await interaction.deferReply();

  try {
    const stats = computeStats(guildId);
    const embed = buildStatsEmbed(stats);

    // Si un salon stats est configuré, poster là-bas aussi
    if (config.statsChannelId) {
      try {
        const channel = await interaction.client.channels.fetch(config.statsChannelId);
        if (channel instanceof TextChannel) {
          await postOrEditStats(channel, embed, guildId);
        }
      } catch {
        // Silencieux — on répond quand même dans le canal courant
      }
    }

    await interaction.editReply({
      content: "📊 **Statistiques actuelles**",
      embeds: [embed],
    });

    logger.info(`📊 /stats_now par ${interaction.user.tag} dans guild ${guildId}`);

  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    logger.error(`❌ Erreur /stats_now: ${msg}`);
    await interaction.editReply(`❌ Erreur: ${msg}`);
  }
}

/** Post ou édite le message pinned de stats */
export async function postOrEditStats(
  channel: TextChannel,
  embed: import("discord.js").EmbedBuilder,
  guildId: string
): Promise<void> {
  const settingKey = `stats_message_id_${guildId}`;
  const existingMsgId = getSetting(settingKey);

  if (existingMsgId) {
    try {
      const msg = await channel.messages.fetch(existingMsgId);
      await msg.edit({ embeds: [embed] });
      return;
    } catch {
      // Message supprimé ou introuvable — on en crée un nouveau
    }
  }

  const newMsg = await channel.send({ embeds: [embed] });
  setSetting(settingKey, newMsg.id);

  try {
    await newMsg.pin();
  } catch {
    // Permission manquante pour pin — pas grave
  }
}
