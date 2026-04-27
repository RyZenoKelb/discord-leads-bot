/**
 * callChannelEmbed.ts — Embeds enrichis pour le salon "À Appeler".
 *
 * Quand un lead est marqué CALL, on poste un embed détaillé et imposant
 * dans le salon dédié (CALL_CHANNEL_ID) avec un maximum d'informations
 * pour faciliter l'appel téléphonique.
 */

import {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  TextChannel,
  Client,
} from "discord.js";
import type { Lead, LeadNote, LeadEmail } from "../db/queries";
import {
  getLeadByPlaceId,
  getLeadNotes,
  getLeadEmails,
  getLeadsByStatus,
  getSetting,
  setSetting,
} from "../db/queries";
import { buildStatusTag } from "./embeds";
import { config } from "../config";
import { logger } from "../utils/logger";

// ─── Palette de couleurs ────────────────────────────

const CALL_COLORS = {
  HOT:      0xE74C3C,  // Rouge vif — prospect chaud (sans site)
  WARM:     0xF39C12,  // Orange — social only
  STANDARD: 0x2ECC71,  // Vert — lead standard à appeler
} as const;

// ─── Helpers ────────────────────────────────────────

function priorityBadge(lead: Lead): string {
  if (lead.no_website && lead.lead_score >= 70) return "🔥🔥🔥 PRIORITÉ MAX";
  if (lead.no_website) return "🔥🔥 HAUTE PRIORITÉ";
  if (lead.social_only) return "🔥 PRIORITÉ MOYENNE";
  if (lead.lead_score >= 60) return "⭐ PRIORITÉ NORMALE";
  return "📋 À TRAITER";
}

function callColor(lead: Lead): number {
  if (lead.no_website) return CALL_COLORS.HOT;
  if (lead.social_only) return CALL_COLORS.WARM;
  return CALL_COLORS.STANDARD;
}

function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return "—";
  try {
    const d = new Date(dateStr);
    return d.toLocaleDateString("fr-FR", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return dateStr;
  }
}

function relativeTime(dateStr: string | null | undefined): string {
  if (!dateStr) return "";
  try {
    const d = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffMin = Math.floor(diffMs / 60000);
    const diffH = Math.floor(diffMin / 60);
    const diffD = Math.floor(diffH / 24);

    if (diffD > 0) return `il y a ${diffD}j`;
    if (diffH > 0) return `il y a ${diffH}h`;
    if (diffMin > 0) return `il y a ${diffMin}min`;
    return "à l'instant";
  } catch {
    return "";
  }
}

function websiteAnalysis(lead: Lead): string {
  if (lead.no_website) {
    return [
      "❌ **AUCUN SITE WEB**",
      "➜ Prospect idéal pour une proposition de site vitrine",
      "➜ Pas de présence en ligne = besoin évident",
    ].join("\n");
  }
  if (lead.social_only) {
    return [
      `📱 **Réseaux sociaux uniquement**`,
      `➜ ${lead.website || "—"}`,
      "➜ Besoin d'un vrai site professionnel",
    ].join("\n");
  }
  return [
    `🌐 **Site existant :** ${lead.website || "—"}`,
    "➜ Vérifier la qualité du site actuel",
    "➜ Proposer une refonte si site daté",
  ].join("\n");
}

function buildTagsList(lead: Lead): string {
  const tags: string[] = [];
  if (lead.no_website) tags.push("🚫 Sans site");
  if (lead.social_only) tags.push("📱 Social only");
  if (lead.french_business) tags.push("🇫🇷 Business FR");
  if (lead.phone) tags.push("📞 Téléphone dispo");
  if (lead.email) tags.push("📧 Email dispo");
  if (lead.rating && lead.rating >= 4.5) tags.push("⭐ Très bien noté");
  if (lead.reviews && lead.reviews >= 50) tags.push("💬 Populaire");
  if (lead.call_owner_id) tags.push(`👤 Assigné`);
  return tags.length > 0 ? tags.join("  •  ") : "—";
}

// ─── Embed principal "À Appeler" ────────────────────

