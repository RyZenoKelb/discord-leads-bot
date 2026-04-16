/**
 * hunt.ts — Commande /hunt
 * Mode chasse : détecte sur tout internet les personnes qui demandent un site web.
 *
 * Sources couvertes : Reddit, Forums FR, Instagram, LinkedIn, Twitter, Facebook, etc.
 * Filtres : zone géographique, domaine, période, source, langue.
 */

import {
  ChatInputCommandInteraction,
  SlashCommandBuilder,
  TextChannel,
  MessageFlags,
} from "discord.js";
import { runHunt, type WebRequestLead } from "../../services/webRequestDetector";
import { upsertWebRequest } from "../../db/queries";
import { logger } from "../../utils/logger";
import {
  buildWebRequestEmbed,
  buildHuntSummaryEmbed,
  buildWebRequestActionRow,
} from "../embeds";

// ─── Définition de la commande ─────────────────────

export const data = new SlashCommandBuilder()
  .setName("hunt")
  .setDescription("🎯 Chasse sur tout Internet les personnes cherchant un créateur de site web")
  .addStringOption((opt) =>
    opt
      .setName("zone")
      .setDescription('Zone géographique cible (ex : "Paris", "France", "Netanya", "Israël")')
      .setRequired(false)
  )
  .addStringOption((opt) =>
    opt
      .setName("domain")
      .setDescription("Secteur d'activité ciblé")
      .setRequired(false)
      .addChoices(
        { name: "🌐 Tous les secteurs", value: "all" },
        { name: "🍽️ Restaurant / Food", value: "restaurant" },
        { name: "💇 Beauté / Coiffure", value: "beauty" },
        { name: "🏠 Immobilier", value: "immo" },
        { name: "🛠️ Artisan / BTP", value: "artisan" },
        { name: "🏥 Médical / Santé", value: "medical" },
        { name: "🛒 E-commerce", value: "ecommerce" },
        { name: "👤 Freelance / Consultant", value: "freelance" }
      )
  )
  .addStringOption((opt) =>
    opt
      .setName("date")
      .setDescription("Période de publication des messages")
      .setRequired(false)
      .addChoices(
        { name: "📅 Aujourd'hui", value: "day" },
        { name: "📆 Cette semaine", value: "week" },
        { name: "🗓️ Ce mois-ci", value: "month" },
        { name: "⏳ Tout (sans filtre)", value: "all" }
      )
  )
  .addStringOption((opt) =>
    opt
      .setName("source")
      .setDescription("Plateforme à cibler")
      .setRequired(false)
      .addChoices(
        { name: "🌐 Toutes les sources", value: "all" },
        { name: "🔴 Reddit uniquement", value: "reddit" },
        { name: "📘 Forums & sites web", value: "forum" },
        { name: "💼 LinkedIn", value: "linkedin" },
        { name: "📸 Instagram", value: "instagram" },
        { name: "🐦 Twitter / X", value: "twitter" },
        { name: "🛍️ LeBonCoin / Malt", value: "marketplace" }
      )
  )
  .addStringOption((opt) =>
    opt
      .setName("langue")
      .setDescription("Langue des recherches")
      .setRequired(false)
      .addChoices(
        { name: "🇫🇷 Français", value: "fr" },
        { name: "🇬🇧 Anglais", value: "en" },
        { name: "🇮🇱 Hébreu", value: "he" },
        { name: "🌍 Toutes les langues", value: "all" }
      )
  )
  .addIntegerOption((opt) =>
    opt
      .setName("limit")
      .setDescription("Nombre maximum de résultats (défaut : 20)")
      .setMinValue(5)
      .setMaxValue(100)
  ) as SlashCommandBuilder;

