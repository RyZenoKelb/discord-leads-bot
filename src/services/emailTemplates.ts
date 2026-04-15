/**
 * emailTemplates.ts — Email templates for lead outreach.
 * Simple template engine with variable substitution.
 */

export type TemplateId =
  | "introduction_fr"
  | "introduction_en"
  | "followup_fr"
  | "followup_en"
  | "website_proposal_fr"
  | "website_proposal_en";

export interface TemplateData {
  leadName: string;
  leadCity?: string;
  leadPhone?: string;
  leadWebsite?: string;
  senderName?: string;
  senderCompany?: string;
  senderEmail?: string;
  senderPhone?: string;
  customMessage?: string;
}

interface CompiledTemplate {
  subject: string;
  text: string;
  html: string;
}

/**
 * Get a compiled email template with data substituted.
 */
export function getEmailTemplate(templateId: TemplateId, data: TemplateData): CompiledTemplate {
  const template = TEMPLATES[templateId];
  if (!template) {
    throw new Error(`Template inconnu: ${templateId}`);
  }

  return {
    subject: substitute(template.subject, data),
    text: substitute(template.text, data),
    html: substitute(template.html, data),
  };
}

/**
 * List available templates.
 */
export function listTemplates(): Array<{ id: TemplateId; name: string; lang: string }> {
  return [
    { id: "introduction_fr", name: "Introduction (FR)", lang: "fr" },
    { id: "introduction_en", name: "Introduction (EN)", lang: "en" },
    { id: "followup_fr", name: "Relance (FR)", lang: "fr" },
    { id: "followup_en", name: "Follow-up (EN)", lang: "en" },
    { id: "website_proposal_fr", name: "Proposition site web (FR)", lang: "fr" },
    { id: "website_proposal_en", name: "Website Proposal (EN)", lang: "en" },
  ];
}

/**
 * Simple variable substitution: {{varName}} → value
 */
function substitute(text: string, data: TemplateData): string {
  return text
    .replace(/\{\{leadName\}\}/g, data.leadName || "")
    .replace(/\{\{leadCity\}\}/g, data.leadCity || "")
    .replace(/\{\{leadPhone\}\}/g, data.leadPhone || "")
    .replace(/\{\{leadWebsite\}\}/g, data.leadWebsite || "")
    .replace(/\{\{senderName\}\}/g, data.senderName || "Orlan")
    .replace(/\{\{senderCompany\}\}/g, data.senderCompany || "Orlan")
    .replace(/\{\{senderEmail\}\}/g, data.senderEmail || "")
    .replace(/\{\{senderPhone\}\}/g, data.senderPhone || "")
    .replace(/\{\{customMessage\}\}/g, data.customMessage || "");
}

// ─── Templates ─────────────────────────────────────

