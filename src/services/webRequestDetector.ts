/**
 * webRequestDetector.ts — Orchestrateur du mode Hunt.
 *
 * Stratégie de recherche (SerpAPI free plan = 100 req/mois) :
 *   🆓 ILLIMITÉ → Reddit, DuckDuckGo, HackerNews, RSS Forums, Nitter
 *   💰 LIMITÉ   → SerpAPI réservé uniquement à Instagram + LinkedIn
 *
 * Usage : /hunt zone:Paris domain:restaurant date:semaine
 */

import { logger } from "../utils/logger";
import {
  multiSourceSearch,
  resetSerpSessionCounter,
  type SerpResult,
} from "./serpApi";
import { analyzeContent, filterWebRequests } from "./contentAnalyzer";

// ─── Types ─────────────────────────────────────────

export interface WebRequestLead {
  source:          string;
  url:             string;
  title:           string;
  snippet:         string;
  author?:         string;
  postedAt?:       string;
  domain:          string;
  location?:       string;
  requestType:     string;
  relevanceScore:  number;
  language:        "fr" | "en" | "he" | "unknown";
}

export interface HuntOptions {
  zone?:       string;
  domain?:     string;
  dateRange?:  "day" | "week" | "month" | "all";
  language?:   "fr" | "en" | "he" | "all";
  sources?:    string[];
  limit?:      number;
  minScore?:   number;
}

export interface HuntResult {
  leads:        WebRequestLead[];
  totalFetched: number;
  totalKept:    number;
  sourcesUsed:  string[];
  queryUsed:    string[];
}

// ─── Génération des queries ─────────────────────────

function buildQueries(opts: HuntOptions): string[] {
  const { zone, domain, language = "fr" } = opts;
  const loc = zone ? ` ${zone}` : "";

  const base: Record<string, string[]> = {
    fr: [
      `cherche développeur web créer mon site${loc}`,
      `besoin site web pour mon entreprise${loc}`,
      `qui peut me faire un site internet${loc}`,
      `création site web devis freelance${loc}`,
      `besoin vitrine en ligne${loc}`,
      `développeur web freelance pas cher${loc}`,
      `agence web prix devis${loc}`,
      `faire mon site internet${loc}`,
    ],
    en: [
      `looking for web developer build website${loc}`,
      `need website for my business${loc}`,
      `hire web developer freelance${loc}`,
      `website creation quote${loc}`,
    ],
    he: [
      `מחפש מפתח אתרים${loc}`,
      `צריך אתר לעסק${loc}`,
      `בניית אתר אינטרנט${loc}`,
    ],
    all: [
      `cherche développeur web créer mon site${loc}`,
      `besoin site web entreprise${loc}`,
      `looking for web developer build website${loc}`,
      `מחפש מפתח אתרים${loc}`,
    ],
  };

  let queries = base[language] ?? base.fr;

  // Queries spécifiques au domaine
  if (domain && domain !== "all") {
    const domainExtra: Record<string, string[]> = {
      restaurant:  [`site web restaurant${loc}`, `vitrine en ligne restaurant${loc}`],
      beauty:      [`site web salon coiffure${loc}`, `site coiffeur esthéticienne${loc}`],
      immo:        [`site web agence immobilière${loc}`, `site internet agent immobilier${loc}`],
      artisan:     [`site web artisan plombier${loc}`, `vitrine artisan en ligne${loc}`],
      medical:     [`site web médecin cabinet${loc}`, `site dentiste kiné${loc}`],
      ecommerce:   [`créer boutique en ligne${loc}`, `e-commerce site internet${loc}`],
      freelance:   [`site portfolio freelance${loc}`, `site web consultant coach${loc}`],
    };
    if (domainExtra[domain]) queries = [...queries, ...domainExtra[domain]];
  }

  return [...new Set(queries)];
}

/** Inférer le code pays à partir de la zone */
function detectCountry(zone?: string): string {
  if (!zone) return "fr";
  if (/(?:israel|israël|tel\s*aviv|netanya|haifa|jerusalem|ashdod)/i.test(zone)) return "il";
  if (/(?:canada|montreal|québec|toronto)/i.test(zone)) return "ca";
  if (/(?:belgique|bruxelles)/i.test(zone)) return "be";
  if (/(?:suisse|genève|zurich)/i.test(zone)) return "ch";
  if (/(?:uk|london|england)/i.test(zone)) return "uk";
  if (/(?:usa|new york|los angeles)/i.test(zone)) return "us";
  return "fr";
}

// ─── Orchestrateur principal ────────────────────────

export async function runHunt(opts: HuntOptions): Promise<HuntResult> {
  const limit    = opts.limit    ?? 25;
  const minScore = opts.minScore ?? 30;
  const language = opts.language ?? "fr";

  // Réinitialiser le compteur SerpAPI pour ce Hunt
  resetSerpSessionCounter();

  const queries = buildQueries(opts);
  logger.info(`🎯 Hunt démarré — ${queries.length} queries | zone: ${opts.zone ?? "global"} | domaine: ${opts.domain ?? "all"}`);

  // Détecter si Instagram ou LinkedIn sont demandés → autoriser SerpAPI
  const wantsSocial = !opts.sources
    || opts.sources.includes("all")
    || opts.sources.includes("instagram")
    || opts.sources.includes("linkedin");

  // Lancer toutes les sources en parallèle
  const allResults = await multiSourceSearch(queries, {
    dateRange:       opts.dateRange,
    lang:            language === "all" ? "fr" : language,
    country:         detectCountry(opts.zone),
    limit:           limit * 4, // Large — filtré après
    sources:         opts.sources,
    domain:          opts.domain,
    useSerpForSocial: wantsSocial, // SerpAPI uniquement si réseau social demandé
  });

  logger.info(`📦 Hunt — ${allResults.length} résultats bruts récupérés`);

  // Filtrage NLP
  const filtered = filterWebRequests(allResults, minScore);

  // Construire les leads finaux
  const leads: WebRequestLead[] = filtered
    .slice(0, limit)
    .map(r => ({
      source:         r.source,
      url:            r.url,
      title:          r.title,
      snippet:        r.snippet,
      postedAt:       r.date,
      domain:         r.analysis.domain,
      location:       r.analysis.location ?? opts.zone,
      requestType:    r.analysis.requestType,
      relevanceScore: r.analysis.relevanceScore,
      language:       r.analysis.language,
    }));

  // Sources utilisées
  const sourcesUsed = [...new Set(allResults.map(r => r.source))];

  logger.info(`✅ Hunt terminé — ${leads.length} leads détectés | sources: ${sourcesUsed.join(", ")}`);

  return {
    leads,
    totalFetched: allResults.length,
    totalKept:    leads.length,
    sourcesUsed,
    queryUsed:    queries.slice(0, 5),
  };
}
