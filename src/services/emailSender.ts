/**
 * emailSender.ts — SMTP email sending via nodemailer.
 * Sends outreach emails to leads with rate limiting.
 */

import nodemailer from "nodemailer";
import { config } from "../config";
import { logger } from "../utils/logger";
import { countRecentEmailsSent, markEmailSent, markEmailError } from "../db/queries";
import { getEmailTemplate, TemplateId, TemplateData } from "./emailTemplates";

let transporter: nodemailer.Transporter | null = null;

/**
 * Get or create the SMTP transporter.
 */
function getTransporter(): nodemailer.Transporter {
  if (!transporter) {
    if (!config.smtpHost || !config.smtpUser || !config.smtpPass) {
      throw new Error("SMTP non configuré. Remplissez SMTP_HOST, SMTP_USER, SMTP_PASS dans .env");
    }

    transporter = nodemailer.createTransport({
      host: config.smtpHost,
      port: config.smtpPort,
      secure: config.smtpSecure,
      auth: {
        user: config.smtpUser,
        pass: config.smtpPass,
      },
    });

    logger.info(`📧 SMTP configuré: ${config.smtpHost}:${config.smtpPort} (${config.smtpUser})`);
  }
  return transporter;
}

/**
 * Check if we can send another email (rate limiting).
 */
export function canSendEmail(): boolean {
  const recentCount = countRecentEmailsSent(1); // Last 1 minute
  return recentCount < config.emailRateLimitPerMin;
}

/**
 * Get the current email rate status.
 */
export function getEmailRateStatus(): { sent: number; limit: number; canSend: boolean } {
  const sent = countRecentEmailsSent(1);
  return {
    sent,
    limit: config.emailRateLimitPerMin,
    canSend: sent < config.emailRateLimitPerMin,
  };
}

/**
 * Send an email to a lead.
 */
export async function sendEmail(options: {
  emailId: number;
  to: string;
  leadName: string;
  templateId: TemplateId;
  templateData: TemplateData;
}): Promise<{ success: boolean; error?: string }> {
  try {
    // Rate limit check
    if (!canSendEmail()) {
      const err = "Rate limit atteint. Réessayez dans quelques instants.";
      markEmailError(options.emailId, err);
      return { success: false, error: err };
    }

    const smtp = getTransporter();
    const template = getEmailTemplate(options.templateId, options.templateData);

    const info = await smtp.sendMail({
      from: `"${config.fromName}" <${config.fromEmail}>`,
      to: options.to,
      subject: template.subject,
      text: template.text,
      html: template.html,
    });

    // Mark as sent in DB
    markEmailSent(options.emailId, template.subject, options.templateId);

    logger.info(`📧 Email envoyé à ${options.to} (${options.leadName}) — messageId: ${info.messageId}`);

    return { success: true };
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    markEmailError(options.emailId, msg);
    logger.error(`📧 Erreur envoi email à ${options.to}: ${msg}`);
    return { success: false, error: msg };
  }
}

/**
 * Verify SMTP connection.
 */
export async function verifySmtp(): Promise<boolean> {
  try {
    const smtp = getTransporter();
    await smtp.verify();
    logger.info("📧 SMTP connection verified OK.");
    return true;
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    logger.error(`📧 SMTP verification failed: ${msg}`);
    return false;
  }
}
