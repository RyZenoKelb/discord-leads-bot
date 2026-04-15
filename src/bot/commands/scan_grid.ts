/**
 * scan_grid.ts — Commande /scan_grid
 * Scan en grille : découpe une zone en sous-points pour couvrir
 * une surface plus large (contourne la limite de 60 résultats par point).
 *
 * Paramètres:
 *   city       → Nom de ville ou coordonnées "lat,lng"
 *   query      → Ce qu'on cherche
 *   grid_km    → Taille de la grille en km (défaut: 6)
 *   step_m     → Distance entre chaque point en mètres (défaut: 1000)
 *   radius     → Rayon de recherche par point (défaut: 1200)
 *   + mêmes filtres que /scan
 */

import {
  ChatInputCommandInteraction,
  SlashCommandBuilder,
  TextChannel,
} from "discord.js";
import { v4 as uuidv4 } from "uuid";
import { DOMAIN_ALIASES } from "../../config";
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

// ─── Helpers ───────────────────────────────────────

/**
 * Génère une grille de points autour d'un centre.
 * Retourne une liste de coordonnées couvrant la zone.
 */
function generateGrid(center: LatLng, gridKm: number, stepM: number): LatLng[] {
  const points: LatLng[] = [];
  const halfGrid = (gridKm * 1000) / 2;
  const steps = Math.ceil((gridKm * 1000) / stepM);

  for (let i = 0; i <= steps; i++) {
    for (let j = 0; j <= steps; j++) {
      const dLat = (-halfGrid + i * stepM) / 111_320;
      const dLng =
        (-halfGrid + j * stepM) /
        (111_320 * Math.cos((center.lat * Math.PI) / 180));
      points.push({
        lat: center.lat + dLat,
        lng: center.lng + dLng,
      });
    }
  }

  return points;
}

// ─── Définition de la commande ─────────────────────

export const data = new SlashCommandBuilder()
  .setName("scan_grid")
  .setDescription("🗺️ Scan en grille : quadrille une large zone pour ne rater aucun commerce")
  .addStringOption((opt) =>
    opt
      .setName("city")
      .setDescription('Centre de la grille : nom de ville ou "lat,lng" (ex : "Tel Aviv")')
      .setRequired(true)
  )
  .addStringOption((opt) =>
    opt
      .setName("query")
      .setDescription('Type de commerce recherché (ex : "coiffeur", "restaurant")')
      .setRequired(true)
  )
  .addNumberOption((opt) =>
    opt
      .setName("grid_km")
      .setDescription("Taille du carré de la grille en km (défaut : 6)")
      .setMinValue(1)
      .setMaxValue(50)
  )
  .addIntegerOption((opt) =>
    opt
      .setName("step_m")
      .setDescription("Distance entre chaque point de la grille en mètres (défaut : 1000)")
      .setMinValue(200)
      .setMaxValue(5000)
  )
  .addIntegerOption((opt) =>
    opt
      .setName("radius")
      .setDescription("Rayon de recherche autour de chaque point en mètres (défaut : 1200)")
      .setMinValue(100)
      .setMaxValue(10000)
  )
  .addStringOption((opt) =>
    opt
      .setName("domain")
      .setDescription("Catégorie pré-définie (regroupe plusieurs recherches)")
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
    opt.setName("nosite").setDescription("Garder uniquement les commerces SANS site web")
  )
  .addNumberOption((opt) =>
    opt.setName("min_rating").setDescription("Note Google minimum (ex : 3.5)").setMinValue(0).setMaxValue(5)
  )
  .addIntegerOption((opt) =>
    opt.setName("min_reviews").setDescription("Nombre minimum d'avis Google (ex : 10)").setMinValue(0)
  )
  .addStringOption((opt) =>
    opt.setName("country").setDescription('Code pays pour la géolocalisation (ex : "FR", "IL")')
  )
  .addBooleanOption((opt) =>
    opt.setName("realtime").setDescription("Poster chaque lead au fur et à mesure ? (défaut : oui)")
  ) as SlashCommandBuilder;

