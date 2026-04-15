/**
 * enrichEmail.ts — Commande /enrich_email
 * Enrichit les leads en cherchant des emails sur leurs sites web.
 * Permet aussi d'envoyer des emails aux leads enrichis.
 */

import {
  ChatInputCommandInteraction,
  SlashCommandBuilder,
  MessageFlags,
} from "discord.js";
import { logger } from "../../utils/logger";
import {
  getLeadsForEmailEnrichment,
  getLeadByPlaceId,
  addLeadEmail,
  getLeadEmails,
  logActivity,
} from "../../db/queries";
import { deepScrapeEmails, deepScrapeEmailsDetailed, type EnrichedEmail } from "../../services/emailEnrich";
import { sendEmail, getEmailRateStatus } from "../../services/emailSender";
import { listTemplates, TemplateId } from "../../services/emailTemplates";
import { config } from "../../config";

export const data = new SlashCommandBuilder()
  .setName("enrich_email")
  .setDescription("📧 Trouver les emails des commerces et envoyer des campagnes email")
  .addSubcommand((sub) =>
    sub
      .setName("find")
      .setDescription("🔍 Cherche les emails via site web, WHOIS, Google, réseaux sociaux…")
      .addIntegerOption((opt) =>
        opt.setName("limit").setDescription("Nombre de leads à enrichir (défaut : 10)").setRequired(false)
      )
  )
  .addSubcommand((sub) =>
    sub
      .setName("send")
      .setDescription("📧 Envoyer un email à un lead (utilise un template)")
      .addStringOption((opt) =>
        opt.setName("place_id").setDescription("L'identifiant Google du lead (visible dans l'embed)").setRequired(true)
      )
      .addStringOption((opt) =>
        opt
          .setName("template")
          .setDescription("Le modèle d'email à utiliser")
          .setRequired(true)
          .addChoices(
            { name: "🇫🇷 Introduction (français)", value: "introduction_fr" },
            { name: "🇬🇧 Introduction (anglais)", value: "introduction_en" },
            { name: "🇫🇷 Relance (français)", value: "followup_fr" },
            { name: "🇬🇧 Relance (anglais)", value: "followup_en" },
            { name: "🇫🇷 Proposition site web (français)", value: "website_proposal_fr" },
            { name: "🇬🇧 Proposition site web (anglais)", value: "website_proposal_en" }
          )
      )
  )
  .addSubcommand((sub) =>
    sub
      .setName("status")
      .setDescription("📊 Voir le statut email d'un lead (emails trouvés, envoyés…)")
      .addStringOption((opt) =>
        opt.setName("place_id").setDescription("L'identifiant Google du lead").setRequired(true)
      )
  )
  .addSubcommand((sub) =>
    sub
      .setName("rate")
      .setDescription("📈 Voir combien d'emails tu peux encore envoyer (rate limit)")
  ) as SlashCommandBuilder;

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const subcommand = interaction.options.getSubcommand();

  switch (subcommand) {
    case "find":
      await handleFind(interaction);
      break;
    case "send":
      await handleSend(interaction);
      break;
    case "status":
      await handleStatus(interaction);
      break;
    case "rate":
      await handleRate(interaction);
      break;
    default:
      await interaction.reply({ content: "❌ Sous-commande inconnue.", flags: MessageFlags.Ephemeral });
  }
}

// ─── Find Emails ───────────────────────────────────

async function handleFind(interaction: ChatInputCommandInteraction): Promise<void> {
  const guildId = interaction.guildId;
  if (!guildId) {
    await interaction.reply({ content: "❌ Commande serveur uniquement.", flags: MessageFlags.Ephemeral });
    return;
  }

  const limit = interaction.options.getInteger("limit") || 10;
  await interaction.deferReply();

  try {
    const leads = getLeadsForEmailEnrichment(guildId, limit);

    if (leads.length === 0) {
      await interaction.editReply("📧 Aucun lead à enrichir (tous ont déjà un email ou pas de site web).");
      return;
    }

    let found = 0;
    let failed = 0;
    const results: string[] = [];

    for (const lead of leads) {
      if (!lead.website) continue;

      try {
        // Utiliser l'enrichissement multi-sources
        const socialUrl = lead.social_only ? lead.website : undefined;
        const enrichedEmails = await deepScrapeEmailsDetailed(
          lead.website,
          lead.name,
          socialUrl,
        );

        if (enrichedEmails.length > 0) {
          for (const enriched of enrichedEmails) {
            addLeadEmail({
              place_id: lead.place_id,
              email: enriched.email,
              source: enriched.source,
              status: "found",
            });
          }
          found++;
          const confBadge = (c: string) => c === "high" ? "🟢" : c === "medium" ? "🟡" : "🔴";
          const emailList = enrichedEmails.slice(0, 3).map((e) => `${confBadge(e.confidence)} ${e.email} (${e.source})`).join(", ");
          results.push(`✅ **${lead.name}** → ${emailList}`);

          // Log activity
          logActivity({
            guild_id: guildId,
            user_id: interaction.user.id,
            user_tag: interaction.user.tag,
            type: "email_enriched",
            place_id: lead.place_id,
            details: enrichedEmails.map((e) => e.email).join(", "),
            revenue: 0,
          });
        } else {
          failed++;
          results.push(`❌ **${lead.name}** — aucun email trouvé (toutes sources épuisées)`);
        }
      } catch {
        failed++;
        results.push(`⚠️ **${lead.name}** — erreur`);
      }

      // Small delay between scrapes
      await new Promise((r) => setTimeout(r, 1000));
    }

    const summary = [
      `📧 **Enrichissement terminé**`,
      `✅ Trouvés : **${found}** / ${leads.length}`,
      `❌ Non trouvés : **${failed}**`,
      "",
      ...results.slice(0, 15), // Limit display
      results.length > 15 ? `\n... et ${results.length - 15} autres` : "",
    ].join("\n");

    await interaction.editReply(summary);
    logger.info(`📧 Enrichissement: ${found}/${leads.length} par ${interaction.user.tag}`);

  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    await interaction.editReply(`❌ Erreur: ${msg}`);
  }
}

