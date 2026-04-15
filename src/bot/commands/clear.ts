/**
 * clear.ts — Commande /clear
 * Supprime N messages dans le salon courant (ou un salon cible).
 * Réservé aux administrateurs ou modérateurs.
 *
 * Limite Discord : bulk delete uniquement sur messages < 14 jours.
 * Au-delà : suppression un par un (plus lent, avertissement affiché).
 */

import {
  ChatInputCommandInteraction,
  SlashCommandBuilder,
  EmbedBuilder,
  TextChannel,
  MessageFlags,
  PermissionFlagsBits,
} from "discord.js";
import { logger } from "../../utils/logger";

export const data = new SlashCommandBuilder()
  .setName("clear")
  .setDescription("🧹 [ADMIN] Supprime des messages dans le salon")
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
  .addIntegerOption((opt) =>
    opt
      .setName("amount")
      .setDescription("Nombre de messages à supprimer (1–500)")
      .setRequired(true)
      .setMinValue(1)
      .setMaxValue(500)
  )
  .addStringOption((opt) =>
    opt
      .setName("filter")
      .setDescription("Filtrer les messages (défaut : tous)")
      .addChoices(
        { name: "🤖 Seulement les messages du bot", value: "bot_only" },
        { name: "👤 Seulement les messages humains", value: "humans_only" },
        { name: "📋 Tous les messages", value: "all" },
        { name: "🔍 Messages contenant un texte précis", value: "contains" },
      )
  )
  .addStringOption((opt) =>
    opt
      .setName("contains")
      .setDescription('Texte à chercher dans les messages (si filtre "contains")')
  )
  .addChannelOption((opt) =>
    opt
      .setName("channel")
      .setDescription("Salon cible (défaut : salon actuel)")
  ) as SlashCommandBuilder;

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const amount   = interaction.options.getInteger("amount", true);
  const filter   = interaction.options.getString("filter") ?? "all";
  const contains = interaction.options.getString("contains");
  const channelOpt = interaction.options.getChannel("channel");

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  try {
    // Déterminer le salon cible
    const targetChannel = (channelOpt ?? interaction.channel) as TextChannel | null;

    if (!targetChannel || !(targetChannel instanceof TextChannel)) {
      await interaction.editReply("❌ Salon invalide ou non-textuel.");
      return;
    }

    if (!targetChannel.permissionsFor(interaction.client.user!)?.has(PermissionFlagsBits.ManageMessages)) {
      await interaction.editReply("❌ Je n'ai pas la permission `Gérer les messages` dans ce salon.");
      return;
    }

    // Récupérer les messages
    let fetched = await targetChannel.messages.fetch({ limit: Math.min(amount + 10, 100) });

    // Appliquer le filtre
    switch (filter) {
      case "bot_only":
        fetched = fetched.filter((m) => m.author.bot);
        break;
      case "humans_only":
        fetched = fetched.filter((m) => !m.author.bot);
        break;
      case "contains":
        if (contains) {
          fetched = fetched.filter((m) =>
            m.content.toLowerCase().includes(contains.toLowerCase())
          );
        }
        break;
      default:
        break;
    }

    // Limiter au nombre demandé
    const toDelete = fetched.first(amount);

    if (toDelete.length === 0) {
      await interaction.editReply("📭 Aucun message ne correspond à ce filtre.");
      return;
    }

    // Séparer messages récents (< 14j) et anciens
    const twoWeeksAgo = Date.now() - 14 * 24 * 60 * 60 * 1000;
    const recentMsgs  = toDelete.filter((m) => m.createdTimestamp > twoWeeksAgo);
    const oldMsgs     = toDelete.filter((m) => m.createdTimestamp <= twoWeeksAgo);

    let deletedCount = 0;
    let warnings: string[] = [];

    // Bulk delete pour les messages récents (max 100 à la fois)
    if (recentMsgs.length > 0) {
      const chunks: typeof recentMsgs[] = [];
      const arr = [...recentMsgs];
      while (arr.length) chunks.push(arr.splice(0, 100));

      for (const chunk of chunks) {
        if (chunk.length === 1) {
          await chunk[0].delete();
          deletedCount++;
        } else {
          const result = await targetChannel.bulkDelete(chunk, true);
          deletedCount += result.size;
        }
      }
    }

    // Suppression un par un pour les messages > 14j
    if (oldMsgs.length > 0) {
      warnings.push(`⚠️ ${oldMsgs.length} message(s) > 14 jours supprimé(s) un par un (plus lent).`);
      for (const msg of oldMsgs) {
        try {
          await msg.delete();
          deletedCount++;
          // Petit délai pour éviter le rate limit
          await new Promise((r) => setTimeout(r, 250));
        } catch {
          // Message déjà supprimé ou permission manquante
        }
      }
    }

    const embed = new EmbedBuilder()
      .setTitle("🧹 Salon nettoyé")
      .setColor(0x5865f2)
      .setDescription(
        `**${deletedCount}** message(s) supprimé(s) dans ${targetChannel}\n` +
        (warnings.length ? warnings.join("\n") : "")
      )
      .addFields(
        { name: "Filtre appliqué", value: filter === "contains" ? `contains: "${contains}"` : filter, inline: true },
        { name: "Salon", value: `${targetChannel}`, inline: true },
        { name: "Par", value: `${interaction.user}`, inline: true },
      )
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });

    logger.info(
      `🧹 /clear: ${deletedCount} messages supprimés dans #${targetChannel.name} par ${interaction.user.tag}`
    );
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    logger.error(`❌ Erreur /clear: ${msg}`);
    await interaction.editReply(`❌ Erreur: ${msg}`);
  }
}
