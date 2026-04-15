/**
 * emailEnrich.ts — Système d'enrichissement email multi-sources "super solide".
 *
 * Sources utilisées (par ordre de priorité) :
 * 1. Scraping du site web (page d'accueil + pages contact/about/mentions légales)
 * 2. Extraction des mailto: links et métadonnées structurées (JSON-LD, microdata)
 * 3. WHOIS public (via API rdap.org)
 * 4. Recherche Google (cache de recherche "domaine email contact")
 * 5. Pages sociales (Facebook about, Instagram bio)
 * 6. Deviner l'email via patterns courants (info@, contact@, hello@, bonjour@...)
 * 7. Vérification MX du domaine pour valider qu'il accepte les emails
 */

import { logger } from "../utils/logger";
import dns from "node:dns/promises";

// ─── Types ─────────────────────────────────────────

export interface EnrichedEmail {
  email: string;
  source: EmailSource;
  confidence: "high" | "medium" | "low";
}

export type EmailSource =
  | "website_scrape"
  | "contact_page"
  | "mailto_link"
  | "structured_data"
  | "whois"
  | "google_search"
  | "social_media"
  | "pattern_guess"
  | "manual";

/** Regex to match email addresses */
const EMAIL_REGEX = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g;

/** Domains to exclude (common false positives) */
const EXCLUDED_DOMAINS = new Set([
  "example.com",
  "domain.com",
  "email.com",
  "yoursite.com",
  "yourdomain.com",
  "sentry.io",
  "sentry-next.wixpress.com",
  "wixpress.com",
  "w3.org",
  "schema.org",
  "wordpress.org",
  "wordpress.com",
  "google.com",
  "facebook.com",
  "instagram.com",
  "twitter.com",
  "github.com",
  "apple.com",
  "mozilla.org",
  "jquery.com",
  "jsdelivr.net",
  "googleapis.com",
  "gstatic.com",
  "cloudflare.com",
  "gravatar.com",
  "wp.com",
  "squarespace.com",
  "wix.com",
  "weebly.com",
  "shopify.com",
  "godaddy.com",
  "bootstrapcdn.com",
  "fontawesome.com",
  "googletagmanager.com",
  "googleanalytics.com",
  "doubleclick.net",
  "hotjar.com",
  "intercom.io",
  "crisp.chat",
  "tawk.to",
  "zendesk.com",
  "hubspot.com",
  "mailchimp.com",
  "sendgrid.net",
]);

/** File-like extensions to ignore */
const EXCLUDED_EXTENSIONS = [".png", ".jpg", ".jpeg", ".gif", ".svg", ".webp", ".css", ".js", ".map", ".woff", ".woff2", ".ttf", ".eot"];

/** Common email prefixes to try when guessing */
const COMMON_EMAIL_PREFIXES = [
  "info",
  "contact",
  "hello",
  "bonjour",
  "accueil",
  "admin",
  "office",
  "direction",
  "commercial",
  "service",
  "reception",
  "salon",
  "rdv",
  "reservation",
  "commande",
  "devis",
];

// ─── Helpers ───────────────────────────────────────

/** Normalise une URL */
function normalizeUrl(url: string): string {
  let u = url.trim();
  if (!u.startsWith("http://") && !u.startsWith("https://")) {
    u = `https://${u}`;
  }
  return u.replace(/\/+$/, "");
}