export function buildCallChannelEmbed(
  lead: Lead,
  notes?: LeadNote[],
  emails?: LeadEmail[],
  markedBy?: string,
): EmbedBuilder {
  const color = callColor(lead);
  const priority = priorityBadge(lead);

  // Score visuel
  const scoreBar = "█".repeat(Math.floor(lead.lead_score / 10)) + "░".repeat(10 - Math.floor(lead.lead_score / 10));
  const scoreLine = `\`${scoreBar}\` **${lead.lead_score}/100**`;

  const embed = new EmbedBuilder()
    .setColor(color)
    .setTitle(`📞 ${lead.name}`)
    .setDescription(
      [
        `> ${priority}`,
        `> Score : ${scoreLine}`,
        markedBy ? `> Marqué par <@${markedBy}> — ${relativeTime(lead.updated_at) || "à l'instant"}` : "",
      ].filter(Boolean).join("\n")
    );

  if (lead.google_maps_url) {
    embed.setURL(lead.google_maps_url);
  }

  // ─── Informations de contact ──────────────────────
  embed.addFields({
    name: "━━━ 📇 INFORMATIONS DE CONTACT ━━━",
    value: [
      `📞 **Téléphone :** ${lead.phone || "❌ Non disponible"}`,
      `📧 **Email :** ${lead.email || "❌ Non disponible"}`,
      `📍 **Adresse :** ${lead.address || "—"}`,
      lead.scan_city ? `🏙️ **Ville :** ${lead.scan_city}` : "",
    ].filter(Boolean).join("\n"),
    inline: false,
  });

  // ─── Analyse du site web ──────────────────────────
  embed.addFields({
    name: "━━━ 🌐 ANALYSE PRÉSENCE WEB ━━━",
    value: websiteAnalysis(lead),
    inline: false,
  });

  // ─── Google Business ──────────────────────────────
  const ratingDisplay = lead.rating
    ? `${"⭐".repeat(Math.round(lead.rating))} **${lead.rating}/5** *(${lead.reviews ?? 0} avis)*`
    : "❌ Pas d'avis Google";

  embed.addFields(
    {
      name: "⭐ Google Business",
      value: ratingDisplay,
      inline: true,
    },
    {
      name: "🏷️ Catégories",
      value: lead.types || "—",
      inline: true,
    },
  );

  // ─── Emails enrichis ──────────────────────────────
  if (emails && emails.length > 0) {
    const emailLines = emails.slice(0, 5).map((e) => {
      const statusIcon = e.status === "sent" ? "✅" : e.status === "error" ? "❌" : "📧";
      return `${statusIcon} \`${e.email}\` *(${e.source})*`;
    });
    embed.addFields({
      name: `━━━ 📧 EMAILS TROUVÉS (${emails.length}) ━━━`,
      value: emailLines.join("\n"),
      inline: false,
    });
  }

  // ─── Notes & Historique ───────────────────────────
  if (notes && notes.length > 0) {
    const callbackNote = notes.find((n) => n.type === "callback_reason");
    if (callbackNote) {
      embed.addFields({
        name: "🔄 Raison de rappel",
        value: `> ${callbackNote.reason || callbackNote.content}\n*— ${callbackNote.user_tag ?? "?"} · ${formatDate(callbackNote.created_at)}*`,
        inline: false,
      });
    }

    const recentNotes = notes
      .filter((n) => n.type === "note" || n.type === "meeting")
      .slice(0, 3);

    if (recentNotes.length > 0) {
      const noteLines = recentNotes.map((n) => {
        const icon = n.type === "meeting" ? "📅" : "📝";
        return `${icon} ${n.content.substring(0, 120)}\n   *— ${n.user_tag ?? "?"} · ${formatDate(n.created_at)}*`;
      });
      embed.addFields({
        name: `━━━ 📝 NOTES (${notes.length} total) ━━━`,
        value: noteLines.join("\n\n"),
        inline: false,
      });
    }
  }

  // ─── Timeline ─────────────────────────────────────
  const timeline: string[] = [];
  if (lead.scanned_at)        timeline.push(`🔎 Scanné : ${formatDate(lead.scanned_at)}`);
  if (lead.last_called_at)    timeline.push(`📞 Dernier appel : ${formatDate(lead.last_called_at)}`);
  if (lead.last_emailed_at)   timeline.push(`📧 Dernier email : ${formatDate(lead.last_emailed_at)}`);
  if (lead.last_contacted_at) timeline.push(`💬 Dernier contact : ${formatDate(lead.last_contacted_at)}`);
  if (lead.followup_at)       timeline.push(`⏰ Relance prévue : ${formatDate(lead.followup_at)}`);

  if (timeline.length > 0) {
    embed.addFields({
      name: "━━━ 📅 HISTORIQUE ━━━",
      value: timeline.join("\n"),
      inline: false,
    });
  }

  // ─── Recherche d'origine ──────────────────────────
  if (lead.scan_query) {
    embed.addFields({
      name: "🔍 Recherche d'origine",
      value: `\`${lead.scan_query}\` dans **${lead.scan_city || "?"}**`,
      inline: true,
    });
  }

  // ─── Tags ─────────────────────────────────────────
  embed.setFooter({
    text: buildTagsList(lead),
  });

  embed.setTimestamp();

  return embed;
}

// ─── Boutons d'action pour le salon "À Appeler" ────

