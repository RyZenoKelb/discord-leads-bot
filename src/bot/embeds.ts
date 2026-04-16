/**
 * embeds.ts — Constructeurs d'embeds Discord premium.
 *
 * Palette de couleurs Discord officielle + design aéré et professionnel.
 * Deux modes : SCAN (Google Places) et HUNT (Web Requests).
 */

import {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} from "discord.js";
import { ProcessedLead } from "../services/googlePlaces";
import type { Lead, LeadStats, LeadNote, LeadEmail } from "../db/queries";
import type { WebRequestLead } from "../services/webRequestDetector";

// ─── Palette de couleurs premium ───────────────────
const C = {
  // Leads Google Places
  LEAD_NOSITE:  0xED4245,  // Rouge Discord — prospect chaud (pas de site)
  LEAD_SOCIAL:  0xFEE75C,  // Jaune Discord — social only
  LEAD_DEFAULT: 0x5865F2,  // Blurple Discord — lead standard
  LEAD_DONE:    0x57F287,  // Vert Discord — conclu
  LEAD_IGNORE:  0x4F545C,  // Gris — ignoré

  // Hunt (web requests)
  HUNT_HOT:     0xEB459E,  // Rose — très pertinent (score ≥ 80)
  HUNT_WARM:    0xFF8C00,  // Orange — pertinent (score 50-79)
  HUNT_COLD:    0x5865F2,  // Blurple — à qualifier (score < 50)

  // Résumés & Stats
  SUMMARY:      0x57F287,  // Vert
  STATS:        0x9B59B6,  // Violet
  FOLLOWUP:     0xFF8C00,  // Orange foncé
  INFO:         0x5865F2,  // Blurple
} as const;

// ─── Helpers ───────────────────────────────────────

function scoreBadge(score: number): string {
  if (score >= 80) return `🔥 **${score}/100**`;
  if (score >= 60) return `⭐ **${score}/100**`;
  if (score >= 40) return `🟡 **${score}/100**`;
  return `⚪ **${score}/100**`;
}

function relevanceBadge(score: number): string {
  if (score >= 80) return `🔥 **${score}%** — Très pertinent`;
  if (score >= 60) return `⭐ **${score}%** — Pertinent`;
  if (score >= 40) return `🟡 **${score}%** — À qualifier`;
  return `⚪ **${score}%** — Faible`;
}

function huntColor(score: number): number {
  if (score >= 80) return C.HUNT_HOT;
  if (score >= 50) return C.HUNT_WARM;
  return C.HUNT_COLD;
}

function sourceEmoji(source: string): string {
  const map: Record<string, string> = {
    reddit:    "🔴",
    instagram: "📸",
    linkedin:  "💼",
    twitter:   "🐦",
    facebook:  "📘",
    forum:     "💬",
    web:       "🌐",
    other:     "🌐",
  };
  return map[source] ?? "🌐";
}

function domainEmoji(domain: string): string {
  const map: Record<string, string> = {
    restaurant: "🍽️",
    beauty:     "💇",
    immo:       "🏠",
    artisan:    "🛠️",
    medical:    "🏥",
    ecommerce:  "🛒",
    freelance:  "👤",
    other:      "🏷️",
  };
  return map[domain] ?? "🏷️";
}

function requestTypeLabel(type: string): string {
  const map: Record<string, string> = {
    vitrine:     "🖥️ Site Vitrine",
    ecommerce:   "🛒 Boutique en ligne",
    refonte:     "🔄 Refonte",
    application: "📱 Application",
    unknown:     "❓ À qualifier",
  };
  return map[type] ?? "🖥️ Site Web";
}

export function buildStatusTag(status: string): string {
  const map: Record<string, string> = {
    CALL:   "📞 **À APPELER**",
    CHECK:  "🟡 **À VÉRIFIER**",
    IGNORE: "⛔ **IGNORÉ**",
    DONE:   "✅ **CONCLU**",
    NEW:    "🆕 **NOUVEAU**",
  };
  return map[status] ?? `🏷️ ${status}`;
}

// ═══════════════════════════════════════════════════
// ── MODE SCAN — Leads Google Places ────────────────
// ═══════════════════════════════════════════════════