// ─── Send Email ────────────────────────────────────

async function handleSend(interaction: ChatInputCommandInteraction): Promise<void> {
  const placeId = interaction.options.getString("place_id", true);
  const templateId = interaction.options.getString("template", true) as TemplateId;

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  try {
    const lead = getLeadByPlaceId(placeId);
    if (!lead) {
      await interaction.editReply("❌ Lead introuvable.");
      return;
    }

    const emails = getLeadEmails(placeId);
    const toSend = emails.find((e) => e.status === "found" || e.status === "enriched");

    if (!toSend) {
      // Try lead.email
      if (lead.email) {
        addLeadEmail({
          place_id: placeId,
          email: lead.email,
          source: "manual",
          status: "found",
        });
        const newEmails = getLeadEmails(placeId);
        const entry = newEmails[0];
        if (entry) {
          const result = await sendEmail({
            emailId: entry.id!,
            to: entry.email,
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
            // Log activity
            if (interaction.guildId) {
              logActivity({
                guild_id: interaction.guildId,
                user_id: interaction.user.id,
                user_tag: interaction.user.tag,
                type: "email_sent",
                place_id: placeId,
                details: `→ ${entry.email} (${templateId})`,
                revenue: 0,
              });
            }
            await interaction.editReply(`✅ Email envoyé à **${entry.email}** pour **${lead.name}** !`);
          } else {
            await interaction.editReply(`❌ Erreur envoi: ${result.error}`);
          }
          return;
        }
      }
      await interaction.editReply("❌ Aucun email trouvé pour ce lead. Utilisez `/enrich_email find` d'abord.");
      return;
    }

    const result = await sendEmail({
      emailId: toSend.id!,
      to: toSend.email,
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
      // Log activity
      if (interaction.guildId) {
        logActivity({
          guild_id: interaction.guildId,
          user_id: interaction.user.id,
          user_tag: interaction.user.tag,
          type: "email_sent",
          place_id: placeId,
          details: `→ ${toSend.email} (${templateId})`,
          revenue: 0,
        });
      }
      await interaction.editReply(`✅ Email envoyé à **${toSend.email}** pour **${lead.name}** !`);
    } else {
      await interaction.editReply(`❌ Erreur envoi: ${result.error}`);
    }

  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    await interaction.editReply(`❌ Erreur: ${msg}`);
  }
}

// ─── Status ────────────────────────────────────────

async function handleStatus(interaction: ChatInputCommandInteraction): Promise<void> {
  const placeId = interaction.options.getString("place_id", true);

  const lead = getLeadByPlaceId(placeId);
  if (!lead) {
    await interaction.reply({ content: "❌ Lead introuvable.", flags: MessageFlags.Ephemeral });
    return;
  }

  const emails = getLeadEmails(placeId);
  const lines = emails.length > 0
    ? emails.map((e) =>
      `${e.status === "sent" ? "✅" : e.status === "error" ? "❌" : "📧"} **${e.email}** — ${e.status}${e.sent_at ? ` (envoyé ${e.sent_at})` : ""}`
    ).join("\n")
    : "Aucun email trouvé.";

  await interaction.reply({
    content: [
      `📧 **Emails pour ${lead.name}** :`,
      `Email lead : ${lead.email || "—"}`,
      `Statut : ${lead.email_status || "none"}`,
      `Dernier email envoyé : ${lead.last_emailed_at || "jamais"}`,
      "",
      lines,
    ].join("\n"),
    flags: MessageFlags.Ephemeral,
  });
}

// ─── Rate ──────────────────────────────────────────

async function handleRate(interaction: ChatInputCommandInteraction): Promise<void> {
  const rate = getEmailRateStatus();
  await interaction.reply({
    content: [
      `📈 **Limite d'envoi d'emails**`,
      `Envoyés cette minute : **${rate.sent}** / ${rate.limit}`,
      `Peut envoyer : ${rate.canSend ? "✅ Oui" : "❌ Non (attendez)"}`,
      `SMTP : ${config.smtpHost ? `✅ ${config.smtpHost}` : "❌ Non configuré"}`,
    ].join("\n"),
    flags: MessageFlags.Ephemeral,
  });
}
