/**
 * help.ts — Commande /help
 * Affiche un résumé de toutes les commandes du bot, en français,
 * conçu pour que quelqu'un qui ne code pas comprenne immédiatement.
 */

import {
  ChatInputCommandInteraction,
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
} from "discord.js";

export const data = new SlashCommandBuilder()
  .setName("help")
  .setDescription("❓ Affiche la liste de toutes les commandes et ce qu'elles font");

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const embed = new EmbedBuilder()
    .setColor(0x0099ff)
    .setTitle("🤖 LeadsBot — Liste des commandes")
    .setDescription(
      "Voici tout ce que le bot peut faire. Tape `/guide` pour un tutoriel complet pas-à-pas.\n" +
      "On cible les **francophones en Israël** 🇮🇱🇫🇷 — le bot est configuré pour ça."
    )
    .addFields(
      {
        name: "🔍  `/scan`  — Scanner une zone",
        value:
          "Cherche des commerces autour d'une ville.\n" +
          "**Obligatoire :** `city` (ville) + `query` (type de commerce)\n" +
          "Ex: `/scan city:Tel Aviv query:coiffeur`\n" +
          "Ex: `/scan city:Netanya query:boulangerie nosite:true`",
      },
      {
        name: "🗺️  `/scan_grid`  — Scanner une zone LARGE",
        value:
          "Comme `/scan` mais quadrille une grande zone pour ne rien rater.\n" +
          "Ex: `/scan_grid city:Herzliya query:restaurant grid_km:8`",
      },
      {
        name: "📞  `/call_queue`  — File d'appels",
        value:
          "Ouvre ta file d'appels triée par score. Affiche un lead à la fois avec tous les boutons d'action.",
      },
      {
        name: "➡️  `/call_next`  — Lead suivant",
        value: "Passe au lead suivant dans ta file d'appels.",
      },
      {
        name: "🔄  `/update`  — Rafraîchir le salon d'appels",
        value: "Reposte tous les leads à traiter dans le salon dédié, triés par score.",
      },
      {
        name: "📧  `/enrich_email`  — Trouver & envoyer des emails",
        value:
          "Trouve les emails des commerces via 6 sources (site web, WHOIS, Google, réseaux sociaux…)\n" +
          "Envoie des emails avec des templates personnalisés.\n" +
          "Ex: `/enrich_email find limit:20` ou `/enrich_email send place_id:xxx template:introduction_fr`",
      },
      {
        name: "📝  `/lead_notes`  — Notes d'un lead",
        value:
          "Voir les notes, commentaires et raisons de rappel d'un lead.\n" +
          "Ex: `/lead_notes place_id:xxx`",
      },
      {
        name: "📊  `/daily_stats`  — Stats quotidiennes",
        value: "Affiche les stats d'activité : appels, emails, RDV, revenu…",
      },
      {
        name: "📊  `/stats_now`  — Stats instantanées",
        value: "Affiche les statistiques complètes de tous les leads.",
      },
      {
        name: "💾  `/filters_set`  — Sauvegarder un preset",
        value:
          "Enregistre une config de filtres réutilisable.\n" +
          "Ex: `/filters_set name:coiffeurs_fr query:coiffeur nosite:true min_reviews:5`",
      },
      {
        name: "📋  `/filters_show`  — Voir les presets",
        value:
          "Affiche tous les presets sauvegardés sur ce serveur.\n" +
          "Ex: `/filters_show` ou `/filters_show name:coiffeurs_fr`",
      },
      {
        name: "📥  `/export`  — Exporter en CSV",
        value:
          "Télécharge les leads en fichier CSV (ouvrable dans Excel/Google Sheets).\n" +
          "Ex: `/export scope:last_scan`",
      },
      {
        name: "📊  `/status`  — État des scans",
        value: "Montre les scans en cours et l'historique récent.",
      },
      {
        name: "📖  `/guide`  — Tutoriel complet",
        value: "Explique pas-à-pas comment utiliser le bot, avec des exemples concrets pour Israël 🇮🇱",
      }
    )
    .addFields({
      name: "🏷️ Boutons sur chaque lead",
      value:
        "✅ **A appeler** — Tu comptes appeler ce prospect\n" +
        "🟡 **À vérifier** — Tu veux vérifier avant\n" +
        "❌ **Ignorer** — Pas intéressant\n" +
        "🔍 **Trouver email** — Cherche l'email du commerce (multi-sources)\n" +
        "📝 **Note** — Ajouter un commentaire\n\n" +
        "Le statut est sauvegardé automatiquement.",
    })
    .addFields({
      name: "📂 Domaines pré-définis",
      value:
        "`restaurant` `beauty` `bakery` `auto` `medical` `immo` `artisan`\n" +
        "🇮🇱 `il_food` `il_beauty` `il_services` `il_french` (spécial Israël)",
    })
    .setFooter({
      text: "Tape /guide pour le tutoriel complet • Fait avec ❤️ pour les francos en Israël",
    })
    .setTimestamp();

  await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
}