/** Embed principal d'un lead Google Places */
export function buildLeadEmbed(lead: ProcessedLead, index?: number): EmbedBuilder {
  const color = lead.no_website ? C.LEAD_NOSITE
    : lead.social_only ? C.LEAD_SOCIAL
    : C.LEAD_DEFAULT;

  const websiteDisplay = lead.no_website
    ? "❌ **Aucun site web** — prospect idéal !"
    : lead.social_only
    ? `📱 Social only : ${lead.website}`
    : `🌐 ${lead.website}`;

  const badges: string[] = [];
  if (lead.no_website)      badges.push("🚫 Sans site");
  if (lead.social_only)     badges.push("📱 Social only");
  if (lead.french_business) badges.push("🇫🇷 Business FR");

  return new EmbedBuilder()
    .setColor(color)
    .setTitle(`${index ? `\`#${index}\`` : ""} ${lead.name}`)
    .setURL(lead.google_maps_url)
    .addFields(
      { name: "📍 Adresse",     value: lead.address || "—",                                             inline: false },
      { name: "📞 Téléphone",   value: lead.phone   || "—",                                             inline: true  },
      { name: "⭐ Avis Google", value: lead.rating  ? `${lead.rating}/5 *(${lead.reviews} avis)*` : "—", inline: true  },
      { name: "🌐 Présence web",value: websiteDisplay,                                                  inline: false },
      { name: "🏷️ Catégories", value: lead.types   || "—",                                             inline: false },
    )
    .setTimestamp()
    .setFooter({ text: badges.length > 0 ? badges.join("  •  ") : "Lead Orlan" });
}

/** Boutons d'action pour un lead (vue scan) */
export function buildActionRow(placeId: string): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`lead_call:${placeId}`)
      .setLabel("À appeler")
      .setEmoji("📞")
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`lead_check:${placeId}`)
      .setLabel("Vérifier")
      .setEmoji("🔍")
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(`lead_ignore:${placeId}`)
      .setLabel("Ignorer")
      .setEmoji("⛔")
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`scan_find_email:${placeId}`)
      .setLabel("Email")
      .setEmoji("📧")
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`scan_comment:${placeId}`)
      .setLabel("Note")
      .setEmoji("📝")
      .setStyle(ButtonStyle.Secondary),
  );
}

/** Embed résumé d'un scan Google Places */
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
  const convRate = stats.totalFound > 0
    ? Math.round((stats.totalKept / stats.totalFound) * 100)
    : 0;

  return new EmbedBuilder()
    .setColor(C.SUMMARY)
    .setTitle("📊 Résumé du Scan")
    .addFields(
      {
        name: "🗺️ Paramètres",
        value: [
          `📍 Zone : **${stats.city}**`,
          `🔍 Recherche : **${stats.domain ? `[${stats.domain}] ` : ""}${stats.query}**`,
          `📏 Rayon : **${stats.radius}m**`,
        ].join("\n"),
        inline: false,
      },
      {
        name: "📈 Résultats",
        value: [
          `🔎 Scannés : **${stats.totalFound}**`,
          `✅ Retenus : **${stats.totalKept}**`,
          `🚫 Sans site web : **${stats.totalNosite}**`,
          `🔁 Doublons ignorés : **${stats.totalDuplicate}**`,
          `📊 Taux de conversion : **${convRate}%**`,
        ].join("\n"),
        inline: false,
      },
    )
    .setTimestamp()
    .setFooter({ text: "💡 Utilise /export pour télécharger les résultats en CSV" });
}

// ─── Boutons call salon ─────────────────────────────

export function buildCallActionRows(placeId: string): ActionRowBuilder<ButtonBuilder>[] {
  const row1 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(`call_done:${placeId}`).setLabel("Appelé").setEmoji("📞").setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`call_callback:${placeId}`).setLabel("Rappeler").setEmoji("🔄").setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(`call_closed:${placeId}`).setLabel("Conclu").setEmoji("🤝").setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`call_nofollowup:${placeId}`).setLabel("Sans suite").setEmoji("⛔").setStyle(ButtonStyle.Danger),
  );

  const row2 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(`scan_comment:${placeId}`).setLabel("Note").setEmoji("📝").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`scan_callback_reason:${placeId}`).setLabel("Raison rappel").setEmoji("🔄").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`scan_find_email:${placeId}`).setLabel("Trouver email").setEmoji("🔍").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`scan_email:${placeId}`).setLabel("Envoyer email").setEmoji("📧").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`scan_meeting:${placeId}`).setLabel("RDV").setEmoji("📅").setStyle(ButtonStyle.Primary),
  );

  return [row1, row2];
}

/** @deprecated Utilise buildCallActionRows */
export function buildCallActionRow(placeId: string): ActionRowBuilder<ButtonBuilder> {
  return buildCallActionRows(placeId)[0];
}

// ─── Call Queue embed ───────────────────────────────

export function buildCallQueueEmbed(lead: Lead, notes?: LeadNote[], emails?: LeadEmail[]): EmbedBuilder {
  const color = lead.no_website ? C.LEAD_NOSITE : lead.social_only ? C.LEAD_SOCIAL : C.LEAD_DEFAULT;

  const websiteDisplay = lead.no_website
    ? "❌ **Sans site web**"
    : lead.social_only
    ? `📱 Social only : ${lead.website ?? "—"}`
    : `🌐 ${lead.website ?? "—"}`;

  const badges: string[] = [];
  if (lead.no_website)      badges.push("🚫 Sans site");
  if (lead.social_only)     badges.push("📱 Social only");
  if (lead.french_business) badges.push("🇫🇷 Business FR");
  if (lead.call_owner_id)   badges.push(`👤 Pris par <@${lead.call_owner_id}>`);

  const embed = new EmbedBuilder()
    .setColor(color)
    .setTitle(`📞 ${lead.name}`)
    .setDescription(`> Score : ${scoreBadge(lead.lead_score)}  •  ${buildStatusTag(lead.status)}`)
    .addFields(
      { name: "📍 Adresse",    value: lead.address || "—",                                              inline: false },
      { name: "📞 Téléphone",  value: lead.phone   || "—",                                              inline: true  },
      { name: "⭐ Google",     value: lead.rating  ? `${lead.rating}/5 *(${lead.reviews ?? 0} avis)*` : "—", inline: true  },
      { name: "🌐 Site web",   value: websiteDisplay,                                                   inline: false },
    )
    .setTimestamp();

  if (lead.google_maps_url) embed.setURL(lead.google_maps_url);

  // Email
  if (lead.email || (emails && emails.length > 0)) {
    const emailDisplay = emails && emails.length > 0
      ? emails.slice(0, 3).map((e) => `${e.status === "sent" ? "✅" : "📧"} ${e.email}`).join("\n")
      : lead.email ?? "—";
    embed.addFields({ name: "📧 Email", value: emailDisplay, inline: true });
  }

  // Notes
  if (notes && notes.length > 0) {
    const callbackNote = notes.find((n) => n.type === "callback_reason");
    if (callbackNote) {
      embed.addFields({
        name: "🔄 Raison de rappel",
        value: `> ${callbackNote.reason || callbackNote.content}\n*— ${callbackNote.user_tag ?? "?"} · ${callbackNote.created_at?.split(" ")[0] ?? "?"}*`,
        inline: false,
      });
    }
    const lastNote = notes.find((n) => n.type === "note") ?? notes[0];
    embed.addFields({
      name: `📝 Dernière note *(${notes.length} total)*`,
      value: `> ${lastNote.content.substring(0, 180)}\n*— ${lastNote.user_tag ?? "?"} · ${lastNote.created_at?.split(" ")[0] ?? "?"}*`,
      inline: false,
    });
  }

  embed.setFooter({ text: badges.length > 0 ? badges.join("  •  ") : "Call Queue — Orlan" });
  return embed;
}

/** Boutons Call Queue (3 rangées) */
export function buildCallQueueButtons(userId: string, placeId: string): ActionRowBuilder<ButtonBuilder>[] {
  const row1 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(`cq_next:${userId}`).setLabel("Suivant").setEmoji("⏭️").setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(`cq_done:${userId}:${placeId}`).setLabel("Terminé").setEmoji("✅").setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`cq_claim:${userId}:${placeId}`).setLabel("Je prends").setEmoji("📞").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`cq_check:${userId}:${placeId}`).setLabel("Vérifier").setEmoji("🔍").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`cq_ignore:${userId}:${placeId}`).setLabel("Ignorer").setEmoji("⛔").setStyle(ButtonStyle.Danger),
  );

  const row2 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(`cq_fu3:${userId}:${placeId}`).setLabel("Relance +3j").setEmoji("⏳").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`cq_fu7:${userId}:${placeId}`).setLabel("Relance +7j").setEmoji("⏳").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`cq_comment:${userId}:${placeId}`).setLabel("Note").setEmoji("📝").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`cq_callback_reason:${userId}:${placeId}`).setLabel("Raison rappel").setEmoji("🔄").setStyle(ButtonStyle.Secondary),
  );

  const row3 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(`cq_email:${userId}:${placeId}`).setLabel("Envoyer email").setEmoji("📧").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`cq_find_email:${userId}:${placeId}`).setLabel("Trouver email").setEmoji("🔍").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`cq_meeting:${userId}:${placeId}`).setLabel("RDV").setEmoji("📅").setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(`cq_revenue:${userId}:${placeId}`).setLabel("Revenu").setEmoji("💰").setStyle(ButtonStyle.Success),
  );

  return [row1, row2, row3];
}

// ─── Follow-up ──────────────────────────────────────

export function buildFollowupEmbed(lead: Lead): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(C.FOLLOWUP)
    .setTitle(`🔔 Relance due — ${lead.name}`)
    .setDescription(`Score : ${scoreBadge(lead.lead_score)}`)
    .addFields(
      { name: "📞 Téléphone", value: lead.phone     || "—",                       inline: true  },
      { name: "📍 Adresse",   value: lead.address   || "—",                       inline: true  },
      { name: "🌐 Site web",  value: lead.no_website ? "❌ Sans site" : (lead.website || "—"), inline: true },
      { name: "📌 Statut",    value: buildStatusTag(lead.status),                 inline: true  },
      { name: "📅 Relance",   value: lead.followup_at || "—",                     inline: true  },
    )
    .setTimestamp()
    .setURL(lead.google_maps_url ?? null!);
}

export function buildFollowupButtons(placeId: string): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(`fu_done:${placeId}`).setLabel("Relancé").setEmoji("✅").setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`fu_postpone3:${placeId}`).setLabel("Repousser 3j").setEmoji("⏳").setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(`fu_ignore:${placeId}`).setLabel("Ignorer").setEmoji("⛔").setStyle(ButtonStyle.Danger),
  );
}

// ─── Stats embed ────────────────────────────────────

export function buildStatsEmbed(stats: LeadStats): EmbedBuilder {
  const statusLines = Object.entries(stats.byStatus)
    .sort(([, a], [, b]) => b - a)
    .map(([s, c]) => `${buildStatusTag(s)} : **${c}**`)
    .join("\n") || "—";

  const cityLines = stats.topCities.length > 0
    ? stats.topCities.map((c, i) => `${["🥇","🥈","🥉","4️⃣","5️⃣"][i] ?? "▪️"} **${c.city}** — ${c.count} leads`).join("\n")
    : "—";

  const queryLines = stats.topQueries.length > 0
    ? stats.topQueries.map((q, i) => `${i + 1}. \`${q.query}\` — ${q.count} leads`).join("\n")
    : "—";

  return new EmbedBuilder()
    .setColor(C.STATS)
    .setTitle("📊 Statistiques Leads — Orlan")
    .addFields(
      {
        name: "📈 Vue d'ensemble",
        value: [
          `📦 Total leads : **${stats.total}**`,
          `🆕 Aujourd'hui : **${stats.newToday}**`,
          `🚫 Sans site web : **${stats.noWebsite}**`,
          `📱 Social only : **${stats.socialOnly}**`,
          `🎯 Score moyen : **${stats.avgScore}/100**`,
          `📊 Taux de conversion : **${(stats.conversionRate * 100).toFixed(1)}%**`,
        ].join("\n"),
        inline: false,
      },
      { name: "📌 Par statut",    value: statusLines, inline: false },
      { name: "🏙️ Top villes",  value: cityLines,    inline: true  },
      { name: "🔍 Top recherches",value: queryLines,  inline: true  },
    )
    .setTimestamp()
    .setFooter({ text: "⚡ Mise à jour automatique — /stats_now pour forcer" });
}