// ─── Exécution ─────────────────────────────────────

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const cityInput = interaction.options.getString("city", true);
  const queryInput = interaction.options.getString("query", true);
  const gridKm = interaction.options.getNumber("grid_km") ?? 6;
  const stepM = interaction.options.getInteger("step_m") ?? 1000;
  const radius = interaction.options.getInteger("radius") ?? 1200;
  const domain = interaction.options.getString("domain");
  const nosite = interaction.options.getBoolean("nosite") ?? false;
  const minRating = interaction.options.getNumber("min_rating");
  const minReviews = interaction.options.getInteger("min_reviews");
  const country = interaction.options.getString("country") ?? undefined;
  const realtime = interaction.options.getBoolean("realtime") ?? true;

  await interaction.deferReply();

  const guildId = interaction.guildId || "DM";
  const userId = interaction.user.id;
  const jobId = uuidv4();

  try {
    // 1) Résoudre le centre
    let center: LatLng;
    const parsed = parseLatLng(cityInput);
    if (parsed) {
      center = parsed;
    } else {
      center = await geocodeCity(cityInput, country);
    }

    // 2) Générer la grille
    const gridPoints = generateGrid(center, gridKm, stepM);

    // 3) Déterminer les queries
    let queries: string[];
    if (domain && DOMAIN_ALIASES[domain]) {
      queries = DOMAIN_ALIASES[domain];
    } else {
      queries = [queryInput];
    }

    // 4) Créer le job
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
      `🗺️ **Scan grille lancé !**\n` +
      `📍 Centre: **${cityInput}**\n` +
      `📐 Grille: **${gridKm}km × ${gridKm}km** = **${gridPoints.length} points**\n` +
      `🔍 Recherche: **${domain ? `[${domain}] ` : ""}${queryInput}**\n` +
      `📏 Rayon/point: **${radius}m** | Pas: **${stepM}m**\n` +
      `⏳ Ça va prendre un moment…`
    );

    const channel = interaction.channel as TextChannel;

    let totalFound = 0;
    let totalKept = 0;
    let totalNosite = 0;
    let totalDuplicate = 0;
    const seenPlaceIds = new Set<string>();

    // 5) Scanner chaque point de la grille
    for (let ptIdx = 0; ptIdx < gridPoints.length; ptIdx++) {
      const point = gridPoints[ptIdx];

      for (const q of queries) {
        const places = await nearbySearch(point, q, radius, "fr", 60);

        for (const place of places) {
          if (seenPlaceIds.has(place.place_id)) continue;
          seenPlaceIds.add(place.place_id);

          totalFound++;

          if (leadExists(place.place_id)) {
            totalDuplicate++;
            continue;
          }

          const details = await getPlaceDetails(place.place_id, "fr");
          if (!details) continue;

          const lead = processPlace(details, queryInput);

          if (!passesFilters(lead, { nosite, min_rating: minRating ?? undefined, min_reviews: minReviews ?? undefined })) {
            continue;
          }

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

          updateScanJob(jobId, { total_found: totalFound, total_kept: totalKept, total_nosite: totalNosite });

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

      // Log progression
      if ((ptIdx + 1) % 5 === 0) {
        logger.info(`🗺️ Grille: point ${ptIdx + 1}/${gridPoints.length}, ${totalKept} leads retenus`);
      }
    }

    // 6) Résumé
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
    logger.info(`✅ Scan grille terminé: ${totalKept}/${totalFound} leads.`);

  } catch (error: any) {
    logger.error(`❌ Erreur scan_grid: ${error.message}`);
    updateScanJob(jobId, { status: "ERROR" });
    await interaction.editReply(`❌ **Erreur pendant le scan grille:** ${error.message}`);
  }
}
