/**
 * scan.ts — Commande /scan
 * Lance un scan Google Places pour trouver des leads dans une zone donnée.
 *
 * Paramètres utilisateur:
 *   city       → Nom de ville (ex: "Paris", "Lyon") OU coordonnées "48.85,2.35"
 *   query      → Ce qu'on cherche (ex: "coiffeur", "boulangerie", "garage")
 *   radius     → Rayon de recherche en mètres (défaut 2500)
 *   language   → Langue des résultats (défaut "fr")
 *   domain     → Catégorie pré-définie (restaurant, beauty, auto, medical…)
 *   nosite     → Ne garder que les businesses SANS site web
 *   min_rating → Note minimum Google (ex: 3.5)
 *   min_reviews→ Nombre minimum d'avis
 *   country    → Code pays pour biaiser la recherche (ex: "FR", "IL")
 *   limit      → Nombre max de résultats (défaut 60)
 *   realtime   → Poster chaque lead au fil de l'eau (défaut: oui)
 */

import {
  ChatInputCommandInteraction,
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  TextChannel,
} from "discord.js";
import { v4 as uuidv4 } from "uuid";
import { config, DOMAIN_ALIASES } from "../../config";
import { logger } from "../../utils/logger";
import { geocodeCity, parseLatLng, LatLng } from "../../services/geocode";
import {
  nearbySearch,
  getPlaceDetails,
  processPlace,
  passesFilters,
  ProcessedLead,
} from "../../services/googlePlaces";
import {
  upsertLead,
  leadExists,
  createScanJob,
  updateScanJob,
} from "../../db/queries";
import { buildLeadEmbed, buildSummaryEmbed, buildActionRow } from "../embeds";

// ─── Définition de la commande ─────────────────────

export const data = new SlashCommandBuilder()
  .setName("scan")
  .setDescription("🔍 Scanner une zone pour trouver des commerces (leads) à prospecter")
  .addStringOption((opt) =>
    opt
      .setName("city")
      .setDescription('Ville à scanner (ex : "Netanya", "Tel Aviv") ou coordonnées "32.07,34.77"')
      .setRequired(true)
  )
  .addStringOption((opt) =>
    opt
      .setName("query")
      .setDescription('Type de commerce recherché (ex : "coiffeur", "boulangerie", "מספרה")')
      .setRequired(true)
  )
  .addIntegerOption((opt) =>
    opt
      .setName("radius")
      .setDescription("Rayon de recherche en mètres autour de la ville (défaut : 2500)")
      .setMinValue(100)
      .setMaxValue(50000)
  )
  .addStringOption((opt) =>
    opt.setName("language").setDescription('Langue des résultats Google (défaut : "fr")')
  )
  .addStringOption((opt) =>
    opt
      .setName("domain")
      .setDescription("Catégorie pré-définie (regroupe plusieurs recherches automatiquement)")
      .addChoices(
        { name: "🍽️ Restaurant", value: "restaurant" },
        { name: "💇 Beauté / Coiffure", value: "beauty" },
        { name: "🥐 Boulangerie", value: "bakery" },
        { name: "🔧 Auto / Garage", value: "auto" },
        { name: "🏥 Médical", value: "medical" },
        { name: "🏠 Immobilier", value: "immo" },
        { name: "🛠️ Artisan", value: "artisan" },
        { name: "🇮🇱🍽️ Israël — Food", value: "il_food" },
        { name: "🇮🇱💇 Israël — Beauté", value: "il_beauty" },
        { name: "🇮🇱🔧 Israël — Services", value: "il_services" },
        { name: "🇫🇷🇮🇱 Francophones en Israël", value: "il_french" }
      )
  )
  .addBooleanOption((opt) =>
    opt.setName("nosite").setDescription("Garder uniquement les commerces SANS site web (meilleurs prospects)")
  )
  .addNumberOption((opt) =>
    opt
      .setName("min_rating")
      .setDescription("Note Google minimum requise (ex : 3.5)")
      .setMinValue(0)
      .setMaxValue(5)
  )
  .addIntegerOption((opt) =>
    opt
      .setName("min_reviews")
      .setDescription("Nombre minimum d'avis Google (ex : 10)")
      .setMinValue(0)
  )
  .addStringOption((opt) =>
    opt
      .setName("country")
      .setDescription('Code pays pour la géolocalisation (ex : "FR", "IL", "US")')
  )
  .addIntegerOption((opt) =>
    opt
      .setName("limit")
      .setDescription("Nombre max de résultats à retourner (défaut : 60)")
      .setMinValue(1)
      .setMaxValue(200)
  )
  .addBooleanOption((opt) =>
    opt.setName("realtime").setDescription("Poster chaque lead au fur et à mesure ? (défaut : oui)")
  ) as SlashCommandBuilder;

