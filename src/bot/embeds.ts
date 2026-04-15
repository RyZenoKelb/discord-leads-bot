/**
 * embeds.ts — Constructeurs d'embeds Discord pour les leads et résumés.
 */

import {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} from "discord.js";
import { ProcessedLead } from "../services/googlePlaces";
import type { Lead, LeadStats, LeadNote, LeadEmail } from "../db/queries";

// ─── Couleurs ──────────────────────────────────────
const COLOR_LEAD = 0x2b82d9; // Bleu
const COLOR_NOSITE = 0xe74c3c; // Rouge
const COLOR_SOCIAL = 0xf39c12; // Orange
const COLOR_SUMMARY = 0x2ecc71; // Vert
const COLOR_STATS = 0x9b59b6;  // Violet
const COLOR_FOLLOWUP = 0xe67e22; // Orange foncé

// ─── Embed d'un lead ───────────────────────────────

export function buildLeadEmbed(lead: ProcessedLead, index?: number): EmbedBuilder {
  const color = lead.no_website ? COLOR_NOSITE : lead.social_only ? COLOR_SOCIAL : COLOR_LEAD;

  const websiteDisplay = lead.no_website
    ? "❌ **Pas de site web**"
    : lead.social_only
      ? `🟡 Social only: ${lead.website}`
      : `🌐 ${lead.website}`;

  const tags: string[] = [];
  if (lead.no_website) tags.push("🚫 No Website");
  if (lead.social_only) tags.push("📱 Social Only");
  if (lead.french_business) tags.push("🇫🇷 Business FR");

  const embed = new EmbedBuilder()
    .setColor(color)
    .setTitle(`${index ? `#${index} ` : ""}${lead.name}`)
    .setURL(lead.google_maps_url)
    .addFields(
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
        value: lead.rating ? `${lead.rating}/5 (${lead.reviews} avis)` : "—",
        inline: true,
      },
      {
        name: "🌐 Site web",
        value: websiteDisplay,
        inline: false,
      },
      {
        name: "🏷️ Catégories",
        value: lead.types || "—",
        inline: false,
      }
    )
    .setTimestamp();

  if (tags.length > 0) {
    embed.setFooter({ text: tags.join(" | ") });
  }

  return embed;
}

// ─── Boutons d'action ──────────────────────────────

export function buildActionRow(placeId: string): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`lead_call:${placeId}`)
      .setLabel("A appeler")
      .setEmoji("✅")
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`lead_check:${placeId}`)
      .setLabel("À vérifier")
      .setEmoji("🟡")
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(`lead_ignore:${placeId}`)
      .setLabel("Ignorer")
      .setEmoji("❌")
      .setStyle(ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId(`scan_find_email:${placeId}`)
      .setLabel("Trouver email")
      .setEmoji("🔍")
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`scan_comment:${placeId}`)
      .setLabel("Note")
      .setEmoji("📝")
      .setStyle(ButtonStyle.Secondary)
  );
}

// ─── Boutons workflow d'appel (salon "à-appeler") ──

/** Retourne 2 rangées de boutons pour le salon "à appeler" */
export function buildCallActionRows(placeId: string): ActionRowBuilder<ButtonBuilder>[] {
  const row1 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`call_done:${placeId}`)
      .setLabel("Appelé")
      .setEmoji("📞")
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`call_callback:${placeId}`)
      .setLabel("À rappeler")
      .setEmoji("🔄")
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(`call_closed:${placeId}`)
      .setLabel("Conclu")
      .setEmoji("🤝")
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`call_nofollowup:${placeId}`)
      .setLabel("Sans suite")
      .setEmoji("🚫")
      .setStyle(ButtonStyle.Danger)
  );

  const row2 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`scan_comment:${placeId}`)
      .setLabel("Note")
      .setEmoji("📝")
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`scan_callback_reason:${placeId}`)
      .setLabel("Raison rappel")
      .setEmoji("🔄")
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`scan_find_email:${placeId}`)
      .setLabel("Trouver email")
      .setEmoji("🔍")
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`scan_email:${placeId}`)
      .setLabel("Email")
      .setEmoji("📧")
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`scan_meeting:${placeId}`)
      .setLabel("RDV")
      .setEmoji("📅")
      .setStyle(ButtonStyle.Success)
  );

  return [row1, row2];
}

/** @deprecated Utilise buildCallActionRows à la place */
export function buildCallActionRow(placeId: string): ActionRowBuilder<ButtonBuilder> {
  return buildCallActionRows(placeId)[0];
}

// ─── Embed résumé de scan ──────────────────────────

