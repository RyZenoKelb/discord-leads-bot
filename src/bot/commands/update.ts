/**
 * update.ts — Commande /update
 * Rafraîchit le salon "à-appeler" avec tous les leads à traiter.
 * Mentionne l'associé et affiche les boutons de workflow d'appel.
 * Leads triés par lead_score décroissant.
 */

import {
  ChatInputCommandInteraction,
  SlashCommandBuilder,
  TextChannel,
  EmbedBuilder,
  MessageFlags,
} from "discord.js";
import { config } from "../../config";
import { logger } from "../../utils/logger";
import { getActionableLeads, Lead } from "../../db/queries";
import { buildCallActionRows, buildStatusTag } from "../embeds";

// ─── Définition de la commande ─────────────────────

export const data = new SlashCommandBuilder()
  .setName("update")
  .setDescription("🔄 Rafraîchit le salon d'appels avec tous les leads à traiter, triés par score");

// ─── Exécution ─────────────────────────────────────

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const guildId = interaction.guildId;
  if (!guildId) {
    await interaction.reply({ content: "❌ Cette commande ne fonctionne que dans un serveur.", flags: MessageFlags.Ephemeral });
    return;
  }

  // Vérifier que le salon d'appel est configuré
  if (!config.callChannelId) {
    await interaction.reply({
      content: "❌ Le salon d'appels n'est pas configuré. Ajoute `CALL_CHANNEL_ID` dans ton `.env`.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  try {
    // Récupérer le salon
    const channel = await interaction.client.channels.fetch(config.callChannelId);
    if (!channel || !(channel instanceof TextChannel)) {
      await interaction.editReply("❌ Impossible de trouver le salon d'appels. Vérifie `CALL_CHANNEL_ID`.");
      return;
    }

    // Récupérer les leads à traiter
    const leads = getActionableLeads(guildId);

    if (leads.length === 0) {
      await interaction.editReply("📭 Aucun lead à traiter pour le moment.");
      return;
    }

    // ─── Nettoyage des anciens messages du bot ───────
    await interaction.editReply(`🧹 Nettoyage du salon <#${config.callChannelId}>…`);

    try {
      let deleted = 0;
      let fetchedMessages;
      do {
        fetchedMessages = await channel.messages.fetch({ limit: 100 });
        const botMessages = fetchedMessages.filter((m) => m.author.id === interaction.client.user!.id);
        if (botMessages.size === 0) break;

        for (const msg of botMessages.values()) {
          try {
            await msg.delete();
            deleted++;
          } catch {
            // Message déjà supprimé ou permission manquante
          }
        }
      } while (fetchedMessages.size >= 100);

      logger.info(`🧹 ${deleted} ancien(s) message(s) supprimé(s) dans #${channel.name}`);
    } catch (err: any) {
      logger.warn(`⚠️ Nettoyage partiel du salon: ${err.message}`);
    }

    // ─── Mention de l'associé ────────────────────────
    const associateMention = config.associateUserId ? `<@${config.associateUserId}>` : "";

    // Message d'en-tête
    const avgScore = leads.length > 0
      ? Math.round(leads.reduce((sum, l) => sum + l.lead_score, 0) / leads.length)
      : 0;

    const headerEmbed = new EmbedBuilder()
      .setColor(0x2ecc71)
      .setTitle("📞 Leads à traiter")
      .setDescription(
        [
          `**${leads.length}** lead(s) en attente d'action.`,
          "",
          `🟢 **CALL** (à appeler) : ${leads.filter((l) => l.status === "CALL").length}`,
          `🟡 **CHECK** (à vérifier) : ${leads.filter((l) => l.status === "CHECK").length}`,
          `🆕 **NEW** (nouveaux) : ${leads.filter((l) => l.status === "NEW").length}`,
          `🎯 Score moyen : **${avgScore}/100**`,
          "",
          associateMention ? `👤 Assigné à ${associateMention}` : "",
        ]
          .filter(Boolean)
          .join("\n")
      )
      .setTimestamp()
      .setFooter({ text: "Trié par score • Utilise les boutons pour mettre à jour le statut." });

    await channel.send({
      content: associateMention ? `${associateMention} — voici les leads à traiter 👇` : undefined,
      embeds: [headerEmbed],
    });

    // ─── Poster chaque lead ──────────────────────────
    await interaction.editReply(`📤 Envoi de ${leads.length} lead(s) dans <#${config.callChannelId}>…`);

    let posted = 0;
    for (const lead of leads) {
      const embed = buildLeadUpdateEmbed(lead, posted + 1);
      const actionRows = buildCallActionRows(lead.place_id);

      await channel.send({
        embeds: [embed],
        components: actionRows,
      });

      posted++;

      // Rate limit basique pour ne pas spam l'API Discord
      if (posted % 5 === 0) {
        await new Promise((r) => setTimeout(r, 1000));
      }
    }

    await interaction.editReply(
      `✅ **${posted}** lead(s) envoyé(s) dans <#${config.callChannelId}>. Bon courage ! 💪`
    );

    logger.info(`📞 /update: ${posted} leads postés dans #${channel.name} par ${interaction.user.tag}`);

  } catch (error: any) {
    logger.error(`❌ Erreur /update: ${error.message}\n${error.stack}`);
    await interaction.editReply(`❌ Erreur: ${error.message}`);
  }
}

// ─── Embed de lead pour le salon d'appel ───────────

function buildLeadUpdateEmbed(lead: Lead, index: number): EmbedBuilder {
  const statusColors: Record<string, number> = {
    CALL: 0x2ecc71,
    CHECK: 0xf39c12,
    NEW: 0x3498db,
  };

  const color = statusColors[lead.status] || 0x2b82d9;

  const websiteDisplay = lead.no_website
    ? "❌ Pas de site web"
    : lead.social_only
      ? `🟡 Social only: ${lead.website || "—"}`
      : `🌐 ${lead.website || "—"}`;

  const tags: string[] = [];
  if (lead.no_website) tags.push("🚫 No Website");
  if (lead.social_only) tags.push("📱 Social Only");
  if (lead.french_business) tags.push("🇫🇷 Business FR");

  const embed = new EmbedBuilder()
    .setColor(color)
    .setTitle(`#${index} ${lead.name}`)
    .addFields(
      {
        name: "📌 Statut",
        value: buildStatusTag(lead.status),
        inline: true,
      },
      {
        name: "🎯 Score",
        value: `**${lead.lead_score}/100**`,
        inline: true,
      },
      {
        name: "📍 Adresse",
        value: lead.address || "Non disponible",
        inline: false,
      },
      {
        name: "📞 Téléphone",
        value: lead.phone || "Non disponible",
        inline: true,
      },
      {
        name: "⭐ Note",
        value: lead.rating ? `${lead.rating}/5 (${lead.reviews || 0} avis)` : "—",
        inline: true,
      },
      {
        name: "🌐 Site web",
        value: websiteDisplay,
        inline: false,
      }
    )
    .setTimestamp();

  if (lead.google_maps_url) {
    embed.setURL(lead.google_maps_url);
  }

  if (lead.scan_query || lead.scan_city) {
    embed.addFields({
      name: "🔍 Source",
      value: `${lead.scan_query || "—"} @ ${lead.scan_city || "—"}`,
      inline: false,
    });
  }

  if (tags.length > 0) {
    embed.setFooter({ text: tags.join(" | ") });
  }

  return embed;
}
