/**
 * export.ts — Commande /export
 * Exporte les leads en CSV et envoie le fichier dans Discord.
 *
 * Scopes:
 *   - last_scan : les leads du dernier scan
 *   - all       : tous les leads de ce serveur
 *   - date_range: entre deux dates (YYYY-MM-DD)
 */

import {
  ChatInputCommandInteraction,
  SlashCommandBuilder,
  AttachmentBuilder,
  MessageFlags,
} from "discord.js";
import { getRecentLeads, getLeadsByScan, getLeadsByDateRange } from "../../db/queries";
import { leadsToCSV } from "../../utils/csv";
import { logger } from "../../utils/logger";

export const data = new SlashCommandBuilder()
  .setName("export")
  .setDescription("📥 Exporte les leads en fichier CSV (ouvrable dans Excel / Google Sheets)")
  .addStringOption((opt) =>
    opt
      .setName("scope")
      .setDescription("Quels leads exporter ?")
      .setRequired(true)
      .addChoices(
        { name: "📋 Dernier scan", value: "last_scan" },
        { name: "📦 Tous les leads", value: "all" },
        { name: "📅 Par dates (préciser from et to)", value: "date_range" }
      )
  )
  .addStringOption((opt) =>
    opt
      .setName("from")
      .setDescription("Date de début au format AAAA-MM-JJ (ex : 2026-01-01)")
  )
  .addStringOption((opt) =>
    opt
      .setName("to")
      .setDescription("Date de fin au format AAAA-MM-JJ (ex : 2026-02-15)")
  )
  .addIntegerOption((opt) =>
    opt
      .setName("limit")
      .setDescription("Nombre max de leads à exporter (défaut : 500)")
      .setMinValue(1)
      .setMaxValue(10000)
  ) as SlashCommandBuilder;

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const guildId = interaction.guildId;
  if (!guildId) {
    await interaction.reply({ content: "❌ Commande serveur uniquement.", flags: MessageFlags.Ephemeral });
    return;
  }

  const scope = interaction.options.getString("scope", true);
  const from = interaction.options.getString("from");
  const to = interaction.options.getString("to");
  const limit = interaction.options.getInteger("limit") ?? 500;

  await interaction.deferReply();

  try {
    let leads;

    switch (scope) {
      case "last_scan":
        leads = getRecentLeads(guildId, limit);
        break;

      case "all":
        leads = getRecentLeads(guildId, limit);
        break;

      case "date_range":
        if (!from || !to) {
          await interaction.editReply("❌ Pour le scope `date_range`, indique `from` et `to` (format YYYY-MM-DD).");
          return;
        }
        leads = getLeadsByDateRange(guildId, from, to);
        break;

      default:
        leads = getRecentLeads(guildId, limit);
    }

    if (!leads || leads.length === 0) {
      await interaction.editReply("📭 Aucun lead trouvé pour ce scope.");
      return;
    }

    // Générer le CSV
    const csvContent = leadsToCSV(leads);
    const buffer = Buffer.from(csvContent, "utf-8");
    const now = new Date().toISOString().slice(0, 10);
    const filename = `leads_${scope}_${now}.csv`;

    const attachment = new AttachmentBuilder(buffer, { name: filename });

    await interaction.editReply({
      content: `📥 **Export terminé !** ${leads.length} leads exportés.\n\n` +
        `> 💡 **TODO** : L'upload Google Sheets sera dispo dans une future version.\n` +
        `> Pour l'instant, ouvre le CSV dans Excel/Google Sheets.`,
      files: [attachment],
    });

    logger.info(`📥 Export ${scope}: ${leads.length} leads pour guild ${guildId}`);

  } catch (error: any) {
    logger.error(`❌ Erreur export: ${error.message}`);
    await interaction.editReply(`❌ Erreur: ${error.message}`);
  }
}