// ─── Exécution ─────────────────────────────────────

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const cityInput = interaction.options.getString("city", true);
  const queryInput = interaction.options.getString("query", true);
  const radius = interaction.options.getInteger("radius") ?? 2500;
  const language = interaction.options.getString("language") ?? "fr";
  const domain = interaction.options.getString("domain");
  const nosite = interaction.options.getBoolean("nosite") ?? false;
  const minRating = interaction.options.getNumber("min_rating");
  const minReviews = interaction.options.getInteger("min_reviews");
  const country = interaction.options.getString("country") ?? undefined;
  const limit = interaction.options.getInteger("limit") ?? 60;
  const realtime = interaction.options.getBoolean("realtime") ?? true;

  // Defer — le scan peut prendre du temps
  await interaction.deferReply();

  const guildId = interaction.guildId || "DM";
  const userId = interaction.user.id;
  const jobId = uuidv4();

  try {
    // 1) Résoudre les coordonnées
    let location: LatLng;
    const parsed = parseLatLng(cityInput);
    if (parsed) {
      location = parsed;
    } else {
      location = await geocodeCity(cityInput, country);
    }

    // 2) Déterminer les queries à lancer
    let queries: string[];
    if (domain && DOMAIN_ALIASES[domain]) {
      queries = DOMAIN_ALIASES[domain];
      logger.info(`📂 Domaine "${domain}" → ${queries.length} queries`);
    } else {
      queries = [queryInput];
    }

    // 3) Créer le job
    createScanJob({
      id: jobId,
      guild_id: guildId,
      user_id: userId,
      query: queryInput,
      city: cityInput,
      status: "RUNNING",
      total_found: 0,
      total_kept: 0,
      total_nosite: 0,
    });

    await interaction.editReply(
      `🚀 **Scan lancé !**\n` +
      `📍 Zone: **${cityInput}** (${location.lat.toFixed(4)}, ${location.lng.toFixed(4)})\n` +
      `🔍 Recherche: **${domain ? `[${domain}] ` : ""}${queryInput}**\n` +
      `📏 Rayon: **${radius}m** | Limite: **${limit}**\n` +
      `${nosite ? "🚫 Filtre: sans site web uniquement\n" : ""}` +
      `⏳ Scan en cours…`
    );

    // 4) Récupérer le channel pour poster les leads
    const channel = interaction.channel as TextChannel;

    let totalFound = 0;
    let totalKept = 0;
    let totalNosite = 0;
    let totalDuplicate = 0;
    const keptLeads: ProcessedLead[] = [];
    const seenPlaceIds = new Set<string>();

    // 5) Lancer les recherches
    for (const q of queries) {
      if (totalKept >= limit) break;

      const places = await nearbySearch(location, q, radius, language, limit);
      logger.info(`   → ${places.length} résultats pour "${q}"`);

      for (const place of places) {
        if (totalKept >= limit) break;
        if (seenPlaceIds.has(place.place_id)) continue;
        seenPlaceIds.add(place.place_id);

        totalFound++;

        // Déduplique avec la DB
        if (leadExists(place.place_id)) {
          totalDuplicate++;
          continue;
        }

        // Récupérer les détails
        const details = await getPlaceDetails(place.place_id, language);
        if (!details) continue;

        const lead = processPlace(details, queryInput);

        // Appliquer les filtres
        if (!passesFilters(lead, { nosite, min_rating: minRating ?? undefined, min_reviews: minReviews ?? undefined })) {
          continue;
        }

        // Sauvegarder en DB
        upsertLead({
          ...lead,
          status: "NEW",
          email: "",
          scan_query: queryInput,
          scan_city: cityInput,
          guild_id: guildId,
        });

        totalKept++;
        if (lead.no_website || lead.social_only) totalNosite++;
        keptLeads.push(lead);

        // Mettre à jour le job
        updateScanJob(jobId, { total_found: totalFound, total_kept: totalKept, total_nosite: totalNosite });

        // Poster en temps réel
        if (realtime && channel) {
          try {
            const embed = buildLeadEmbed(lead, totalKept);
            const row = buildActionRow(lead.place_id);
            await channel.send({ embeds: [embed], components: [row] });
          } catch (err) {
            logger.error(`Erreur envoi embed: ${err}`);
          }
        }
      }
    }

    // 6) Résumé final
    updateScanJob(jobId, { status: "DONE", total_found: totalFound, total_kept: totalKept, total_nosite: totalNosite });

    const summaryEmbed = buildSummaryEmbed({
      city: cityInput,
      query: queryInput,
      domain,
      totalFound,
      totalKept,
      totalNosite,
      totalDuplicate,
      radius,
    });

    await channel.send({ embeds: [summaryEmbed] });

    logger.info(`✅ Scan terminé: ${totalKept}/${totalFound} leads retenus.`);

  } catch (error: any) {
    logger.error(`❌ Erreur scan: ${error.message}`);
    updateScanJob(jobId, { status: "ERROR" });
    await interaction.editReply(`❌ **Erreur pendant le scan:** ${error.message}`);
  }
}
