/**
 * modals.ts — Gère les interactions modales Discord.
 *
 * Modales :
 *   - add_note:{placeId}     — Ajouter une note/commentaire
 *   - callback_reason:{placeId} — Raison de rappel
 *   - log_meeting:{placeId}  — Logger un rendez-vous
 *   - log_revenue:{placeId}  — Logger du revenu (deal conclu)
 */

import {
  ModalSubmitInteraction,
  MessageFlags,
} from "discord.js";
import {
  addLeadNote,
  getLeadByPlaceId,
  logActivity,
  markLeadCalled,
} from "../../db/queries";
import { logger } from "../../utils/logger";

export async function handleModal(interaction: ModalSubmitInteraction): Promise<void> {
  const customId = interaction.customId;

  try {
    // ─── Add Note ────────────────────────────────
    if (customId.startsWith("add_note:")) {
      await handleAddNote(interaction);
      return;
    }

    // ─── Callback Reason ─────────────────────────
    if (customId.startsWith("callback_reason:")) {
      await handleCallbackReason(interaction);
      return;
    }

    // ─── Log Meeting ─────────────────────────────
    if (customId.startsWith("log_meeting:")) {
      await handleLogMeeting(interaction);
      return;
    }

    // ─── Log Revenue ─────────────────────────────
    if (customId.startsWith("log_revenue:")) {
      await handleLogRevenue(interaction);
      return;
    }

    await interaction.reply({
      content: "❌ Modale inconnue.",
      flags: MessageFlags.Ephemeral,
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    logger.error(`❌ Erreur modale ${customId}: ${msg}`);
    try {
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp({ content: `❌ Erreur: ${msg}`, flags: MessageFlags.Ephemeral });
      } else {
        await interaction.reply({ content: `❌ Erreur: ${msg}`, flags: MessageFlags.Ephemeral });
      }
    } catch {
      // Silent
    }
  }
}

// ─── Add Note Handler ──────────────────────────────

async function handleAddNote(interaction: ModalSubmitInteraction): Promise<void> {
  const placeId = interaction.customId.split(":")[1];
  const content = interaction.fields.getTextInputValue("note_content");

  if (!content.trim()) {
    await interaction.reply({ content: "❌ La note ne peut pas être vide.", flags: MessageFlags.Ephemeral });
    return;
  }

  const lead = getLeadByPlaceId(placeId);
  if (!lead) {
    await interaction.reply({ content: "❌ Lead introuvable.", flags: MessageFlags.Ephemeral });
    return;
  }

  addLeadNote({
    place_id: placeId,
    user_id: interaction.user.id,
    user_tag: interaction.user.tag,
    type: "note",
    content: content.trim(),
  });

  // Log activity
  if (interaction.guildId) {
    logActivity({
      guild_id: interaction.guildId,
      user_id: interaction.user.id,
      user_tag: interaction.user.tag,
      type: "note_added",
      place_id: placeId,
      details: content.trim().substring(0, 100),
      revenue: 0,
    });
  }

  await interaction.reply({
    content: `📝 Note ajoutée pour **${lead.name}** :\n> ${content.trim().substring(0, 200)}`,
    flags: MessageFlags.Ephemeral,
  });

  logger.info(`📝 Note ajoutée pour ${placeId} par ${interaction.user.tag}`);
}

// ─── Callback Reason Handler ───────────────────────

async function handleCallbackReason(interaction: ModalSubmitInteraction): Promise<void> {
  const placeId = interaction.customId.split(":")[1];
  const reason = interaction.fields.getTextInputValue("callback_reason_text");
  const notes = interaction.fields.getTextInputValue("callback_notes") || "";

  if (!reason.trim()) {
    await interaction.reply({ content: "❌ La raison ne peut pas être vide.", flags: MessageFlags.Ephemeral });
    return;
  }

  const lead = getLeadByPlaceId(placeId);
  if (!lead) {
    await interaction.reply({ content: "❌ Lead introuvable.", flags: MessageFlags.Ephemeral });
    return;
  }

  addLeadNote({
    place_id: placeId,
    user_id: interaction.user.id,
    user_tag: interaction.user.tag,
    type: "callback_reason",
    reason: reason.trim(),
    content: notes.trim() || reason.trim(),
  });

  // Mark as called
  markLeadCalled(placeId);

  // Log activity
  if (interaction.guildId) {
    logActivity({
      guild_id: interaction.guildId,
      user_id: interaction.user.id,
      user_tag: interaction.user.tag,
      type: "callback",
      place_id: placeId,
      details: reason.trim(),
      revenue: 0,
    });
  }

  await interaction.reply({
    content: `🔄 **Raison de rappel** pour **${lead.name}** :\n> **Raison :** ${reason.trim()}\n${notes ? `> **Notes :** ${notes.trim().substring(0, 200)}` : ""}`,
    flags: MessageFlags.Ephemeral,
  });

  logger.info(`🔄 Callback reason pour ${placeId} par ${interaction.user.tag}: ${reason.trim()}`);
}

// ─── Log Meeting Handler ───────────────────────────

async function handleLogMeeting(interaction: ModalSubmitInteraction): Promise<void> {
  const placeId = interaction.customId.split(":")[1];
  const details = interaction.fields.getTextInputValue("meeting_details");

  const lead = getLeadByPlaceId(placeId);
  if (!lead) {
    await interaction.reply({ content: "❌ Lead introuvable.", flags: MessageFlags.Ephemeral });
    return;
  }

  addLeadNote({
    place_id: placeId,
    user_id: interaction.user.id,
    user_tag: interaction.user.tag,
    type: "meeting",
    content: details.trim() || "Rendez-vous",
  });

  // Log activity
  if (interaction.guildId) {
    logActivity({
      guild_id: interaction.guildId,
      user_id: interaction.user.id,
      user_tag: interaction.user.tag,
      type: "meeting",
      place_id: placeId,
      details: details.trim(),
      revenue: 0,
    });
  }

  await interaction.reply({
    content: `📅 **Rendez-vous** enregistré pour **${lead.name}** !\n${details ? `> ${details.trim().substring(0, 200)}` : ""}`,
    flags: MessageFlags.Ephemeral,
  });

  logger.info(`📅 Meeting logged pour ${placeId} par ${interaction.user.tag}`);
}

// ─── Log Revenue Handler ───────────────────────────

async function handleLogRevenue(interaction: ModalSubmitInteraction): Promise<void> {
  const placeId = interaction.customId.split(":")[1];
  const amountStr = interaction.fields.getTextInputValue("revenue_amount");
  const details = interaction.fields.getTextInputValue("revenue_details") || "";

  const amount = parseFloat(amountStr.replace(/[^0-9.,]/g, "").replace(",", "."));
  if (isNaN(amount) || amount <= 0) {
    await interaction.reply({
      content: "❌ Montant invalide. Entrez un nombre positif (ex: 1500).",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const lead = getLeadByPlaceId(placeId);
  if (!lead) {
    await interaction.reply({ content: "❌ Lead introuvable.", flags: MessageFlags.Ephemeral });
    return;
  }

  addLeadNote({
    place_id: placeId,
    user_id: interaction.user.id,
    user_tag: interaction.user.tag,
    type: "refusal",
    reason: "closed",
    content: `💰 Deal conclu: ${amount}€ — ${details}`.trim(),
  });

  // Log activity with revenue
  if (interaction.guildId) {
    logActivity({
      guild_id: interaction.guildId,
      user_id: interaction.user.id,
      user_tag: interaction.user.tag,
      type: "closed",
      place_id: placeId,
      details: details.trim(),
      revenue: amount,
    });
  }

  await interaction.reply({
    content: `💰 **Deal conclu** pour **${lead.name}** : **${amount.toFixed(2)}€**\n${details ? `> ${details.trim().substring(0, 200)}` : ""}`,
    flags: MessageFlags.Ephemeral,
  });

  logger.info(`💰 Revenue ${amount}€ pour ${placeId} par ${interaction.user.tag}`);
}
