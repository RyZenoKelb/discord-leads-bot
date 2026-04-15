/**
 * filters.ts — Commandes /filters_set et /filters_show
 * Permet de sauvegarder et consulter des presets de filtres par serveur.
 *
 * Exemple: /filters_set name:fr_coiffeur_nosite query:coiffeur nosite:true min_reviews:10
 * Puis:    /scan city:Paris query:coiffeur (applique auto le preset sauvegardé)
 */

import {
  ChatInputCommandInteraction,
  SlashCommandBuilder,
  EmbedBuilder,
  MessageFlags,
} from "discord.js";
import { savePreset, getPreset, listPresets } from "../../db/queries";
import { logger } from "../../utils/logger";

// ─── /filters_set ──────────────────────────────────

export const filtersSetData = new SlashCommandBuilder()
  .setName("filters_set")
  .setDescription("💾 Sauvegarde un preset de filtres réutilisable pour tes scans")
  .addStringOption((opt) =>
    opt
      .setName("name")
      .setDescription('Nom du preset (ex : "coiffeurs_sans_site")')
      .setRequired(true)
  )
  .addStringOption((opt) =>
    opt.setName("query").setDescription('Recherche par défaut (ex : "coiffeur", "restaurant")')
  )
  .addBooleanOption((opt) =>
    opt.setName("nosite").setDescription("Filtrer uniquement les commerces sans site web")
  )
  .addNumberOption((opt) =>
    opt.setName("min_rating").setDescription("Note Google minimum (ex : 3.5)").setMinValue(0).setMaxValue(5)
  )
  .addIntegerOption((opt) =>
    opt.setName("min_reviews").setDescription("Nombre minimum d'avis Google").setMinValue(0)
  )
  .addStringOption((opt) =>
    opt.setName("domain").setDescription("Catégorie par défaut (restaurant, beauty, il_food…)")
  )
  .addIntegerOption((opt) =>
    opt.setName("radius").setDescription("Rayon par défaut en mètres (ex : 3000)")
  )
  .addStringOption((opt) =>
    opt.setName("country").setDescription('Code pays par défaut (ex : "FR", "IL")')
  ) as SlashCommandBuilder;

export async function filtersSetExecute(interaction: ChatInputCommandInteraction): Promise<void> {
  const guildId = interaction.guildId;
  if (!guildId) {
    await interaction.reply({ content: "❌ Cette commande fonctionne uniquement dans un serveur.", flags: MessageFlags.Ephemeral });
    return;
  }

  const name = interaction.options.getString("name", true);
  const presetConfig: Record<string, unknown> = {};

  const query = interaction.options.getString("query");
  if (query) presetConfig.query = query;

  const nosite = interaction.options.getBoolean("nosite");
  if (nosite !== null) presetConfig.nosite = nosite;

  const minRating = interaction.options.getNumber("min_rating");
  if (minRating !== null) presetConfig.min_rating = minRating;

  const minReviews = interaction.options.getInteger("min_reviews");
  if (minReviews !== null) presetConfig.min_reviews = minReviews;

  const domain = interaction.options.getString("domain");
  if (domain) presetConfig.domain = domain;

  const radius = interaction.options.getInteger("radius");
  if (radius !== null) presetConfig.radius = radius;

  const country = interaction.options.getString("country");
  if (country) presetConfig.country = country;

  try {
    savePreset({
      guild_id: guildId,
      user_id: interaction.user.id,
      name,
      config: presetConfig,
    });

    const configStr = Object.entries(presetConfig)
      .map(([k, v]) => `  **${k}**: \`${v}\``)
      .join("\n");

    await interaction.reply(
      `✅ **Preset sauvegardé : \`${name}\`**\n\n${configStr || "  (aucun filtre défini)"}\n\n💡 Tu peux l'utiliser comme référence pour tes scans.`
    );
    logger.info(`💾 Preset "${name}" sauvé pour guild ${guildId}`);
  } catch (error: any) {
    logger.error(`Erreur save preset: ${error.message}`);
    await interaction.reply({ content: `❌ Erreur: ${error.message}`, flags: MessageFlags.Ephemeral });
  }
}

// ─── /filters_show ─────────────────────────────────

export const filtersShowData = new SlashCommandBuilder()
  .setName("filters_show")
  .setDescription("📋 Affiche les presets de filtres sauvegardés sur ce serveur")
  .addStringOption((opt) =>
    opt
      .setName("name")
      .setDescription("Nom d'un preset spécifique à afficher (sinon affiche tout)")
  ) as SlashCommandBuilder;

export async function filtersShowExecute(interaction: ChatInputCommandInteraction): Promise<void> {
  const guildId = interaction.guildId;
  if (!guildId) {
    await interaction.reply({ content: "❌ Cette commande fonctionne uniquement dans un serveur.", flags: MessageFlags.Ephemeral });
    return;
  }

  const name = interaction.options.getString("name");

  if (name) {
    // Afficher un preset spécifique
    const preset = getPreset(guildId, name);
    if (!preset) {
      await interaction.reply({ content: `❌ Preset \`${name}\` introuvable.`, flags: MessageFlags.Ephemeral });
      return;
    }

    const configStr = Object.entries(preset.config)
      .map(([k, v]) => `  **${k}**: \`${v}\``)
      .join("\n");

    const embed = new EmbedBuilder()
      .setColor(0x3498db)
      .setTitle(`💾 Preset: ${preset.name}`)
      .setDescription(configStr || "Aucun filtre défini")
      .setFooter({ text: `Créé par <@${preset.user_id}>` });

    await interaction.reply({ embeds: [embed] });
  } else {
    // Lister tous les presets
    const presets = listPresets(guildId);

    if (presets.length === 0) {
      await interaction.reply("📋 Aucun preset sauvegardé sur ce serveur.\nUtilise `/filters_set` pour en créer un !");
      return;
    }

    const lines = presets.map((p) => {
      const keys = Object.keys(p.config).join(", ");
      return `• **${p.name}** — ${keys || "vide"}`;
    });

    const embed = new EmbedBuilder()
      .setColor(0x3498db)
      .setTitle("📋 Presets de ce serveur")
      .setDescription(lines.join("\n"))
      .setFooter({ text: `${presets.length} preset(s) — /filters_show name:xxx pour le détail` });

    await interaction.reply({ embeds: [embed] });
  }
}