/** Extrait le domaine racine d'une URL */
function extractDomain(url: string): string | null {
  try {
    const parsed = new URL(normalizeUrl(url));
    return parsed.hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

/** Vérifie si un domaine est un hébergeur / CMS (pas un vrai domaine business) */
function isHostingDomain(domain: string): boolean {
  const hostingDomains = [
    "wixsite.com", "wix.com", "squarespace.com", "wordpress.com", "weebly.com",
    "blogspot.com", "tumblr.com", "jimdo.com", "webnode.com", "site123.com",
    "godaddysites.com", "my-free.website", "myshopify.com", "shopify.com",
    "facebook.com", "instagram.com", "twitter.com", "linkedin.com",
    "youtube.com", "tiktok.com",
  ];
  return hostingDomains.some((h) => domain.endsWith(h));
}

/** Pause entre les requêtes */
function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** Fetch sécurisé avec timeout */
async function safeFetch(url: string, timeoutMs = 10_000): Promise<Response | null> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "fr-FR,fr;q=0.9,en;q=0.8",
      },
      redirect: "follow",
    });
    clearTimeout(timeout);
    return response;
  } catch {
    return null;
  }
}

// ─── Extraction d'emails depuis HTML ───────────────

/** Extract and clean emails from HTML content */
function extractEmailsFromHtml(html: string): string[] {
  // Decode HTML entities and obfuscation patterns
  const decoded = html
    .replace(/&#64;/g, "@")
    .replace(/&#x40;/g, "@")
    .replace(/\[at\]/gi, "@")
    .replace(/\(at\)/gi, "@")
    .replace(/\s+at\s+/gi, "@")
    .replace(/&#46;/g, ".")
    .replace(/\[dot\]/gi, ".")
    .replace(/\(dot\)/gi, ".")
    .replace(/\s+dot\s+/gi, ".")
    .replace(/%40/g, "@")
    .replace(/\s*@\s*/g, "@");

  const matches = decoded.match(EMAIL_REGEX) || [];

  const seen = new Set<string>();
  const results: string[] = [];

  for (const raw of matches) {
    const email = raw.toLowerCase().trim();
    if (seen.has(email)) continue;
    seen.add(email);

    const domain = email.split("@")[1];
    if (!domain) continue;
    if (EXCLUDED_DOMAINS.has(domain)) continue;
    if (EXCLUDED_EXTENSIONS.some((ext) => email.endsWith(ext))) continue;
    if (email.length < 5 || email.length > 254) continue;
    if (email.startsWith(".") || email.endsWith(".")) continue;
    // Exclure les faux positifs comme "name@2x" (images retina)
    if (/^\S+@\d+x$/.test(email)) continue;

    results.push(email);
  }

  return results;
}

/** Extrait les emails depuis les liens mailto: */
function extractMailtoEmails(html: string): string[] {
  const mailtoRegex = /mailto:([a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,})/gi;
  const emails: string[] = [];
  let match;
  while ((match = mailtoRegex.exec(html)) !== null) {
    const email = match[1].toLowerCase().trim().split("?")[0]; // Remove ?subject=...
    if (!EXCLUDED_DOMAINS.has(email.split("@")[1])) {
      emails.push(email);
    }
  }
  return [...new Set(emails)];
}

/** Extrait les emails depuis les données structurées (JSON-LD, schema.org) */
function extractStructuredDataEmails(html: string): string[] {
  const emails: string[] = [];

  // JSON-LD
  const jsonLdRegex = /<script[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let match;
  while ((match = jsonLdRegex.exec(html)) !== null) {
    try {
      const data = JSON.parse(match[1]);
      const extractFromObj = (obj: Record<string, unknown>) => {
        if (typeof obj !== "object" || obj === null) return;
        for (const [key, value] of Object.entries(obj)) {
          if ((key === "email" || key === "contactPoint") && typeof value === "string") {
            const cleaned = value.replace(/^mailto:/i, "").toLowerCase();
            if (EMAIL_REGEX.test(cleaned)) emails.push(cleaned);
          }
          if (typeof value === "object" && value !== null) {
            extractFromObj(value as Record<string, unknown>);
          }
          if (Array.isArray(value)) {
            for (const item of value) {
              if (typeof item === "object" && item !== null) extractFromObj(item);
              if (typeof item === "string" && EMAIL_REGEX.test(item)) emails.push(item.toLowerCase());
            }
          }
        }
      };
      if (Array.isArray(data)) {
        for (const item of data) extractFromObj(item);
      } else {
        extractFromObj(data);
      }
    } catch {
      // Malformed JSON-LD
    }
  }

  // Microdata itemprop="email"
  const microdataRegex = /itemprop\s*=\s*["']email["'][^>]*content\s*=\s*["']([^"']+)["']/gi;
  while ((match = microdataRegex.exec(html)) !== null) {
    const val = match[1].replace(/^mailto:/i, "").toLowerCase();
    if (EMAIL_REGEX.test(val)) emails.push(val);
  }

  return [...new Set(emails)];
}

// ─── Source 1: Scraping du site web ────────────────

export async function scrapeEmailsFromUrl(url: string): Promise<EnrichedEmail[]> {
  const normalizedUrl = normalizeUrl(url);
  logger.info(`📧 [Source: website] Scraping ${normalizedUrl}`);

  const response = await safeFetch(normalizedUrl);
  if (!response || !response.ok) return [];

  const contentType = response.headers.get("content-type") || "";
  if (!contentType.includes("text/html") && !contentType.includes("text/plain")) return [];

  const html = await response.text();
  const results: EnrichedEmail[] = [];
  const seen = new Set<string>();

  // 1. mailto: links (highest confidence)
  for (const email of extractMailtoEmails(html)) {
    if (!seen.has(email)) {
      seen.add(email);
      results.push({ email, source: "mailto_link", confidence: "high" });
    }
  }

  // 2. Structured data (JSON-LD, microdata)
  for (const email of extractStructuredDataEmails(html)) {
    if (!seen.has(email)) {
      seen.add(email);
      results.push({ email, source: "structured_data", confidence: "high" });
    }
  }

  // 3. Raw HTML scraping
  for (const email of extractEmailsFromHtml(html)) {
    if (!seen.has(email)) {
      seen.add(email);
      results.push({ email, source: "website_scrape", confidence: "medium" });
    }
  }

  return results;
}

// ─── Source 2: Pages contact / about ───────────────

async function scrapeContactPages(baseUrl: string): Promise<EnrichedEmail[]> {
  const normalized = normalizeUrl(baseUrl);
  const results: EnrichedEmail[] = [];
  const seen = new Set<string>();

  const contactPaths = [
    "/contact",
    "/contact-us",
    "/contactez-nous",
    "/nous-contacter",
    "/about",
    "/about-us",
    "/a-propos",
    "/qui-sommes-nous",
    "/mentions-legales",
    "/legal",
    "/impressum",
    "/imprint",
    "/info",
    "/privacy",
    "/politique-de-confidentialite",
    "/cgv",
    "/conditions-generales",
    "/footer",
  ];

  let tried = 0;
  for (const path of contactPaths) {
    if (tried >= 5) break;

    const response = await safeFetch(`${normalized}${path}`, 8_000);
    if (!response || !response.ok) continue;

    tried++;

    const contentType = response.headers.get("content-type") || "";
    if (!contentType.includes("text/html") && !contentType.includes("text/plain")) continue;

    const html = await response.text();

    for (const email of extractMailtoEmails(html)) {
      if (!seen.has(email)) {
        seen.add(email);
        results.push({ email, source: "contact_page", confidence: "high" });
      }
    }
    for (const email of extractStructuredDataEmails(html)) {
      if (!seen.has(email)) {
        seen.add(email);
        results.push({ email, source: "contact_page", confidence: "high" });
      }
    }
    for (const email of extractEmailsFromHtml(html)) {
      if (!seen.has(email)) {
        seen.add(email);
        results.push({ email, source: "contact_page", confidence: "medium" });
      }
    }

    if (results.length > 0 && tried >= 2) break; // Found some, limit requests
    await sleep(300);
  }

  return results;
}

// ─── Source 3: WHOIS via RDAP ──────────────────────

async function whoisEmails(domain: string): Promise<EnrichedEmail[]> {
  if (isHostingDomain(domain)) return [];

  logger.info(`📧 [Source: whois] Recherche RDAP pour ${domain}`);

  try {
    // Utiliser l'API RDAP (publique, pas besoin de clé)
    const response = await safeFetch(`https://rdap.org/domain/${domain}`, 8_000);
    if (!response || !response.ok) return [];

    const data = await response.json() as Record<string, unknown>;
    const emails: string[] = [];

    // Extraire les emails des entités RDAP
    const extractRdapEmails = (obj: unknown) => {
      if (typeof obj !== "object" || obj === null) return;
      if (Array.isArray(obj)) {
        for (const item of obj) extractRdapEmails(item);
        return;
      }
      const record = obj as Record<string, unknown>;

      // vCard format used in RDAP
      if (record.vcardArray && Array.isArray(record.vcardArray)) {
        for (const vcard of record.vcardArray as unknown[][]) {
          if (!Array.isArray(vcard)) continue;
          for (const field of vcard) {
            if (Array.isArray(field) && field[0] === "email" && typeof field[3] === "string") {
              emails.push(field[3].toLowerCase());
            }
          }
        }
      }

      // Recurse into entities
      if (record.entities && Array.isArray(record.entities)) {
        for (const entity of record.entities) {
          extractRdapEmails(entity);
        }
      }
    };

    extractRdapEmails(data);

    return [...new Set(emails)]
      .filter((e) => !EXCLUDED_DOMAINS.has(e.split("@")[1]))
      .map((email) => ({
        email,
        source: "whois" as EmailSource,
        confidence: "medium" as const,
      }));
  } catch {
    return [];
  }
}

// ─── Source 4: Recherche Google ─────────────────────

async function googleSearchEmails(domain: string, businessName?: string): Promise<EnrichedEmail[]> {
  if (isHostingDomain(domain)) return [];

  logger.info(`📧 [Source: google] Recherche "${domain} email contact"`);

  try {
    // Utiliser Google Search via le endpoint de cache (pas besoin d'API key)
    const queries = [
      `"${domain}" email contact`,
      `"${domain}" "@${domain}"`,
    ];

    if (businessName) {
      queries.push(`"${businessName}" email contact "${domain}"`);
    }

    const allEmails: EnrichedEmail[] = [];
    const seen = new Set<string>();

    for (const q of queries.slice(0, 2)) {
      try {
        const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(q)}&num=10&hl=fr`;
        const response = await safeFetch(searchUrl, 8_000);

        if (response && response.ok) {
          const html = await response.text();
          // Extraire les emails de la page de résultats Google
          for (const email of extractEmailsFromHtml(html)) {
            // Privilégier les emails du domaine du business
            if (!seen.has(email)) {
              seen.add(email);
              const confidence = email.endsWith(`@${domain}`) ? "medium" as const : "low" as const;
              allEmails.push({ email, source: "google_search", confidence });
            }
          }
        }
      } catch {
        // Google peut bloquer, on continue
      }

      await sleep(1000); // Respecter le rate limit Google
    }

    return allEmails;
  } catch {
    return [];
  }
}

// ─── Source 5: Pages sociales ──────────────────────

async function socialMediaEmails(socialUrl?: string): Promise<EnrichedEmail[]> {
  if (!socialUrl) return [];

  logger.info(`📧 [Source: social] Scraping ${socialUrl}`);

  try {
    // Facebook about page
    if (socialUrl.includes("facebook.com")) {
      const aboutUrl = socialUrl.replace(/\/$/, "") + "/about";
      const response = await safeFetch(aboutUrl, 8_000);
      if (response && response.ok) {
        const html = await response.text();
        const mailtoEmails = extractMailtoEmails(html);
        const scraped = extractEmailsFromHtml(html);
        const all = [...new Set([...mailtoEmails, ...scraped])];
        return all.map((email) => ({
          email,
          source: "social_media" as EmailSource,
          confidence: "medium" as const,
        }));
      }
    }

    // Instagram — essayer la page directe (souvent limité)
    if (socialUrl.includes("instagram.com")) {
      const response = await safeFetch(socialUrl, 8_000);
      if (response && response.ok) {
        const html = await response.text();
        const emails = extractEmailsFromHtml(html);
        return emails.map((email) => ({
          email,
          source: "social_media" as EmailSource,
          confidence: "low" as const,
        }));
      }
    }

    // Fallback: scraper l'URL directement
    const response = await safeFetch(socialUrl, 8_000);
    if (response && response.ok) {
      const html = await response.text();
      return extractEmailsFromHtml(html).map((email) => ({
        email,
        source: "social_media" as EmailSource,
        confidence: "low" as const,
      }));
    }
  } catch {
    // Silencieux
  }

  return [];
}

// ─── Source 6: Deviner l'email (pattern guess) ─────

async function guessEmails(domain: string): Promise<EnrichedEmail[]> {
  if (isHostingDomain(domain)) return [];

  // D'abord vérifier que le domaine a un MX record (= accepte des emails)
  const hasMx = await checkMxRecords(domain);
  if (!hasMx) {
    logger.info(`📧 [Source: guess] ${domain} n'a pas de MX record, skip`);
    return [];
  }

  logger.info(`📧 [Source: guess] Génération d'emails potentiels pour ${domain}`);

  return COMMON_EMAIL_PREFIXES.map((prefix) => ({
    email: `${prefix}@${domain}`,
    source: "pattern_guess" as EmailSource,
    confidence: "low" as const,
  }));
}

// ─── Vérification MX records ───────────────────────

async function checkMxRecords(domain: string): Promise<boolean> {
  try {
    const records = await dns.resolveMx(domain);
    return records.length > 0;
  } catch {
    return false;
  }
}

/** Vérifie qu'un domaine peut recevoir des emails (pour valider les guesses) */
export async function validateEmailDomain(email: string): Promise<boolean> {
  const domain = email.split("@")[1];
  if (!domain) return false;
  return checkMxRecords(domain);
}

// ─── API Principale : Deep Scrape Multi-Sources ────

/**
 * Enrichissement email "super solide" — tente TOUTES les sources possibles.
 * Retourne les emails triés par confiance (high → low), sans doublons.
 *
 * @param baseUrl    URL du site web du lead (peut être null)
 * @param leadName   Nom du business (pour Google search)
 * @param socialUrl  URL de la page Facebook/Instagram (si social_only)
 * @returns          Liste d'emails enrichis avec source et confiance
 */
export async function deepScrapeEmails(
  baseUrl: string,
  leadName?: string,
  socialUrl?: string,
): Promise<string[]> {
  const enriched = await deepScrapeEmailsDetailed(baseUrl, leadName, socialUrl);
  return enriched.map((e) => e.email);
}

/**
 * Version détaillée — retourne les objets EnrichedEmail complets.
 */
export async function deepScrapeEmailsDetailed(
  baseUrl: string,
  leadName?: string,
  socialUrl?: string,
): Promise<EnrichedEmail[]> {
  const allEmails = new Map<string, EnrichedEmail>();
  const domain = extractDomain(baseUrl);

  logger.info(`📧 ═══════════════════════════════════════`);
  logger.info(`📧 Enrichissement multi-sources pour: ${baseUrl}`);
  logger.info(`📧 Domaine: ${domain || "?"} | Business: ${leadName || "?"}`);
  logger.info(`📧 ═══════════════════════════════════════`);

  const addResults = (results: EnrichedEmail[]) => {
    for (const r of results) {
      if (!allEmails.has(r.email)) {
        allEmails.set(r.email, r);
      }
    }
  };

  // ─── Source 1: Scraping de la page d'accueil ─────
  try {
    const websiteEmails = await scrapeEmailsFromUrl(baseUrl);
    addResults(websiteEmails);
    logger.info(`📧 [website] → ${websiteEmails.length} email(s)`);
  } catch (err) {
    logger.warn(`📧 [website] Erreur: ${err}`);
  }

  // ─── Source 2: Pages contact / about ─────────────
  try {
    const contactEmails = await scrapeContactPages(baseUrl);
    addResults(contactEmails);
    logger.info(`📧 [contact] → ${contactEmails.length} email(s)`);
  } catch (err) {
    logger.warn(`📧 [contact] Erreur: ${err}`);
  }

  // Si on a déjà trouvé des emails de haute confiance, on peut limiter les sources suivantes
  const highConfidence = [...allEmails.values()].filter((e) => e.confidence === "high");
  if (highConfidence.length >= 2) {
    logger.info(`📧 ✅ ${highConfidence.length} email(s) haute confiance trouvé(s), skip sources additionnelles`);
    return sortByConfidence([...allEmails.values()]);
  }

  // ─── Source 3: WHOIS ─────────────────────────────
  if (domain && !isHostingDomain(domain)) {
    try {
      const whoisResults = await whoisEmails(domain);
      addResults(whoisResults);
      logger.info(`📧 [whois] → ${whoisResults.length} email(s)`);
    } catch (err) {
      logger.warn(`📧 [whois] Erreur: ${err}`);
    }
    await sleep(300);
  }

  // ─── Source 4: Recherche Google ───────────────────
  if (domain) {
    try {
      const googleResults = await googleSearchEmails(domain, leadName);
      addResults(googleResults);
      logger.info(`📧 [google] → ${googleResults.length} email(s)`);
    } catch (err) {
      logger.warn(`📧 [google] Erreur: ${err}`);
    }
    await sleep(300);
  }

  // ─── Source 5: Pages sociales ────────────────────
  if (socialUrl) {
    try {
      const socialResults = await socialMediaEmails(socialUrl);
      addResults(socialResults);
      logger.info(`📧 [social] → ${socialResults.length} email(s)`);
    } catch (err) {
      logger.warn(`📧 [social] Erreur: ${err}`);
    }
  }

  // ─── Source 6: Email pattern guess (fallback) ────
  // Seulement si on n'a trouvé AUCUN email jusqu'ici
  if (allEmails.size === 0 && domain && !isHostingDomain(domain)) {
    try {
      const guessed = await guessEmails(domain);
      // Ne garder que les 3 meilleurs patterns (info, contact, hello)
      addResults(guessed.slice(0, 3));
      logger.info(`📧 [guess] → ${Math.min(guessed.length, 3)} email(s) potentiel(s)`);
    } catch (err) {
      logger.warn(`📧 [guess] Erreur: ${err}`);
    }
  }

  const results = sortByConfidence([...allEmails.values()]);
  logger.info(`📧 ═══════════════════════════════════════`);
  logger.info(`📧 TOTAL: ${results.length} email(s) trouvé(s)`);
  for (const r of results) {
    logger.info(`📧   ${r.confidence === "high" ? "🟢" : r.confidence === "medium" ? "🟡" : "🔴"} ${r.email} [${r.source}] (${r.confidence})`);
  }
  logger.info(`📧 ═══════════════════════════════════════`);

  return results;
}

/** Trie les emails par confiance décroissante */
function sortByConfidence(emails: EnrichedEmail[]): EnrichedEmail[] {
  const order = { high: 0, medium: 1, low: 2 };
  return emails.sort((a, b) => order[a.confidence] - order[b.confidence]);
}

/**
 * Enrichissement rapide — uniquement site web + contact pages.
 * Pour les cas où on veut aller vite sans tout essayer.
 */
export async function quickScrapeEmails(baseUrl: string): Promise<string[]> {
  const results = await scrapeEmailsFromUrl(baseUrl);
  if (results.length > 0) return results.map((e) => e.email);

  const contactResults = await scrapeContactPages(baseUrl);
  return contactResults.map((e) => e.email);
}