export function buildSummaryEmbed(stats: {
  city: string;
  query: string;
  domain?: string | null;
  totalFound: number;
  totalKept: number;
  totalNosite: number;
  totalDuplicate: number;
  radius: number;
}): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(COLOR_SUMMARY)
    .setTitle("📊 Résumé du scan")
    .addFields(
      {
        name: "📍 Zone",
        value: stats.city,
        inline: true,
      },
      {
        name: "🔍 Recherche",
        value: `${stats.domain ? `[${stats.domain}] ` : ""}${stats.query}`,
        inline: true,
      },
      {
        name: "📏 Rayon",
        value: `${stats.radius}m`,
        inline: true,
      },
      {
        name: "📈 Résultats",
        value: [
          `🔎 Total trouvé: **${stats.totalFound}**`,
          `✅ Retenus: **${stats.totalKept}**`,
          `🚫 Sans site: **${stats.totalNosite}**`,
          `🔄 Doublons ignorés: **${stats.totalDuplicate}**`,
        ].join("\n"),
        inline: false,
      }
    )
    .setTimestamp()
    .setFooter({ text: "Utilise /export pour télécharger les résultats en CSV" });
}

// ─── Embed de status de lead (après bouton) ────────

export function buildStatusTag(status: string): string {
  switch (status) {
    case "CALL":
      return "✅ **À APPELER**";
    case "CHECK":
      return "🟡 **À VÉRIFIER**";
    case "IGNORE":
      return "❌ **IGNORÉ**";
    case "DONE":
      return "✔️ **TERMINÉ**";
    default:
      return "🆕 Nouveau";
  }
}

// ─── Score badge ───────────────────────────────────

function scoreBadge(score: number): string {
  if (score >= 80) return `🔥 **${score}/100**`;
  if (score >= 60) return `⭐ **${score}/100**`;
  if (score >= 40) return `🟡 **${score}/100**`;
  return `⚪ **${score}/100**`;
}

// ─── Call Queue Embed ──────────────────────────────

export function buildCallQueueEmbed(lead: Lead, notes?: LeadNote[], emails?: LeadEmail[]): EmbedBuilder {
  const color = lead.no_website ? COLOR_NOSITE : lead.social_only ? COLOR_SOCIAL : COLOR_LEAD;

  const websiteDisplay = lead.no_website
    ? "❌ **Pas de site web**"
    : lead.social_only
      ? `🟡 Social only: ${lead.website || "—"}`
      : `🌐 ${lead.website || "—"}`;

  const tags: string[] = [];
  if (lead.no_website) tags.push("🚫 No Website");
  if (lead.social_only) tags.push("📱 Social Only");
  if (lead.french_business) tags.push("🇫🇷 Business FR");

  const embed = new EmbedBuilder()
    .setColor(color)
    .setTitle(`📞 ${lead.name}`)
    .setDescription(`**Score : ${scoreBadge(lead.lead_score)}**`)
    .addFields(
      {
        name: "📌 Statut",
        value: buildStatusTag(lead.status),
        inline: true,
      },
      {
        name: "🎯 Score",
        value: scoreBadge(lead.lead_score),
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
      },
      {
        name: "🏷️ Catégories",
        value: lead.types || "—",
        inline: false,
      }
    )
    .setTimestamp();

  if (lead.google_maps_url) {
    embed.setURL(lead.google_maps_url);
  }

  if (lead.call_owner_id) {
    embed.addFields({
      name: "👤 Pris par",
      value: `<@${lead.call_owner_id}>`,
      inline: true,
    });
  }

  // ─── Email info ───────────────────────────────
  if (lead.email || (emails && emails.length > 0)) {
    const emailDisplay = emails && emails.length > 0
      ? emails.slice(0, 3).map((e) => `${e.status === "sent" ? "✅" : "📧"} ${e.email}`).join("\n")
      : lead.email || "—";
    embed.addFields({
      name: "📧 Email",
      value: emailDisplay,
      inline: true,
    });
  }

  if (lead.last_emailed_at) {
    embed.addFields({
      name: "📧 Dernier email",
      value: lead.last_emailed_at,
      inline: true,
    });
  }

  // ─── Notes / Callback reason ──────────────────
  if (notes && notes.length > 0) {
    const lastNote = notes[0];
    const callbackNote = notes.find((n) => n.type === "callback_reason");

    if (callbackNote) {
      embed.addFields({
        name: "🔄 Raison de rappel",
        value: `> ${callbackNote.reason || callbackNote.content}\n*— ${callbackNote.user_tag || "?"} le ${callbackNote.created_at?.split(" ")[0] || "?"}*`,
        inline: false,
      });
    }

    embed.addFields({
      name: `📝 Notes (${notes.length})`,
      value: `> ${lastNote.content.substring(0, 150)}\n*— ${lastNote.user_tag || "?"} le ${lastNote.created_at?.split(" ")[0] || "?"}*`,
      inline: false,
    });
  }

  if (tags.length > 0) {
    embed.setFooter({ text: tags.join(" | ") });
  }

  return embed;
}

// ─── Call Queue Buttons (3 rows with new actions) ──