// ─── Exécution ──────────────────────────────────────

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const zone      = interaction.options.getString("zone") ?? undefined;
  const domain    = interaction.options.getString("domain") ?? "all";
  const dateRange = (interaction.options.getString("date") ?? "week") as "day" | "week" | "month" | "all";
  const source    = interaction.options.getString("source") ?? "all";
  const language  = (interaction.options.getString("langue") ?? "fr") as "fr" | "en" | "he" | "all";
  const limit     = interaction.options.getInteger("limit") ?? 20;

  await interaction.deferReply();

  const guildId = interaction.guildId ?? "DM";
  const channel = interaction.channel as TextChannel;

  // ─── Message de lancement ──────────────────────
  const dateLabels: Record<string, string> = {
    day: "aujourd'hui", week: "cette semaine", month: "ce mois", all: "tout",
  };
  const sourceLabels: Record<string, string> = {
    all: "toutes les sources", reddit: "Reddit", forum: "Forums", linkedin: "LinkedIn",
    instagram: "Instagram", twitter: "Twitter/X", marketplace: "LeBonCoin/Malt",
  };
  const domainLabels: Record<string, string> = {
    all: "tous secteurs", restaurant: "🍽️ Restaurant", beauty: "💇 Beauté",
    immo: "🏠 Immobilier", artisan: "🛠️ Artisan", medical: "🏥 Médical",
    ecommerce: "🛒 E-commerce", freelance: "👤 Freelance",
  };

  await interaction.editReply(
    [
      `## 🎯 Hunt en cours…`,
      `> 📍 **Zone :** ${zone ?? "Partout"}`,
      `> 🏷️ **Domaine :** ${domainLabels[domain] ?? domain}`,
      `> 📅 **Période :** ${dateLabels[dateRange]}`,
      `> 🌐 **Source :** ${sourceLabels[source] ?? source}`,
      `> 🔢 **Limite :** ${limit} résultats`,
      ``,
      `⏳ *Scan de tout internet en cours…*`,
    ].join("\n")
  );

  try {
    // ─── Lancer le hunt ──────────────────────────
    const result = await runHunt({
      zone,
      domain,
      dateRange,
      language,
      sources: source === "all" ? undefined : [source],
      limit,
      minScore: 30,
    });

    // ─── Sauvegarder en DB + poster les embeds ───
    let postedCount = 0;
    let savedCount  = 0;

    for (const lead of result.leads) {
      // Sauvegarder dans la DB
      const isNew = upsertWebRequest({
        source:          lead.source,
        url:             lead.url,
        title:           lead.title,
        snippet:         lead.snippet,
        domain:          lead.domain,
        location:        lead.location,
        request_type:    lead.requestType,
        relevance_score: lead.relevanceScore,
        language:        lead.language,
        posted_at:       lead.postedAt,
        status:          "NEW",
        guild_id:        guildId,
      });

      savedCount++;

      // Poster l'embed dans le channel
      if (channel) {
        try {
          const embed = buildWebRequestEmbed(lead, postedCount + 1);
          const row   = buildWebRequestActionRow(lead.url);
          await channel.send({ embeds: [embed], components: [row] });
          postedCount++;
        } catch (err) {
          logger.error(`Erreur envoi embed hunt: ${err}`);
        }
      }
    }

    // ─── Résumé final ────────────────────────────
    const summaryEmbed = buildHuntSummaryEmbed({
      zone:         zone ?? "Partout",
      domain,
      dateRange,
      source,
      totalFetched: result.totalFetched,
      totalKept:    result.totalKept,
      sourcesUsed:  result.sourcesUsed,
      hasSerpKey:   !!process.env.SERP_API_KEY,
    });

    await channel.send({ embeds: [summaryEmbed] });
    await interaction.editReply(
      `✅ **Hunt terminé !** — ${result.totalKept} demande(s) détectée(s) sur ${result.totalFetched} résultats analysés.`
    );

    logger.info(`🎯 Hunt terminé: ${result.totalKept} leads web (${result.sourcesUsed.join(", ")})`);

  } catch (error: any) {
    logger.error(`❌ Erreur hunt: ${error.message}`);
    await interaction.editReply(`❌ **Erreur pendant le Hunt :** ${error.message}`);
  }
}