const TEMPLATES: Record<TemplateId, { subject: string; text: string; html: string }> = {
  introduction_fr: {
    subject: "{{leadName}} — Proposition de collaboration",
    text: `Bonjour,

Je me permets de vous contacter car j'ai découvert {{leadName}} lors de mes recherches.

Je suis {{senderName}} et je propose des solutions digitales pour les entreprises locales comme la vôtre{{leadCity ? ' à ' + leadCity : ''}}.

Je serais ravi d'échanger avec vous pour voir comment je pourrais vous aider à développer votre présence en ligne et attirer plus de clients.

Seriez-vous disponible pour un court appel de 15 minutes cette semaine ?

Cordialement,
{{senderName}}
{{senderCompany}}
{{senderEmail}}`,
    html: `<!DOCTYPE html>
<html><body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
<p>Bonjour,</p>
<p>Je me permets de vous contacter car j'ai découvert <strong>{{leadName}}</strong> lors de mes recherches.</p>
<p>Je suis <strong>{{senderName}}</strong> et je propose des solutions digitales pour les entreprises locales comme la vôtre.</p>
<p>Je serais ravi d'échanger avec vous pour voir comment je pourrais vous aider à <strong>développer votre présence en ligne</strong> et attirer plus de clients.</p>
<p>Seriez-vous disponible pour un <strong>court appel de 15 minutes</strong> cette semaine ?</p>
<p>Cordialement,<br>
<strong>{{senderName}}</strong><br>
{{senderCompany}}<br>
{{senderEmail}}</p>
</body></html>`,
  },

  introduction_en: {
    subject: "{{leadName}} — Collaboration Opportunity",
    text: `Hello,

I came across {{leadName}} during my research and was impressed by your business.

My name is {{senderName}}, and I help local businesses like yours grow their online presence and attract more customers.

I'd love to have a quick 15-minute chat to see how I could help you.

Would you be available for a call this week?

Best regards,
{{senderName}}
{{senderCompany}}
{{senderEmail}}`,
    html: `<!DOCTYPE html>
<html><body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
<p>Hello,</p>
<p>I came across <strong>{{leadName}}</strong> during my research and was impressed by your business.</p>
<p>My name is <strong>{{senderName}}</strong>, and I help local businesses like yours <strong>grow their online presence</strong> and attract more customers.</p>
<p>I'd love to have a quick <strong>15-minute chat</strong> to see how I could help you.</p>
<p>Would you be available for a call this week?</p>
<p>Best regards,<br>
<strong>{{senderName}}</strong><br>
{{senderCompany}}<br>
{{senderEmail}}</p>
</body></html>`,
  },

  followup_fr: {
    subject: "Re: {{leadName}} — Suite à mon précédent message",
    text: `Bonjour,

Je me permets de vous relancer suite à mon précédent email concernant {{leadName}}.

Je comprends que vous êtes occupé(e), mais je suis convaincu qu'un échange rapide pourrait être bénéfique pour votre activité.

Seriez-vous disponible pour un appel cette semaine ?

Cordialement,
{{senderName}}
{{senderCompany}}`,
    html: `<!DOCTYPE html>
<html><body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
<p>Bonjour,</p>
<p>Je me permets de vous relancer suite à mon précédent email concernant <strong>{{leadName}}</strong>.</p>
<p>Je comprends que vous êtes occupé(e), mais je suis convaincu qu'un échange rapide pourrait être bénéfique pour votre activité.</p>
<p>Seriez-vous disponible pour un appel cette semaine ?</p>
<p>Cordialement,<br>
<strong>{{senderName}}</strong><br>
{{senderCompany}}</p>
</body></html>`,
  },

  followup_en: {
    subject: "Re: {{leadName}} — Following up",
    text: `Hello,

I wanted to follow up on my previous email regarding {{leadName}}.

I understand you're busy, but I'm confident a quick chat could be beneficial for your business.

Would you be available for a call this week?

Best regards,
{{senderName}}
{{senderCompany}}`,
    html: `<!DOCTYPE html>
<html><body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
<p>Hello,</p>
<p>I wanted to follow up on my previous email regarding <strong>{{leadName}}</strong>.</p>
<p>I understand you're busy, but I'm confident a quick chat could be beneficial for your business.</p>
<p>Would you be available for a call this week?</p>
<p>Best regards,<br>
<strong>{{senderName}}</strong><br>
{{senderCompany}}</p>
</body></html>`,
  },

  website_proposal_fr: {
    subject: "{{leadName}} — Création de votre site web professionnel",
    text: `Bonjour,

J'ai remarqué que {{leadName}} n'a pas encore de site web professionnel. Dans le monde digital d'aujourd'hui, c'est une vraie opportunité manquée !

Je suis {{senderName}} et je crée des sites web modernes, rapides et optimisés pour le référencement local — spécialement conçus pour les entreprises comme la vôtre.

Voici ce que je propose :
✅ Site web professionnel et responsive
✅ Optimisation Google (SEO local)
✅ Formulaire de contact + Google Maps
✅ Maintenance et support inclus

Je serais ravi de vous faire une démonstration gratuite et sans engagement.

Un appel de 10 minutes suffirait — quand seriez-vous disponible ?

Cordialement,
{{senderName}}
{{senderCompany}}
{{senderEmail}}`,
    html: `<!DOCTYPE html>
<html><body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
<p>Bonjour,</p>
<p>J'ai remarqué que <strong>{{leadName}}</strong> n'a pas encore de site web professionnel. Dans le monde digital d'aujourd'hui, c'est une vraie opportunité manquée !</p>
<p>Je suis <strong>{{senderName}}</strong> et je crée des sites web modernes, rapides et optimisés pour le référencement local — spécialement conçus pour les entreprises comme la vôtre.</p>
<p>Voici ce que je propose :</p>
<ul>
  <li>✅ Site web professionnel et responsive</li>
  <li>✅ Optimisation Google (SEO local)</li>
  <li>✅ Formulaire de contact + Google Maps</li>
  <li>✅ Maintenance et support inclus</li>
</ul>
<p>Je serais ravi de vous faire une <strong>démonstration gratuite</strong> et sans engagement.</p>
<p>Un appel de <strong>10 minutes</strong> suffirait — quand seriez-vous disponible ?</p>
<p>Cordialement,<br>
<strong>{{senderName}}</strong><br>
{{senderCompany}}<br>
{{senderEmail}}</p>
</body></html>`,
  },

  website_proposal_en: {
    subject: "{{leadName}} — Professional Website Creation",
    text: `Hello,

I noticed that {{leadName}} doesn't have a professional website yet. In today's digital world, that's a real missed opportunity!

My name is {{senderName}} and I create modern, fast, and SEO-optimized websites — specially designed for businesses like yours.

Here's what I offer:
✅ Professional and responsive website
✅ Google optimization (local SEO)
✅ Contact form + Google Maps
✅ Maintenance and support included

I'd be happy to give you a free, no-obligation demo.

A 10-minute call would be enough — when would you be available?

Best regards,
{{senderName}}
{{senderCompany}}
{{senderEmail}}`,
    html: `<!DOCTYPE html>
<html><body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
<p>Hello,</p>
<p>I noticed that <strong>{{leadName}}</strong> doesn't have a professional website yet. In today's digital world, that's a real missed opportunity!</p>
<p>My name is <strong>{{senderName}}</strong> and I create modern, fast, and SEO-optimized websites — specially designed for businesses like yours.</p>
<p>Here's what I offer:</p>
<ul>
  <li>✅ Professional and responsive website</li>
  <li>✅ Google optimization (local SEO)</li>
  <li>✅ Contact form + Google Maps</li>
  <li>✅ Maintenance and support included</li>
</ul>
<p>I'd be happy to give you a <strong>free, no-obligation demo</strong>.</p>
<p>A <strong>10-minute call</strong> would be enough — when would you be available?</p>
<p>Best regards,<br>
<strong>{{senderName}}</strong><br>
{{senderCompany}}<br>
{{senderEmail}}</p>
</body></html>`,
  },
};
