/**
 * buttons.ts — Gère toutes les interactions boutons.
 *
 * Boutons scan:      lead_call, lead_check, lead_ignore
 * Boutons call salon: call_done, call_callback, call_closed, call_nofollowup
 * Boutons call queue: cq_next, cq_done, cq_claim, cq_check, cq_ignore, cq_fu3, cq_fu7,
 *                     cq_comment, cq_callback_reason, cq_email, cq_find_email, cq_meeting, cq_revenue
 * Boutons followup:  fu_done, fu_postpone3, fu_ignore
 * Boutons hunt:      wr_contact, wr_save, wr_ignore
 */

import {
  ButtonInteraction,
  EmbedBuilder,
  MessageFlags,
  TextChannel,
  ModalBuilder,
  ActionRowBuilder,
  TextInputBuilder,
  TextInputStyle,
} from "discord.js";
import {
  updateLeadStatus,
  getLeadByPlaceId,
  getNextCallQueueLead,
  upsertCallSession,
  claimLead,
  markLeadDone,
  setFollowup,
  clearFollowup,
  getLeadNotes,
  getLeadEmails,
  addLeadEmail,
  logActivity,
  markLeadCalled,
  getWebRequestById,
  updateWebRequestStatus,
  upsertWebRequest,
} from "../../db/queries";
import {
  buildStatusTag,
  buildCallQueueEmbed,
  buildCallQueueButtons,
} from "../embeds";
import { logger } from "../../utils/logger";
import { deepScrapeEmails, deepScrapeEmailsDetailed } from "../../services/emailEnrich";
import { sendEmail, canSendEmail } from "../../services/emailSender";
import { config } from "../../config";

// ─── Simple status buttons (scan + call salon) ────

const SIMPLE_STATUS_MAP: Record<string, string> = {
  lead_call: "CALL",
  lead_check: "CHECK",
  lead_ignore: "IGNORE",
  call_done: "DONE",
  call_callback: "CALL",
  call_closed: "DONE",
  call_nofollowup: "IGNORE",
};

const COLOR_MAP: Record<string, number> = {
  CALL: 0x2ecc71,
  CHECK: 0xf39c12,
  IGNORE: 0x95a5a6,
  DONE: 0x1abc9c,
  NEW: 0x3498db,
};

export async function handleButton(interaction: ButtonInteraction): Promise<void> {
  const customId = interaction.customId;

  try {
    // ─── Call Queue buttons ────────────────────────
    if (customId.startsWith("cq_")) {
      await handleCallQueueButton(interaction);
      return;
    }

    // ─── Followup buttons ─────────────────────────
    if (customId.startsWith("fu_")) {
      await handleFollowupButton(interaction);
      return;
    }

    // ─── Hunt buttons ───────────────────────────
    if (customId.startsWith("wr_")) {
      await handleHuntButton(interaction);
      return;
    }

    // ─── Scan/Call action buttons (note, email, etc.) ─
    if (customId.startsWith("scan_")) {
      await handleScanActionButton(interaction);
      return;
    }

    // ─── Simple status buttons (scan + call salon) ─
    const [action, placeId] = customId.split(":");

    if (!placeId || !SIMPLE_STATUS_MAP[action]) {
      await interaction.reply({ content: "❌ Bouton invalide.", flags: MessageFlags.Ephemeral });
      return;
    }

    const newStatus = SIMPLE_STATUS_MAP[action];

    // Handle callback with followup
    if (action === "call_callback") {
      setFollowup(placeId, 3, "CALL");
    }

    updateLeadStatus(placeId, newStatus);

    // Log activity
    if (interaction.guildId) {
      const actType = action === "call_done" ? "call" as const
        : action === "call_callback" ? "callback" as const
        : action === "call_closed" ? "closed" as const
        : action === "call_nofollowup" ? "refusal" as const
        : "call" as const;
      logActivity({
        guild_id: interaction.guildId,
        user_id: interaction.user.id,
        user_tag: interaction.user.tag,
        type: actType,
        place_id: placeId,
        details: `Status → ${newStatus}`,
        revenue: 0,
      });
      if (action === "call_done" || action === "call_callback") {
        markLeadCalled(placeId);
      }
    }

    // Update embed
    const message = interaction.message;
    const existingEmbed = message.embeds[0];

    if (existingEmbed) {
      const updatedEmbed = EmbedBuilder.from(existingEmbed);
      const fields = updatedEmbed.data.fields || [];
      const statusFieldIndex = fields.findIndex((f) => f.name === "📌 Status" || f.name === "📌 Statut");

      const statusValue = `${buildStatusTag(newStatus)} — par <@${interaction.user.id}>`;

      if (statusFieldIndex >= 0) {
        fields[statusFieldIndex].value = statusValue;
      } else {
        fields.push({ name: "📌 Status", value: statusValue, inline: false });
      }

      updatedEmbed.setFields(fields);
      updatedEmbed.setColor(COLOR_MAP[newStatus] || 0x2b82d9);

      await interaction.update({ embeds: [updatedEmbed] });
    } else {
      await interaction.reply({ content: `✅ Lead marqué comme **${newStatus}**.`, flags: MessageFlags.Ephemeral });
    }

    logger.info(`🏷️ Lead ${placeId} → ${newStatus} (par ${interaction.user.tag})`);

  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    logger.error(`❌ Erreur bouton: ${msg}`);
    try {
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp({ content: `❌ Erreur: ${msg}`, flags: MessageFlags.Ephemeral });
      } else {
        await interaction.reply({ content: `❌ Erreur: ${msg}`, flags: MessageFlags.Ephemeral });
      }
    } catch {
      // Can't respond — silently fail
    }
  }
}

