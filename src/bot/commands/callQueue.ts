/**
 * callQueue.ts — Commandes /call_queue et /call_next
 * File d'appels priorisée par lead_score.
 * Affiche UN lead à la fois avec boutons de workflow.
 */

import {
  ChatInputCommandInteraction,
  SlashCommandBuilder,
  TextChannel,
  MessageFlags,
} from "discord.js";
import { config } from "../../config";
import { logger } from "../../utils/logger";
import {
  getNextCallQueueLead,
  upsertCallSession,
  getCallSession,
  getActionableLeads,
  getLeadNotes,
  getLeadEmails,
} from "../../db/queries";
import { buildCallQueueEmbed, buildCallQueueButtons } from "../embeds";

// ─── /call_queue — Démarre / affiche la file ───────

export const callQueueData = new SlashCommandBuilder()
  .setName("call_queue")
  .setDescription("📞 Ouvre ta file d'appels triée par score — affiche le prochain lead à traiter") as SlashCommandBuilder;

export async function callQueueExecute(interaction: ChatInputCommandInteraction): Promise<void> {
  const guildId = interaction.guildId;
  if (!guildId) {
    await interaction.reply({ content: "❌ Commande serveur uniquement.", flags: MessageFlags.Ephemeral });
    return;
  }

  await interaction.deferReply();

  try {
    const userId = interaction.user.id;

    // Check if there's a channel configured
    const channelId = config.callQueueChannelId || interaction.channelId;
    const channel = await interaction.client.channels.fetch(channelId);
    if (!channel || !(channel instanceof TextChannel)) {
      await interaction.editReply("❌ Salon call queue introuvable.");
      return;
    }

    // Get leads count
    const actionable = getActionableLeads(guildId);
    if (actionable.length === 0) {
      await interaction.editReply("📭 Aucun lead en file d'attente.");
      return;
    }

    // Get next lead for this user
    const lead = getNextCallQueueLead(guildId, userId);
    if (!lead) {
      await interaction.editReply("📭 Plus aucun lead disponible pour toi. Tous sont pris ou traités.");
      return;
    }

    // Save session cursor
    upsertCallSession(userId, lead.place_id);

    // Build & send embed
    const notes = getLeadNotes(lead.place_id);
    const emails = getLeadEmails(lead.place_id);
    const embed = buildCallQueueEmbed(lead, notes, emails);
    const buttons = buildCallQueueButtons(userId, lead.place_id);

    await interaction.editReply({
      content: `📞 **File d'appels** — ${actionable.length} lead(s) en attente • Trié par score décroissant`,
      embeds: [embed],
      components: buttons,
    });

    logger.info(`📞 /call_queue: lead ${lead.place_id} (score ${lead.lead_score}) pour ${interaction.user.tag}`);

  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    logger.error(`❌ Erreur /call_queue: ${msg}`);
    await interaction.editReply(`❌ Erreur: ${msg}`);
  }
}

// ─── /call_next — Passe au lead suivant ────────────

export const callNextData = new SlashCommandBuilder()
  .setName("call_next")
  .setDescription("➡️ Passe au lead suivant dans ta file d'appels") as SlashCommandBuilder;

export async function callNextExecute(interaction: ChatInputCommandInteraction): Promise<void> {
  const guildId = interaction.guildId;
  if (!guildId) {
    await interaction.reply({ content: "❌ Commande serveur uniquement.", flags: MessageFlags.Ephemeral });
    return;
  }

  await interaction.deferReply();

  try {
    const userId = interaction.user.id;
    const session = getCallSession(userId);
    const currentPlaceId = session?.current_place_id ?? undefined;

    const lead = getNextCallQueueLead(guildId, userId, currentPlaceId);
    if (!lead) {
      await interaction.editReply("📭 Plus de leads disponibles. Bravo, tu as tout traité ! 🎉");
      return;
    }

    upsertCallSession(userId, lead.place_id);

    const notes = getLeadNotes(lead.place_id);
    const emails = getLeadEmails(lead.place_id);
    const embed = buildCallQueueEmbed(lead, notes, emails);
    const buttons = buildCallQueueButtons(userId, lead.place_id);

    await interaction.editReply({
      content: `➡️ **Lead suivant** (score: ${lead.lead_score}/100)`,
      embeds: [embed],
      components: buttons,
    });

    logger.info(`➡️ /call_next: lead ${lead.place_id} (score ${lead.lead_score}) pour ${interaction.user.tag}`);

  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    logger.error(`❌ Erreur /call_next: ${msg}`);
    await interaction.editReply(`❌ Erreur: ${msg}`);
  }
}
