/**
 * leadNotes.ts — Commande /lead_notes
 * Voir et gérer les notes/commentaires d'un lead.
 */

import {
  ChatInputCommandInteraction,
  SlashCommandBuilder,
  MessageFlags,
  EmbedBuilder,
} from "discord.js";
import { logger } from "../../utils/logger";
import {
  getLeadByPlaceId,
  getLeadNotes,
  countLeadNotes,
  getLastCallbackReason,
} from "../../db/queries";

export const data = new SlashCommandBuilder()
  .setName("lead_notes")
  .setDescription("📝 Voir les notes, commentaires et raisons de rappel d'un lead")
  .addStringOption((opt) =>
    opt.setName("place_id").setDescription("L'identifiant Google du lead (visible dans l'embed)").setRequired(true)
  ) as SlashCommandBuilder;

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const placeId = interaction.options.getString("place_id", true);

  const lead = getLeadByPlaceId(placeId);
  if (!lead) {
    await interaction.reply({ content: "❌ Lead introuvable.", flags: MessageFlags.Ephemeral });
    return;
  }

  const notes = getLeadNotes(placeId);
  const lastCallback = getLastCallbackReason(placeId);

  const embed = new EmbedBuilder()
    .setColor(0x3498db)
    .setTitle(`📝 Notes — ${lead.name}`)
    .setDescription(
      notes.length > 0
        ? `**${notes.length} note(s)** pour ce lead`
        : "Aucune note pour ce lead."
    )
    .setTimestamp();

  if (lead.google_maps_url) {
    embed.setURL(lead.google_maps_url);
  }

  // Last callback reason
  if (lastCallback) {
    embed.addFields({
      name: "🔄 Dernière raison de rappel",
      value: `> ${lastCallback.reason || lastCallback.content}\n*— ${lastCallback.user_tag || "?"} le ${lastCallback.created_at || "?"}*`,
      inline: false,
    });
  }

  // Show last 10 notes
  const displayNotes = notes.slice(0, 10);
  for (const note of displayNotes) {
    const typeEmoji = getTypeEmoji(note.type);
    const noteTitle = `${typeEmoji} ${note.type.toUpperCase()}${note.reason ? ` — ${note.reason}` : ""}`;
    const noteValue = `> ${note.content.substring(0, 200)}\n*— ${note.user_tag || "?"} le ${note.created_at || "?"}*`;
    embed.addFields({ name: noteTitle, value: noteValue, inline: false });
  }

  if (notes.length > 10) {
    embed.setFooter({ text: `... et ${notes.length - 10} autres notes` });
  }

  await interaction.reply({
    embeds: [embed],
    flags: MessageFlags.Ephemeral,
  });

  logger.info(`📝 /lead_notes pour ${placeId} par ${interaction.user.tag}`);
}

function getTypeEmoji(type: string): string {
  switch (type) {
    case "note": return "📝";
    case "callback_reason": return "🔄";
    case "meeting": return "📅";
    case "refusal": return "❌";
    default: return "💬";
  }
}