export function buildCallChannelButtons(placeId: string): ActionRowBuilder<ButtonBuilder>[] {
  const row1 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`call_done:${placeId}`)
      .setLabel("Appelé ✓")
      .setEmoji("📞")
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`call_callback:${placeId}`)
      .setLabel("Rappeler")
      .setEmoji("🔄")
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(`call_closed:${placeId}`)
      .setLabel("Deal conclu")
      .setEmoji("🤝")
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`call_nofollowup:${placeId}`)
      .setLabel("Sans suite")
      .setEmoji("⛔")
      .setStyle(ButtonStyle.Danger),
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
      .setLabel("Envoyer email")
      .setEmoji("📧")
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`scan_meeting:${placeId}`)
      .setLabel("RDV")
      .setEmoji("📅")
      .setStyle(ButtonStyle.Primary),
  );

  return [row1, row2];
}

// ─── Poster un lead dans le salon "À Appeler" ───────

export async function postLeadToCallChannel(
  client: Client,
  lead: Lead,
  markedBy?: string,
): Promise<void> {
  if (!config.callChannelId) {
    logger.warn("⚠️ CALL_CHANNEL_ID non configuré — impossible de poster le lead.");
    return;
  }

  try {
    const channel = await client.channels.fetch(config.callChannelId);
    if (!channel || !(channel instanceof TextChannel)) {
      logger.warn("⚠️ Salon 'À Appeler' introuvable ou pas un TextChannel.");
      return;
    }

    const notes = getLeadNotes(lead.place_id);
    const emails = getLeadEmails(lead.place_id);

    const embed = buildCallChannelEmbed(lead, notes, emails, markedBy);
    const buttons = buildCallChannelButtons(lead.place_id);

    const mention = config.associateUserId ? `<@${config.associateUserId}>` : "";

    const priority = lead.no_website
      ? "🔥 **PROSPECT CHAUD — PAS DE SITE WEB !**"
      : lead.social_only
        ? "📱 **PROSPECT — SOCIAL ONLY**"
        : "📞 **NOUVEAU LEAD À APPELER**";

    await channel.send({
      content: [
        mention ? `${mention}` : "",
        `─────────────────────────────`,
        priority,
        `─────────────────────────────`,
      ].filter(Boolean).join("\n"),
      embeds: [embed],
      components: buttons,
    });

    logger.info(`📞 Lead ${lead.place_id} (${lead.name}) posté dans le salon À Appeler`);
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    logger.error(`❌ Erreur post salon À Appeler: ${msg}`);
  }
}

// ─── Sync des leads CALL existants ──────────────────

export async function syncExistingCallLeads(client: Client): Promise<void> {
  if (!config.callChannelId) {
    logger.info("📞 Sync salon À Appeler: CALL_CHANNEL_ID non configuré.");
    return;
  }

  try {
    const channel = await client.channels.fetch(config.callChannelId);
    if (!channel || !(channel instanceof TextChannel)) {
      logger.warn("📞 Sync: salon introuvable.");
      return;
    }

    // Check if we already synced (avoid duplicates on restart)
    const syncKey = "call_channel_synced";
    const alreadySynced = getSetting(syncKey);
    if (alreadySynced === "true") {
      logger.info("📞 Salon À Appeler: déjà synchronisé. Pas de resync.");
      return;
    }

    const callLeads = getLeadsByStatus("CALL");
    if (callLeads.length === 0) {
      logger.info("📞 Aucun lead CALL à synchroniser.");
      setSetting(syncKey, "true");
      return;
    }

    // Post a header first
    await channel.send({
      content: [
        "═══════════════════════════════════════",
        "📞  **SYNCHRONISATION — LEADS À APPELER**",
        `📊  **${callLeads.length} lead(s)** marqué(s) \"À Appeler\"`,
        `📅  ${new Date().toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" })}`,
        "═══════════════════════════════════════",
      ].join("\n"),
    });

    // Sort by score desc
    callLeads.sort((a, b) => b.lead_score - a.lead_score);

    let posted = 0;
    for (const lead of callLeads) {
      const notes = getLeadNotes(lead.place_id);
      const emails = getLeadEmails(lead.place_id);
      const embed = buildCallChannelEmbed(lead, notes, emails);
      const buttons = buildCallChannelButtons(lead.place_id);

      const priority = lead.no_website
        ? "🔥 **PROSPECT CHAUD — PAS DE SITE WEB !**"
        : lead.social_only
          ? "📱 **PROSPECT — SOCIAL ONLY**"
          : "📞 **LEAD À APPELER**";

      await channel.send({
        content: [
          `─────────────────────────────`,
          priority,
          `─────────────────────────────`,
        ].join("\n"),
        embeds: [embed],
        components: buttons,
      });

      posted++;

      // Rate limit to avoid Discord API throttle
      await new Promise((r) => setTimeout(r, 1000));
    }

    setSetting(syncKey, "true");
    logger.info(`📞 ✅ ${posted} lead(s) CALL synchronisé(s) dans le salon À Appeler.`);

  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    logger.error(`❌ Erreur sync salon À Appeler: ${msg}`);
  }
}