// ═══════════════════════════════════════════════════
// ── MODE HUNT — Web Requests ────────────────────────
// ═══════════════════════════════════════════════════

/** Embed d'une demande de site web détectée (mode Hunt) */
export function buildWebRequestEmbed(lead: WebRequestLead, index?: number): EmbedBuilder {
  const color = huntColor(lead.relevanceScore);
  const src   = sourceEmoji(lead.source);
  const dom   = domainEmoji(lead.domain);
  const reqT  = requestTypeLabel(lead.requestType);

  // Formater la date
  let dateDisplay = "—";
  if (lead.postedAt) {
    try {
      const d = new Date(lead.postedAt);
      dateDisplay = d.toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" });
    } catch { dateDisplay = lead.postedAt; }
  }

  const embed = new EmbedBuilder()
    .setColor(color)
    .setTitle(`${index ? `\`#${index}\`` : ""} ${lead.title?.substring(0, 200) ?? "Demande détectée"}`)
    .setURL(lead.url)
    .setDescription(
      lead.snippet
        ? `> *${lead.snippet.substring(0, 300).replace(/\n/g, " ")}${lead.snippet.length > 300 ? "…" : ""}*`
        : null
    )
    .addFields(
      {
        name: "🎯 Pertinence",
        value: relevanceBadge(lead.relevanceScore),
        inline: true,
      },
      {
        name: "🌐 Source",
        value: `${src} **${lead.source.charAt(0).toUpperCase() + lead.source.slice(1)}**`,
        inline: true,
      },
      {
        name: "📅 Publié le",
        value: dateDisplay,
        inline: true,
      },
    );

  // Infos supplémentaires
  const extras: { name: string; value: string; inline: boolean }[] = [];

  if (lead.domain && lead.domain !== "other") {
    extras.push({ name: "🏷️ Secteur détecté", value: `${dom} ${lead.domain}`, inline: true });
  }
  if (lead.location) {
    extras.push({ name: "📍 Localisation", value: lead.location, inline: true });
  }
  if (lead.requestType && lead.requestType !== "unknown") {
    extras.push({ name: "🖥️ Type de demande", value: reqT, inline: true });
  }

  if (extras.length > 0) embed.addFields(extras);

  embed.addFields({
    name: "🔗 Lien du post",
    value: `[Voir le post original](${lead.url})`,
    inline: false,
  });

  embed
    .setTimestamp()
    .setFooter({ text: `Mode Hunt — Orlan  •  ${lead.language.toUpperCase()}` });

  return embed;
}

/** Boutons d'action pour une web request (mode Hunt) */
export function buildWebRequestActionRow(url: string): ActionRowBuilder<ButtonBuilder> {
  // Encode l'URL en base64 pour l'utiliser comme customId (limité à 100 chars)
  const encoded = Buffer.from(url).toString("base64").substring(0, 80);

  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`wr_contact:${encoded}`)
      .setLabel("Contacter")
      .setEmoji("📩")
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`wr_save:${encoded}`)
      .setLabel("Sauvegarder")
      .setEmoji("💾")
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(`wr_ignore:${encoded}`)
      .setLabel("Ignorer")
      .setEmoji("⛔")
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setLabel("Ouvrir le post")
      .setEmoji("🔗")
      .setStyle(ButtonStyle.Link)
      .setURL(url),
  );
}

/** Embed résumé d'un Hunt */
export function buildHuntSummaryEmbed(stats: {
  zone: string;
  domain: string;
  dateRange: string;
  source: string;
  totalFetched: number;
  totalKept: number;
  sourcesUsed: string[];
  hasSerpKey: boolean;
}): EmbedBuilder {
  const dateLabels: Record<string, string> = {
    day: "Aujourd'hui", week: "Cette semaine", month: "Ce mois", all: "Tout",
  };
  const domainLabels: Record<string, string> = {
    all: "Tous secteurs", restaurant: "🍽️ Restaurant", beauty: "💇 Beauté",
    immo: "🏠 Immobilier", artisan: "🛠️ Artisan", medical: "🏥 Médical",
    ecommerce: "🛒 E-commerce", freelance: "👤 Freelance",
  };

  const sourceIcons = stats.sourcesUsed.map(s => `${sourceEmoji(s)} ${s}`).join(", ") || "—";
  const successRate = stats.totalFetched > 0
    ? Math.round((stats.totalKept / stats.totalFetched) * 100)
    : 0;

  const embed = new EmbedBuilder()
    .setColor(C.SUMMARY)
    .setTitle("🎯 Résumé du Hunt")
    .addFields(
      {
        name: "🔎 Paramètres",
        value: [
          `📍 Zone : **${stats.zone}**`,
          `🏷️ Domaine : **${domainLabels[stats.domain] ?? stats.domain}**`,
          `📅 Période : **${dateLabels[stats.dateRange] ?? stats.dateRange}**`,
        ].join("\n"),
        inline: false,
      },
      {
        name: "📈 Résultats",
        value: [
          `🔎 Pages analysées : **${stats.totalFetched}**`,
          `✅ Demandes détectées : **${stats.totalKept}**`,
          `📊 Taux de détection : **${successRate}%**`,
        ].join("\n"),
        inline: true,
      },
      {
        name: "🌐 Sources utilisées",
        value: sourceIcons,
        inline: true,
      },
    )
    .setTimestamp();

  if (!stats.hasSerpKey) {
    embed.addFields({
      name: "⚠️ Conseil",
      value: "Ajoute `SERP_API_KEY` dans ton `.env` pour activer la recherche sur Instagram, LinkedIn, Twitter et les forums !",
      inline: false,
    });
  }

  embed.setFooter({ text: "Mode Hunt — Orlan  •  /hunt pour relancer" });
  return embed;
}