export function buildCallQueueButtons(userId: string, placeId: string): ActionRowBuilder<ButtonBuilder>[] {
  const row1 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`cq_next:${userId}`)
      .setLabel("Suivant")
      .setEmoji("➡️")
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(`cq_done:${userId}:${placeId}`)
      .setLabel("Fait")
      .setEmoji("✅")
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`cq_claim:${userId}:${placeId}`)
      .setLabel("Pris")
      .setEmoji("📞")
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`cq_check:${userId}:${placeId}`)
      .setLabel("À vérifier")
      .setEmoji("🟡")
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`cq_ignore:${userId}:${placeId}`)
      .setLabel("Ignorer")
      .setEmoji("❌")
      .setStyle(ButtonStyle.Danger)
  );

  const row2 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`cq_fu3:${userId}:${placeId}`)
      .setLabel("Relance 3j")
      .setEmoji("⏳")
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`cq_fu7:${userId}:${placeId}`)
      .setLabel("Relance 7j")
      .setEmoji("⏳")
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`cq_comment:${userId}:${placeId}`)
      .setLabel("Note")
      .setEmoji("📝")
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`cq_callback_reason:${userId}:${placeId}`)
      .setLabel("Raison rappel")
      .setEmoji("🔄")
      .setStyle(ButtonStyle.Secondary)
  );

  const row3 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`cq_email:${userId}:${placeId}`)
      .setLabel("Email")
      .setEmoji("📧")
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`cq_find_email:${userId}:${placeId}`)
      .setLabel("Trouver email")
      .setEmoji("🔍")
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`cq_meeting:${userId}:${placeId}`)
      .setLabel("RDV")
      .setEmoji("📅")
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`cq_revenue:${userId}:${placeId}`)
      .setLabel("Revenu")
      .setEmoji("💰")
      .setStyle(ButtonStyle.Success)
  );

  return [row1, row2, row3];
}

// ─── Follow-up Embed & Buttons ─────────────────────

export function buildFollowupEmbed(lead: Lead): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setColor(COLOR_FOLLOWUP)
    .setTitle(`🔔 Relance due — ${lead.name}`)
    .setDescription(`Score : ${scoreBadge(lead.lead_score)}`)
    .addFields(
      {
        name: "📞 Téléphone",
        value: lead.phone || "Non disponible",
        inline: true,
      },
      {
        name: "📍 Adresse",
        value: lead.address || "Non disponible",
        inline: true,
      },
      {
        name: "🌐 Site",
        value: lead.no_website ? "❌ Pas de site" : (lead.website || "—"),
        inline: true,
      },
      {
        name: "� Statut",
        value: buildStatusTag(lead.status),
        inline: true,
      },
      {
        name: "📅 Relance prévue",
        value: lead.followup_at || "—",
        inline: true,
      }
    )
    .setTimestamp();

  if (lead.google_maps_url) {
    embed.setURL(lead.google_maps_url);
  }

  return embed;
}

export function buildFollowupButtons(placeId: string): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`fu_done:${placeId}`)
      .setLabel("Relancé")
      .setEmoji("✅")
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`fu_postpone3:${placeId}`)
      .setLabel("Repousser 3j")
      .setEmoji("⏳")
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(`fu_ignore:${placeId}`)
      .setLabel("Ignorer")
      .setEmoji("❌")
      .setStyle(ButtonStyle.Danger)
  );
}

// ─── Stats Embed ───────────────────────────────────

export function buildStatsEmbed(stats: LeadStats): EmbedBuilder {
  const statusLines = Object.entries(stats.byStatus)
    .map(([s, c]) => `${buildStatusTag(s)} : ${c}`)
    .join("\n");

  const cityLines = stats.topCities.length > 0
    ? stats.topCities.map((c, i) => `${i + 1}. **${c.city}** — ${c.count} leads`).join("\n")
    : "—";

  const queryLines = stats.topQueries.length > 0
    ? stats.topQueries.map((q, i) => `${i + 1}. \`${q.query}\` — ${q.count} leads`).join("\n")
    : "—";

  return new EmbedBuilder()
    .setColor(COLOR_STATS)
    .setTitle("📊 Statistiques Leads")
    .addFields(
      {
        name: "📈 Vue d'ensemble",
        value: [
          `📦 Total leads : **${stats.total}**`,
          `🆕 Nouveaux aujourd'hui : **${stats.newToday}**`,
          `🚫 Sans site web : **${stats.noWebsite}**`,
          `📱 Social only : **${stats.socialOnly}**`,
          `🎯 Score moyen : **${stats.avgScore}/100**`,
          `📊 Taux de conversion : **${(stats.conversionRate * 100).toFixed(1)}%**`,
        ].join("\n"),
        inline: false,
      },
      {
        name: "📌 Par statut",
        value: statusLines || "—",
        inline: false,
      },
      {
        name: "🏙️ Top villes",
        value: cityLines,
        inline: true,
      },
      {
        name: "🔍 Top recherches",
        value: queryLines,
        inline: true,
      }
    )
    .setTimestamp()
    .setFooter({ text: "Mise à jour automatique • /stats_now pour forcer" });
}
