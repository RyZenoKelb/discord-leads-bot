/**
 * leadSearch.ts — Commande /lead_search
 * Recherche des leads dans la BDD par nom, ville, téléphone ou email.
 * Parfait pour retrouver un lead déjà scanné rapidement sans exporter.
 */

import {
  ChatInputCommandInteraction,
  SlashCommandBuilder,
  EmbedBuilder,
  MessageFlags,
} from "discord.js";
import { getDb } from "../../db/schema";
import { logger } from "../../utils/logger";

export const data = new SlashCommandBuilder()
  .setName("lead_search")
  .setDescription("🔎 Recherche un lead dans la base par nom, ville, tel ou email")
  .addStringOption((opt) =>
    opt
      .setName("query")
      .setDescription("Texte à rechercher (nom de commerce, ville, numéro, email…)")
      .setRequired(true)
      .setMinLength(2)
  )
  .addStringOption((opt) =>
    opt
      .setName("status")
      .setDescription("Filtrer par statut")
      .addChoices(
        { name: "🆕 NEW",    value: "NEW"    },
        { name: "📞 CALL",   value: "CALL"   },
        { name: "🔍 CHECK",  value: "CHECK"  },
        { name: "✅ DONE",   value: "DONE"   },
        { name: "🚫 IGNORE", value: "IGNORE" },
        { name: "📋 Tous",   value: "all"    },
      )
  )
  .addIntegerOption((opt) =>
    opt
      .setName("limit")
      .setDescription("Nombre de résultats max (défaut : 5)")
      .setMinValue(1)
      .setMaxValue(20)
  ) as SlashCommandBuilder;

interface SearchRow {
  name: string;
  scan_city: string | null;
  phone: string | null;
  email: string | null;
  lead_score: number;
  status: string;
  google_maps_url: string | null;
  no_website: number;
  rating: number | null;
  reviews: number | null;
  place_id: string;
  scanned_at: string | null;
  tags: string | null;
}

const STATUS_EMOJI: Record<string, string> = {
  NEW:    "🆕",
  CALL:   "📞",
  CHECK:  "🔍",
  DONE:   "✅",
  IGNORE: "🚫",
};

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const guildId = interaction.guildId;
  if (!guildId) {
    await interaction.reply({ content: "❌ Commande serveur uniquement.", flags: MessageFlags.Ephemeral });
    return;
  }

  const queryText = interaction.options.getString("query", true).trim();
  const status    = interaction.options.getString("status") ?? "all";
  const limit     = interaction.options.getInteger("limit") ?? 5;

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  try {
    const db = getDb();
    const pattern = `%${queryText}%`;

    let sql = `
      SELECT name, scan_city, phone, email, lead_score, status,
             google_maps_url, no_website, rating, reviews, place_id, scanned_at, tags
      FROM leads
      WHERE guild_id = ?
        AND (
          name    LIKE ? OR
          scan_city LIKE ? OR
          phone   LIKE ? OR
          email   LIKE ? OR
          address LIKE ?
        )
    `;
    const params: unknown[] = [guildId, pattern, pattern, pattern, pattern, pattern];

    if (status !== "all") {
      sql += " AND status = ?";
      params.push(status);
    }

    sql += " ORDER BY lead_score DESC, scanned_at DESC LIMIT ?";
    params.push(limit);

    const rows = db.prepare(sql).all(...params) as SearchRow[];

    if (rows.length === 0) {
      await interaction.editReply(
        `🔍 Aucun lead trouvé pour **"${queryText}"**.`
      );
      return;
    }

    const lines = rows.map((r, i) => {
      const emoji   = STATUS_EMOJI[r.status] ?? "❓";
      const phone   = r.phone   ? `📞 ${r.phone}` : "_pas de tél_";
      const email   = r.email   ? `📧 \`${r.email}\`` : "";
      const noWs    = r.no_website ? "🚫 Sans site" : "";
      const rating  = r.rating != null ? `⭐ ${r.rating}` : "";
      const reviews = r.reviews != null ? `(${r.reviews} avis)` : "";
      const maps    = r.google_maps_url ? `[Maps](${r.google_maps_url})` : "";
      const date    = r.scanned_at ? r.scanned_at.slice(0, 10) : "—";
      const tags    = r.tags ? `\`${r.tags}\`` : "";

      return [
        `**${i + 1}. ${emoji} ${r.name}** — Score \`${r.lead_score}/100\` · _${date}_`,
        `└ 📍 ${r.scan_city ?? "?"} · ${phone} ${email}`,
        `└ ${rating} ${reviews} ${noWs} ${tags} ${maps}`,
      ].join("\n");
    });

    const embed = new EmbedBuilder()
      .setTitle(`🔎 Résultats pour « ${queryText} »`)
      .setColor(0x5865f2)
      .setDescription(lines.join("\n\n"))
      .setFooter({
        text: `${rows.length} résultat(s) · Filtre: ${status} · /update pour modifier un lead`,
      })
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });

    logger.info(
      `🔎 /lead_search "${queryText}" → ${rows.length} résultats pour ${interaction.user.tag}`
    );
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    logger.error(`❌ Erreur /lead_search: ${msg}`);
    await interaction.editReply(`❌ Erreur: ${msg}`);
  }
}