// ─── Call Queue Button Handler ─────────────────────

async function handleCallQueueButton(interaction: ButtonInteraction): Promise<void> {
  const parts = interaction.customId.split(":");
  const action = parts[0]; // cq_next, cq_done, etc.
  const targetUserId = parts[1]; // The user who owns this queue
  const placeId = parts[2]; // The place_id (not present for cq_next)

  // Only the queue owner can use these buttons
  if (interaction.user.id !== targetUserId) {
    await interaction.reply({
      content: "❌ Ce n'est pas ta file d'appels. Utilise `/call_queue` pour ouvrir la tienne.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const guildId = interaction.guildId;
  if (!guildId) return;

  let feedbackMessage = "";

  switch (action) {
    case "cq_next":
      // Just skip to next — no status change
      feedbackMessage = "➡️ Passage au suivant…";
      break;

    case "cq_done":
      if (placeId) {
        markLeadDone(placeId);
        feedbackMessage = "✅ Lead marqué comme **TERMINÉ**.";
        logActivity({
          guild_id: guildId,
          user_id: interaction.user.id,
          user_tag: interaction.user.tag,
          type: "call",
          place_id: placeId,
          details: "Done via call queue",
          revenue: 0,
        });
      }
      break;

    case "cq_claim":
      if (placeId) {
        claimLead(placeId, interaction.user.id);
        // Don't advance — stay on this lead
        const claimedLead = getLeadByPlaceId(placeId);
        if (claimedLead) {
          const notes = getLeadNotes(placeId);
          const emails = getLeadEmails(placeId);
          const embed = buildCallQueueEmbed(claimedLead, notes, emails);
          const buttons = buildCallQueueButtons(interaction.user.id, placeId);
          await interaction.update({
            content: `📞 **Lead pris !** Tu es assigné à ce lead.`,
            embeds: [embed],
            components: buttons,
          });
          logger.info(`📞 Lead ${placeId} pris par ${interaction.user.tag}`);
        }
        return;
      }
      break;

    case "cq_check":
      if (placeId) {
        updateLeadStatus(placeId, "CHECK");
        feedbackMessage = "🟡 Lead marqué comme **À VÉRIFIER**.";
      }
      break;

    case "cq_ignore":
      if (placeId) {
        updateLeadStatus(placeId, "IGNORE");
        feedbackMessage = "❌ Lead **IGNORÉ**.";
      }
      break;

    case "cq_fu3":
      if (placeId) {
        setFollowup(placeId, 3);
        feedbackMessage = "⏳ Relance programmée dans **3 jours**.";
      }
      break;

    case "cq_fu7":
      if (placeId) {
        setFollowup(placeId, 7);
        feedbackMessage = "⏳ Relance programmée dans **7 jours**.";
      }
      break;

    // ─── New CQ buttons: Comment ────────────────
    case "cq_comment":
      if (placeId) {
        const noteModal = new ModalBuilder()
          .setCustomId(`add_note:${placeId}`)
          .setTitle("📝 Ajouter une note")
          .addComponents(
            new ActionRowBuilder<TextInputBuilder>().addComponents(
              new TextInputBuilder()
                .setCustomId("note_content")
                .setLabel("Note / Commentaire")
                .setPlaceholder("Ex: Pas de réponse, rappeler demain matin...")
                .setStyle(TextInputStyle.Paragraph)
                .setRequired(true)
                .setMaxLength(1000)
            )
          );
        await interaction.showModal(noteModal);
      }
      return;

    // ─── New CQ buttons: Callback Reason ────────
    case "cq_callback_reason":
      if (placeId) {
        const callbackModal = new ModalBuilder()
          .setCustomId(`callback_reason:${placeId}`)
          .setTitle("🔄 Raison de rappel")
          .addComponents(
            new ActionRowBuilder<TextInputBuilder>().addComponents(
              new TextInputBuilder()
                .setCustomId("callback_reason_text")
                .setLabel("Raison du rappel")
                .setPlaceholder("Ex: Intéressé, veut un devis, rappeler mercredi...")
                .setStyle(TextInputStyle.Short)
                .setRequired(true)
                .setMaxLength(200)
            ),
            new ActionRowBuilder<TextInputBuilder>().addComponents(
              new TextInputBuilder()
                .setCustomId("callback_notes")
                .setLabel("Notes supplémentaires (optionnel)")
                .setPlaceholder("Détails du call...")
                .setStyle(TextInputStyle.Paragraph)
                .setRequired(false)
                .setMaxLength(500)
            )
          );
        await interaction.showModal(callbackModal);
      }
      return;

    // ─── New CQ buttons: Email (send) ───────────
    case "cq_email":
      if (placeId) {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        const lead = getLeadByPlaceId(placeId);
        if (!lead) {
          await interaction.editReply("❌ Lead introuvable.");
          return;
        }
        const emails = getLeadEmails(placeId);
        const emailToSend = emails.find((e) => e.status === "found" || e.status === "enriched") 
          || (lead.email ? { id: undefined, email: lead.email } : null);
        
        if (!emailToSend) {
          await interaction.editReply("❌ Aucun email trouvé. Utilisez le bouton **Trouver email** d'abord.");
          return;
        }

        if (!canSendEmail()) {
          await interaction.editReply("⏳ Rate limit atteint. Réessayez dans quelques instants.");
          return;
        }

        // Use the no_website template if applicable
        const templateId = lead.no_website ? "website_proposal_fr" as const : "introduction_fr" as const;

        // Ensure email is in the DB
        let emailId = emailToSend.id;
        if (!emailId) {
          addLeadEmail({
            place_id: placeId,
            email: emailToSend.email,
            source: "manual",
            status: "found",
          });
          const freshEmails = getLeadEmails(placeId);
          emailId = freshEmails[0]?.id;
        }

        if (!emailId) {
          await interaction.editReply("❌ Erreur interne.");
          return;
        }

        const result = await sendEmail({
          emailId,
          to: emailToSend.email,
          leadName: lead.name,
          templateId,
          templateData: {
            leadName: lead.name,
            leadCity: lead.scan_city || "",
            leadPhone: lead.phone || "",
            leadWebsite: lead.website || "",
            senderName: config.fromName,
            senderEmail: config.fromEmail,
          },
        });

        if (result.success) {
          logActivity({
            guild_id: guildId,
            user_id: interaction.user.id,
            user_tag: interaction.user.tag,
            type: "email_sent",
            place_id: placeId,
            details: `→ ${emailToSend.email}`,
            revenue: 0,
          });
          await interaction.editReply(`✅ Email envoyé à **${emailToSend.email}** pour **${lead.name}** !`);
        } else {
          await interaction.editReply(`❌ Erreur envoi: ${result.error}`);
        }
      }
      return;

    // ─── New CQ buttons: Find Email ─────────────
    case "cq_find_email":
      if (placeId) {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        const lead = getLeadByPlaceId(placeId);
        if (!lead) {
          await interaction.editReply("❌ Lead introuvable.");
          return;
        }
        if (!lead.website) {
          await interaction.editReply("❌ Pas de site web à scraper pour ce lead.");
          return;
        }

        const socialUrl = lead.social_only ? lead.website : undefined;
        const enrichedResults = await deepScrapeEmailsDetailed(lead.website, lead.name, socialUrl);
        if (enrichedResults.length === 0) {
          await interaction.editReply(`🔍 Aucun email trouvé pour **${lead.name}** (toutes sources épuisées).`);
          return;
        }

        const foundEmails = enrichedResults.map((e) => e.email);
        for (const enriched of enrichedResults) {
          addLeadEmail({
            place_id: placeId,
            email: enriched.email,
            source: enriched.source,
            status: "found",
          });
        }

        logActivity({
          guild_id: guildId,
          user_id: interaction.user.id,
          user_tag: interaction.user.tag,
          type: "email_enriched",
          place_id: placeId,
          details: foundEmails.join(", "),
          revenue: 0,
        });

        await interaction.editReply(`🔍 **${foundEmails.length} email(s) trouvé(s)** :\n${enrichedResults.map((e) => {
          const badge = e.confidence === "high" ? "🟢" : e.confidence === "medium" ? "🟡" : "🔴";
          return `${badge} ${e.email} *(${e.source})*`;
        }).join("\n")}`);
      }
      return;

    // ─── New CQ buttons: Meeting ────────────────
    case "cq_meeting":
      if (placeId) {
        const meetingModal = new ModalBuilder()
          .setCustomId(`log_meeting:${placeId}`)
          .setTitle("📅 Logger un RDV")
          .addComponents(
            new ActionRowBuilder<TextInputBuilder>().addComponents(
              new TextInputBuilder()
                .setCustomId("meeting_details")
                .setLabel("Détails du RDV")
                .setPlaceholder("Ex: RDV mardi 14h, discussion devis site web...")
                .setStyle(TextInputStyle.Paragraph)
                .setRequired(false)
                .setMaxLength(500)
            )
          );
        await interaction.showModal(meetingModal);
      }
      return;

    // ─── New CQ buttons: Revenue ────────────────
    case "cq_revenue":
      if (placeId) {
        const revenueModal = new ModalBuilder()
          .setCustomId(`log_revenue:${placeId}`)
          .setTitle("💰 Logger du revenu")
          .addComponents(
            new ActionRowBuilder<TextInputBuilder>().addComponents(
              new TextInputBuilder()
                .setCustomId("revenue_amount")
                .setLabel("Montant (€)")
                .setPlaceholder("Ex: 1500")
                .setStyle(TextInputStyle.Short)
                .setRequired(true)
                .setMaxLength(20)
            ),
            new ActionRowBuilder<TextInputBuilder>().addComponents(
              new TextInputBuilder()
                .setCustomId("revenue_details")
                .setLabel("Détails (optionnel)")
                .setPlaceholder("Ex: Site web vitrine, 3 pages...")
                .setStyle(TextInputStyle.Paragraph)
                .setRequired(false)
                .setMaxLength(500)
            )
          );
        await interaction.showModal(revenueModal);
      }
      return;

    default:
      await interaction.reply({ content: "❌ Action inconnue.", flags: MessageFlags.Ephemeral });
      return;
  }

  // Advance to next lead
  const currentPlaceId = placeId || undefined;
  const nextLead = getNextCallQueueLead(guildId, interaction.user.id, currentPlaceId);

  if (!nextLead) {
    await interaction.update({
      content: `${feedbackMessage}\n\n🎉 **Bravo !** Plus aucun lead dans la file.`,
      embeds: [],
      components: [],
    });
    upsertCallSession(interaction.user.id, null);
    return;
  }

  upsertCallSession(interaction.user.id, nextLead.place_id);

  const nextNotes = getLeadNotes(nextLead.place_id);
  const nextEmails = getLeadEmails(nextLead.place_id);
  const embed = buildCallQueueEmbed(nextLead, nextNotes, nextEmails);
  const buttons = buildCallQueueButtons(interaction.user.id, nextLead.place_id);

  await interaction.update({
    content: `${feedbackMessage}\n\n➡️ **Lead suivant** (score: ${nextLead.lead_score}/100)`,
    embeds: [embed],
    components: buttons,
  });

  logger.info(`📞 CQ ${action}: → lead ${nextLead.place_id} (score ${nextLead.lead_score}) pour ${interaction.user.tag}`);
}

// ─── Follow-up Button Handler ──────────────────────

async function handleFollowupButton(interaction: ButtonInteraction): Promise<void> {
  const [action, placeId] = interaction.customId.split(":");

  if (!placeId) {
    await interaction.reply({ content: "❌ Bouton invalide.", flags: MessageFlags.Ephemeral });
    return;
  }

  switch (action) {
    case "fu_done":
      clearFollowup(placeId);
      await interaction.update({
        content: `✅ **Relancé !** — par <@${interaction.user.id}>`,
        embeds: interaction.message.embeds.map((e) => {
          const updated = EmbedBuilder.from(e).setColor(0x2ecc71);
          return updated;
        }),
        components: [],
      });
      logger.info(`🔔 Followup done: ${placeId} par ${interaction.user.tag}`);
      break;

    case "fu_postpone3":
      setFollowup(placeId, 3);
      await interaction.update({
        content: `⏳ **Repoussé de 3 jours** — par <@${interaction.user.id}>`,
        embeds: interaction.message.embeds.map((e) => EmbedBuilder.from(e)),
        components: [],
      });
      logger.info(`🔔 Followup postponed +3d: ${placeId} par ${interaction.user.tag}`);
      break;

    case "fu_ignore":
      updateLeadStatus(placeId, "IGNORE");
      await interaction.update({
        content: `❌ **Ignoré** — par <@${interaction.user.id}>`,
        embeds: interaction.message.embeds.map((e) => EmbedBuilder.from(e).setColor(0x95a5a6)),
        components: [],
      });
      logger.info(`🔔 Followup ignored: ${placeId} par ${interaction.user.tag}`);
      break;

    default:
      await interaction.reply({ content: "❌ Action inconnue.", flags: MessageFlags.Ephemeral });
  }
}

// ─── Scan/Call Action Buttons (note, email, etc.) ──

async function handleScanActionButton(interaction: ButtonInteraction): Promise<void> {
  const [action, placeId] = interaction.customId.split(":");

  if (!placeId) {
    await interaction.reply({ content: "❌ Bouton invalide.", flags: MessageFlags.Ephemeral });
    return;
  }

  const guildId = interaction.guildId || "";

  switch (action) {
    // ─── Note / Comment ───────────────────────────
    case "scan_comment": {
      const noteModal = new ModalBuilder()
        .setCustomId(`add_note:${placeId}`)
        .setTitle("📝 Ajouter une note")
        .addComponents(
          new ActionRowBuilder<TextInputBuilder>().addComponents(
            new TextInputBuilder()
              .setCustomId("note_content")
              .setLabel("Note / Commentaire")
              .setPlaceholder("Ex: Pas de réponse, rappeler demain matin...")
              .setStyle(TextInputStyle.Paragraph)
              .setRequired(true)
              .setMaxLength(1000)
          )
        );
      await interaction.showModal(noteModal);
      return;
    }

    // ─── Callback Reason ──────────────────────────
    case "scan_callback_reason": {
      const callbackModal = new ModalBuilder()
        .setCustomId(`callback_reason:${placeId}`)
        .setTitle("🔄 Raison de rappel")
        .addComponents(
          new ActionRowBuilder<TextInputBuilder>().addComponents(
            new TextInputBuilder()
              .setCustomId("callback_reason_text")
              .setLabel("Raison du rappel")
              .setPlaceholder("Ex: Intéressé, veut un devis, rappeler mercredi...")
              .setStyle(TextInputStyle.Short)
              .setRequired(true)
              .setMaxLength(200)
          ),
          new ActionRowBuilder<TextInputBuilder>().addComponents(
            new TextInputBuilder()
              .setCustomId("callback_notes")
              .setLabel("Notes supplémentaires (optionnel)")
              .setPlaceholder("Détails du call...")
              .setStyle(TextInputStyle.Paragraph)
              .setRequired(false)
              .setMaxLength(500)
          )
        );
      await interaction.showModal(callbackModal);
      return;
    }

    // ─── Find Email ───────────────────────────────
    case "scan_find_email": {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      const lead = getLeadByPlaceId(placeId);
      if (!lead) {
        await interaction.editReply("❌ Lead introuvable.");
        return;
      }
      if (!lead.website) {
        await interaction.editReply("❌ Pas de site web à scraper pour ce lead.");
        return;
      }

      const socialUrl = lead.social_only ? lead.website : undefined;
      const enrichedResults = await deepScrapeEmailsDetailed(lead.website, lead.name, socialUrl);
      if (enrichedResults.length === 0) {
        await interaction.editReply(`🔍 Aucun email trouvé pour **${lead.name}** (toutes sources épuisées).`);
        return;
      }

      const foundEmails = enrichedResults.map((e) => e.email);
      for (const enriched of enrichedResults) {
        addLeadEmail({
          place_id: placeId,
          email: enriched.email,
          source: enriched.source,
          status: "found",
        });
      }

      if (guildId) {
        logActivity({
          guild_id: guildId,
          user_id: interaction.user.id,
          user_tag: interaction.user.tag,
          type: "email_enriched",
          place_id: placeId,
          details: foundEmails.join(", "),
          revenue: 0,
        });
      }

      await interaction.editReply(
        `🔍 **${foundEmails.length} email(s) trouvé(s)** pour **${lead.name}** :\n${enrichedResults.map((e) => {
          const badge = e.confidence === "high" ? "🟢" : e.confidence === "medium" ? "🟡" : "🔴";
          return `${badge} ${e.email} *(${e.source})*`;
        }).join("\n")}`
      );
      logger.info(`🔍 Emails trouvés pour ${placeId}: ${foundEmails.join(", ")} par ${interaction.user.tag}`);
      return;
    }

    // ─── Send Email ───────────────────────────────
    case "scan_email": {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      const lead = getLeadByPlaceId(placeId);
      if (!lead) {
        await interaction.editReply("❌ Lead introuvable.");
        return;
      }

      const emails = getLeadEmails(placeId);
      const emailToSend = emails.find((e) => e.status === "found" || e.status === "enriched")
        || (lead.email ? { id: undefined as number | undefined, email: lead.email } : null);

      if (!emailToSend) {
        await interaction.editReply("❌ Aucun email trouvé. Utilisez le bouton **Trouver email** d'abord.");
        return;
      }

      if (!canSendEmail()) {
        await interaction.editReply("⏳ Rate limit atteint. Réessayez dans quelques instants.");
        return;
      }

      const templateId = lead.no_website ? "website_proposal_fr" as const : "introduction_fr" as const;

      let emailId = emailToSend.id;
      if (!emailId) {
        addLeadEmail({
          place_id: placeId,
          email: emailToSend.email,
          source: "manual",
          status: "found",
        });
        const freshEmails = getLeadEmails(placeId);
        emailId = freshEmails[0]?.id;
      }

      if (!emailId) {
        await interaction.editReply("❌ Erreur interne.");
        return;
      }

      const result = await sendEmail({
        emailId,
        to: emailToSend.email,
        leadName: lead.name,
        templateId,
        templateData: {
          leadName: lead.name,
          leadCity: lead.scan_city || "",
          leadPhone: lead.phone || "",
          leadWebsite: lead.website || "",
          senderName: config.fromName,
          senderEmail: config.fromEmail,
        },
      });

      if (result.success) {
        if (guildId) {
          logActivity({
            guild_id: guildId,
            user_id: interaction.user.id,
            user_tag: interaction.user.tag,
            type: "email_sent",
            place_id: placeId,
            details: `→ ${emailToSend.email}`,
            revenue: 0,
          });
        }
        await interaction.editReply(`✅ Email envoyé à **${emailToSend.email}** pour **${lead.name}** !`);
      } else {
        await interaction.editReply(`❌ Erreur envoi: ${result.error}`);
      }
      return;
    }

    // ─── Meeting ──────────────────────────────────
    case "scan_meeting": {
      const meetingModal = new ModalBuilder()
        .setCustomId(`log_meeting:${placeId}`)
        .setTitle("📅 Logger un RDV")
        .addComponents(
          new ActionRowBuilder<TextInputBuilder>().addComponents(
            new TextInputBuilder()
              .setCustomId("meeting_details")
              .setLabel("Détails du RDV")
              .setPlaceholder("Ex: RDV mardi 14h, discussion devis site web...")
              .setStyle(TextInputStyle.Paragraph)
              .setRequired(false)
              .setMaxLength(500)
          )
        );
      await interaction.showModal(meetingModal);
      return;
    }

    default:
      await interaction.reply({ content: "❌ Action inconnue.", flags: MessageFlags.Ephemeral });
  }
}

// ─── Hunt Button Handler ──────────────────────────────

async function handleHuntButton(interaction: ButtonInteraction): Promise<void> {
  const [action, encoded] = interaction.customId.split(":");
  if (!encoded) {
    await interaction.reply({ content: "❌ Bouton invalide.", flags: MessageFlags.Ephemeral });
    return;
  }

  // Decode the URL from base64
  let url = "";
  try {
    // Pad base64 if needed
    const padded = encoded + "=".repeat((4 - (encoded.length % 4)) % 4);
    url = Buffer.from(padded, "base64").toString("utf8");
  } catch {
    await interaction.reply({ content: "❌ Lien invalide.", flags: MessageFlags.Ephemeral });
    return;
  }

  const guildId = interaction.guildId ?? "";

  switch (action) {
    // ─── Contacter : ouvre une modale ────────────────
    case "wr_contact": {
      // Find by URL in DB
      const { getDb } = await import("../../db/schema");
      const db = getDb();
      const wr = db.prepare("SELECT id FROM web_requests WHERE url = ?").get(url) as { id: number } | undefined;
      const wrId = wr?.id ?? 0;

      const modal = new ModalBuilder()
        .setCustomId(`contact_request:${wrId}`)
        .setTitle("📩 Contacter ce Prospect")
        .addComponents(
          new ActionRowBuilder<TextInputBuilder>().addComponents(
            new TextInputBuilder()
              .setCustomId("contact_method")
              .setLabel("Methode de contact")
              .setPlaceholder("Ex: Message Reddit, DM Instagram, Email, Appel...")
              .setStyle(TextInputStyle.Short)
              .setRequired(false)
              .setMaxLength(100)
          ),
          new ActionRowBuilder<TextInputBuilder>().addComponents(
            new TextInputBuilder()
              .setCustomId("contact_notes")
              .setLabel("Notes")
              .setPlaceholder("Ex: A l'air intéressé, proposa devis 1200€...")
              .setStyle(TextInputStyle.Paragraph)
              .setRequired(false)
              .setMaxLength(500)
          ),
        );
      await interaction.showModal(modal);
      return;
    }

    // ─── Sauvegarder comme lead ────────────────────
    case "wr_save": {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      if (guildId) {
        logActivity({
          guild_id: guildId,
          user_id: interaction.user.id,
          user_tag: interaction.user.tag,
          type: "lead_scanned",
          details: `[Hunt saved] ${url.substring(0, 80)}`,
          revenue: 0,
        });
      }
      await interaction.editReply(
        `✅ Sauvegardé ! Le post a été marqué dans ta base.\n> 🔗 <${url}>`
      );
      return;
    }

    // ─── Ignorer ───────────────────────────────
    case "wr_ignore": {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      // Lookup by URL and mark ignored
      const { getDb: getDatabase } = await import("../../db/schema");
      const database = getDatabase();
      const wrRow = database.prepare("SELECT id FROM web_requests WHERE url = ?").get(url) as { id: number } | undefined;
      if (wrRow?.id) updateWebRequestStatus(wrRow.id, "IGNORE");
      try {
        const msgEmbed = interaction.message.embeds[0];
        if (msgEmbed) {
          const { EmbedBuilder: EB } = await import("discord.js");
          await interaction.message.edit({ embeds: [EB.from(msgEmbed).setColor(0x4F545C)], components: [] });
        }
      } catch { /* Can't edit */ }
      await interaction.editReply("⛔ Demande ignorée.");
      logger.info(`⛔ Hunt WR ignored: ${url.substring(0, 60)} par ${interaction.user.tag}`);
      return;
    }

    default:
      await interaction.reply({ content: "❌ Action Hunt inconnue.", flags: MessageFlags.Ephemeral });
  }
}
