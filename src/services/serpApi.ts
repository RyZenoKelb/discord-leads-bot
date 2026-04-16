/**
 * serpApi.ts — Moteur de recherche multi-sources pour le mode Hunt.
 *
 * Stratégie de consommation API (SerpAPI free = 100 req/mois) :
 *   🆓 GRATUIT ILLIMITÉ  → Reddit API, HackerNews, DuckDuckGo, RSS Forums, Nitter (Twitter)
 *   💰 SERP (limité)     → Uniquement Instagram + LinkedIn (impossibles autrement)
 *
 * Sources gratuites :
 *   1. Reddit JSON API        — direct, sans clé, rapide
 *   2. HackerNews Algolia API — direct, sans clé, illimité
 *   3. DuckDuckGo HTML        — scraping de la SERP, gratuit
 *   4. RSS Feeds forums FR    — commentcamarche, papibo, etc.
 *   5. Nitter (Twitter mirror)— instances publiques, sans clé
 *   6. SerpAPI (Google)       — UNIQUEMENT pour Instagram + LinkedIn
 */

import { logger } from "../utils/logger";

// ─── Types communs ─────────────────────────────────

export interface SerpResult {
  title:    string;
  url:      string;
  snippet:  string;
  source:   string;   // reddit, instagram, linkedin, twitter, forum, hackernews, web
  date?:    string;   // ISO string si disponible
  position: number;
}

export interface SerpSearchOptions {
  query:      string;
  dateRange?: "day" | "week" | "month" | "all";
  site?:      string;
  lang?:      string;
  country?:   string;
  limit?:     number;
}

// ─── Source emoji helper ────────────────────────────

const SOURCE_PATTERNS: Record<string, RegExp> = {
  reddit:     /reddit\.com/i,
  instagram:  /instagram\.com/i,
  linkedin:   /linkedin\.com/i,
  twitter:    /twitter\.com|x\.com|nitter\./i,
  facebook:   /facebook\.com/i,
  hackernews: /news\.ycombinator\.com|hn\.algolia/i,
  forum:      /forum|communauté|community|discuss|leboncoin|malt\.fr|codeur\.com|5euros\.com|commentcamarche|papibo|developpez/i,
};

export function detectSource(url: string): string {
  for (const [source, pattern] of Object.entries(SOURCE_PATTERNS)) {
    if (pattern.test(url)) return source;
  }
  return "web";
}

// ═══════════════════════════════════════════════════
// 1. REDDIT API — Gratuit, illimité
// ═══════════════════════════════════════════════════

const REDDIT_SUBREDDITS_DEFAULT = [
  "france", "Paris", "Entrepreneur", "Freelance", "petitboulot",
  "Quebec", "Suisse", "Belgique", "learnprogramming", "webdev",
  "entrepreunariat", "autoentrepreneur",
];

const REDDIT_SUBREDDITS_DOMAIN: Record<string, string[]> = {
  restaurant:  ["restauration", "cuisine", "foodservice"],
  beauty:      ["coiffure", "beauty", "soin"],
  immo:        ["immobilier", "France_immobilier", "investissement"],
  artisan:     ["bricolage", "renovation", "construction"],
  ecommerce:   ["Ecommerce", "dropshipping", "Etsy", "vente"],
  freelance:   ["Freelance", "webdev", "graphisme"],
  medical:     ["medecine", "sante"],
};

export async function redditSearch(
  query: string,
  subreddits: string[] = REDDIT_SUBREDDITS_DEFAULT,
  limit: number = 25,
  timeFilter: "day" | "week" | "month" | "all" = "week"
): Promise<SerpResult[]> {
  const sub = subreddits.join("+");
  const url = `https://www.reddit.com/r/${sub}/search.json?q=${encodeURIComponent(query)}&sort=new&t=${timeFilter}&limit=${limit}&restrict_sr=true`;

  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "OrlanLeadBot/2.0 (lead generation; contact@orlan.me)" },
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) { logger.warn(`⚠️ Reddit ${res.status} pour "${query}"`); return []; }
    const data = await res.json() as any;
    const posts: any[] = (data?.data?.children ?? []).map((c: any) => c.data);

    return posts.map((p, i) => ({
      title:   p.title,
      url:     `https://www.reddit.com${p.permalink}`,
      snippet: (p.selftext ?? "").substring(0, 400),
      source:  "reddit",
      date:    new Date(p.created_utc * 1000).toISOString(),
      position: i + 1,
    }));
  } catch (err: any) {
    logger.warn(`⚠️ Reddit erreur: ${err.message}`);
    return [];
  }
}

// ═══════════════════════════════════════════════════
// 2. HACKER NEWS (Algolia API) — Gratuit, illimité
// ═══════════════════════════════════════════════════

export async function hackerNewsSearch(
  query: string,
  limit: number = 15,
  dateRange?: "day" | "week" | "month" | "all"
): Promise<SerpResult[]> {
  const now = Math.floor(Date.now() / 1000);
  const rangeMap: Record<string, number> = {
    day:   now - 86400,
    week:  now - 604800,
    month: now - 2592000,
  };
  const numericFrom = dateRange && dateRange !== "all" ? rangeMap[dateRange] : 0;
  const filters = numericFrom > 0
    ? `&numericFilters=created_at_i>${numericFrom}`
    : "";

  const url = `https://hn.algolia.com/api/v1/search?query=${encodeURIComponent(query)}&hitsPerPage=${limit}&tags=ask_hn,show_hn${filters}`;

  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8_000) });
    if (!res.ok) return [];
    const data = await res.json() as any;
    const hits = data?.hits ?? [];

    return hits.map((h: any, i: number) => ({
      title:   h.title ?? h.story_title ?? "",
      url:     h.url ?? `https://news.ycombinator.com/item?id=${h.objectID}`,
      snippet: h.comment_text ?? h.story_text ?? "",
      source:  "hackernews",
      date:    h.created_at,
      position: i + 1,
    }));
  } catch (err: any) {
    logger.warn(`⚠️ HackerNews erreur: ${err.message}`);
    return [];
  }
}

// ═══════════════════════════════════════════════════
// 3. DUCKDUCKGO HTML — Gratuit, aucune clé requise
//    Utilisé pour la recherche généraliste (forums, sites FR)
// ═══════════════════════════════════════════════════

export async function duckduckgoSearch(
  query: string,
  limit: number = 15
): Promise<SerpResult[]> {
  // DuckDuckGo Lite (HTML) — pas de JS nécessaire
  const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}&kl=fr-fr`;

  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
        "Accept-Language": "fr-FR,fr;q=0.9",
      },
      signal: AbortSignal.timeout(12_000),
    });
    if (!res.ok) return [];

    const html = await res.text();
    const results: SerpResult[] = [];

    // Extraire les résultats (divs .result)
    const resultBlocks = html.split('<div class="result ');
    for (let i = 1; i < resultBlocks.length && results.length < limit; i++) {
      const block = resultBlocks[i];

      // Extraire l'URL
      const hrefMatch = block.match(/href="([^"]+)"/);
      let resultUrl = hrefMatch?.[1] ?? "";
      if (resultUrl.startsWith("//duckduckgo.com/l/?uddg=")) {
        try {
          const decoded = decodeURIComponent(resultUrl.replace("//duckduckgo.com/l/?uddg=", "").split("&")[0]);
          resultUrl = decoded;
        } catch { continue; }
      }
      if (!resultUrl.startsWith("http")) continue;

      // Extraire le titre
      const titleMatch = block.match(/<a[^>]*class="result__a"[^>]*>([^<]+)</);
      const title = titleMatch?.[1]?.trim() ?? "";

      // Extraire le snippet
      const snippetMatch = block.match(/class="result__snippet"[^>]*>([^<]+(?:<[^/][^>]*>[^<]*<\/[^>]+>)*[^<]*)</);
      const snippet = snippetMatch?.[1]?.replace(/<[^>]+>/g, " ").trim() ?? "";

      if (!title || !resultUrl) continue;

      results.push({
        title,
        url:     resultUrl,
        snippet,
        source:  detectSource(resultUrl),
        position: results.length + 1,
      });
    }

    logger.info(`🦆 DuckDuckGo: ${results.length} résultats pour "${query}"`);
    return results;
  } catch (err: any) {
    logger.warn(`⚠️ DuckDuckGo erreur: ${err.message}`);
    return [];
  }
}

// ═══════════════════════════════════════════════════
// 4. RSS FEEDS — Forums FR (gratuit, illimité)
// ═══════════════════════════════════════════════════

const FRENCH_FORUMS_RSS = [
  // Forums généralistes FR
  "https://www.commentcamarche.net/feed/",
  "https://forums.futura-sciences.com/feeds.php",
  // Freelance / Dev
  "https://www.malt.fr/blog/feed",
  // Entrepreneur
  "https://www.manager-go.com/feed",
];

/** Parse un flux RSS simple et filtre par mots-clés */
async function fetchRss(feedUrl: string, keywords: string[]): Promise<SerpResult[]> {
  try {
    const res = await fetch(feedUrl, {
      headers: { "User-Agent": "OrlanLeadBot/2.0" },
      signal: AbortSignal.timeout(8_000),
    });
    if (!res.ok) return [];
    const xml = await res.text();

    const results: SerpResult[] = [];
    const items = xml.split("<item>");

    for (let i = 1; i < items.length; i++) {
      const item = items[i];

      const title   = item.match(/<title>(?:<!\[CDATA\[)?([^<\]]+)/)?.[1]?.trim() ?? "";
      const link    = item.match(/<link>([^<]+)/)?.[1]?.trim() ?? item.match(/<guid[^>]*>([^<]+)/)?.[1]?.trim() ?? "";
      const desc    = item.match(/<description>(?:<!\[CDATA\[)?([^<\]]{0,500})/)?.[1]?.trim() ?? "";
      const pubDate = item.match(/<pubDate>([^<]+)/)?.[1]?.trim() ?? "";

      if (!link || !title) continue;

      // Filtrer par pertinence (au moins un mot-clé doit matcher)
      const text = `${title} ${desc}`.toLowerCase();
      if (!keywords.some(kw => text.includes(kw.toLowerCase()))) continue;

      results.push({
        title,
        url:     link,
        snippet: desc.replace(/<[^>]+>/g, " ").substring(0, 300),
        source:  "forum",
        date:    pubDate ? new Date(pubDate).toISOString() : undefined,
        position: results.length + 1,
      });
    }

    return results;
  } catch {
    return [];
  }
}

export async function rssForumsSearch(query: string, limit: number = 10): Promise<SerpResult[]> {
  const keywords = query.split(" ").filter(w => w.length > 3);
  const allResults: SerpResult[] = [];
  const seen = new Set<string>();

  const fetches = await Promise.allSettled(
    FRENCH_FORUMS_RSS.map(feed => fetchRss(feed, keywords))
  );

  for (const f of fetches) {
    if (f.status === "fulfilled") {
      for (const r of f.value) {
        if (!seen.has(r.url)) { seen.add(r.url); allResults.push(r); }
      }
    }
  }

  return allResults.slice(0, limit);
}

// ═══════════════════════════════════════════════════
// 5. NITTER — Twitter mirror public (gratuit)
//    Cherche sur les instances Nitter publiques
// ═══════════════════════════════════════════════════

const NITTER_INSTANCES = [
  "https://nitter.poast.org",
  "https://nitter.privacydev.net",
  "https://nitter.catsarch.com",
];

export async function nitterSearch(query: string, limit: number = 10): Promise<SerpResult[]> {
  for (const instance of NITTER_INSTANCES) {
    try {
      const url = `${instance}/search?q=${encodeURIComponent(query)}&f=tweets`;
      const res = await fetch(url, {
        headers: { "User-Agent": "Mozilla/5.0 (compatible; OrlanBot/2.0)" },
        signal: AbortSignal.timeout(8_000),
      });
      if (!res.ok) continue;

      const html = await res.text();
      const results: SerpResult[] = [];
      const tweetBlocks = html.split('<div class="tweet-content');

      for (let i = 1; i < tweetBlocks.length && results.length < limit; i++) {
        const block = tweetBlocks[i];
        const text    = block.match(/>([^<]{10,300})</)?.[1]?.trim() ?? "";
        const dateStr = block.match(/datetime="([^"]+)"/)?.[1] ?? "";

        // Extraire le lien du tweet
        const tweetLinkMatch = html.split('<div class="tweet-link')[i]?.match(/href="([^"]+)"/);
        const tweetPath = tweetLinkMatch?.[1] ?? "";
        const tweetUrl  = tweetPath.startsWith("/")
          ? `https://twitter.com${tweetPath}`
          : tweetPath;

        if (!text || !tweetUrl) continue;

        results.push({
          title:   text.substring(0, 100),
          url:     tweetUrl,
          snippet: text,
          source:  "twitter",
          date:    dateStr || undefined,
          position: results.length + 1,
        });
      }

      if (results.length > 0) {
        logger.info(`🐦 Nitter (${instance}): ${results.length} tweets pour "${query}"`);
        return results;
      }
    } catch { continue; }
  }
  return [];
}

// ═══════════════════════════════════════════════════
// 6. SERP API — RÉSERVÉ à Instagram + LinkedIn
//    Consomme le quota — utilisé avec parcimonie
// ═══════════════════════════════════════════════════

// Tracker des requêtes SerpAPI pour éviter de dépasser le quota
let serpApiCallsThisSession = 0;
const SERP_MAX_CALLS_PER_HUNT = 4; // Max 4 appels par /hunt

export async function serpSearch(options: SerpSearchOptions): Promise<SerpResult[]> {
  const apiKey = process.env.SERP_API_KEY;
  if (!apiKey) return [];

  // Limiter les appels par session de Hunt
  if (serpApiCallsThisSession >= SERP_MAX_CALLS_PER_HUNT) {
    logger.warn(`⚠️ SerpAPI: quota session atteint (${serpApiCallsThisSession} appels). Passage aux sources gratuites.`);
    return [];
  }

  const limit = options.limit ?? 10;
  const DATE_RANGE_MAP: Record<string, string> = {
    day: "qdr:d", week: "qdr:w", month: "qdr:m", all: "",
  };
  const tbs = options.dateRange ? (DATE_RANGE_MAP[options.dateRange] ?? "") : "";

  let q = options.query;
  if (options.site) q = `site:${options.site} ${q}`;

  const params = new URLSearchParams({
    api_key: apiKey,
    engine:  "google",
    q,
    num:     String(Math.min(limit, 20)),
    hl:      options.lang ?? "fr",
    gl:      options.country ?? "fr",
    ...(tbs ? { tbs } : {}),
  });

  try {
    serpApiCallsThisSession++;
    logger.info(`📡 SerpAPI call #${serpApiCallsThisSession} — "${q.substring(0, 60)}"`);

    const res = await fetch(`https://serpapi.com/search?${params.toString()}`, {
      signal: AbortSignal.timeout(15_000),
    });

    if (!res.ok) {
      logger.error(`❌ SerpAPI HTTP ${res.status}`);
      return [];
    }

    const data = await res.json() as any;
    const organic: any[] = data.organic_results ?? [];

    return organic.slice(0, limit).map((r: any, i: number) => ({
      title:   r.title ?? "",
      url:     r.link  ?? "",
      snippet: r.snippet ?? "",
      source:  detectSource(r.link ?? ""),
      date:    r.date ?? undefined,
      position: i + 1,
    }));
  } catch (err: any) {
    logger.error(`❌ SerpAPI erreur: ${err.message}`);
    return [];
  }
}

/** Reset le compteur de session (appelé à chaque /hunt) */
export function resetSerpSessionCounter(): void {
  serpApiCallsThisSession = 0;
}

// ═══════════════════════════════════════════════════
// ORCHESTRATEUR — Multi-sources parallèle
// ═══════════════════════════════════════════════════

export interface MultiSourceOptions {
  dateRange?:      "day" | "week" | "month" | "all";
  lang?:           string;
  country?:        string;
  limit?:          number;
  sources?:        string[];
  domain?:         string;
  useSerpForSocial?: boolean;  // Consomme SerpAPI — uniquement si vrai et nécessaire
}

/** Recherche multi-sources parallèle optimisée */
export async function multiSourceSearch(
  queries: string[],
  options: MultiSourceOptions
): Promise<SerpResult[]> {
  const seen    = new Set<string>();
  const results: SerpResult[] = [];
  const limit   = options.limit ?? 40;

  const addResults = (newResults: SerpResult[]) => {
    for (const r of newResults) {
      if (r.url && !seen.has(r.url)) {
        seen.add(r.url);
        results.push(r);
      }
    }
  };

  // Prendre les 3 premières queries principales (éviter trop d'appels)
  const mainQueries  = queries.slice(0, 3);
  const extraQueries = queries.slice(3, 5);

  logger.info(`🔍 Hunt — ${mainQueries.length} queries principales, ${extraQueries.length} secondaires`);

  // ── Étape 1 : Sources gratuites en parallèle ──────
  const freePromises: Promise<SerpResult[]>[] = [];

  for (const query of mainQueries) {
    // Reddit (gratuit, illimité)
    const subreddits = buildSubreddits(options.domain);
    freePromises.push(redditSearch(query, subreddits, 20,
      options.dateRange === "day" ? "day" : options.dateRange === "month" ? "month" : "week"
    ));

    // DuckDuckGo (gratuit, illimité)
    freePromises.push(duckduckgoSearch(query, 10));

    // RSS Forums FR (gratuit)
    freePromises.push(rssForumsSearch(query, 8));
  }

  // HackerNews (pour les queries EN)
  if (options.lang === "en" || options.lang === "all") {
    for (const query of mainQueries.slice(0, 2)) {
      freePromises.push(hackerNewsSearch(query, 10, options.dateRange));
    }
  }

  // Twitter via Nitter (gratuit)
  if (!options.sources || options.sources.includes("twitter") || options.sources.includes("all")) {
    for (const query of mainQueries.slice(0, 2)) {
      freePromises.push(nitterSearch(query, 8));
    }
  }

  logger.info(`🆓 Lancement de ${freePromises.length} requêtes gratuites en parallèle…`);
  const freeResults = await Promise.allSettled(freePromises);
  for (const r of freeResults) {
    if (r.status === "fulfilled") addResults(r.value);
  }
  logger.info(`✅ Sources gratuites: ${results.length} résultats`);

  // ── Étape 2 : SerpAPI — Uniquement Instagram + LinkedIn ──
  // (seulement si l'utilisateur veut ces sources ET si on n'a pas encore assez)
  const wantsSocial = !options.sources || options.sources.includes("instagram") || options.sources.includes("linkedin") || options.sources.includes("all");

  if (wantsSocial && options.useSerpForSocial && process.env.SERP_API_KEY) {
    const socialSites = ["instagram.com", "linkedin.com"];
    const serpQuery   = mainQueries[0];
    const country     = options.country ?? detectCountryFromLang(options.lang);

    for (const site of socialSites) {
      if (results.length >= limit) break;
      const socialResults = await serpSearch({
        query:     serpQuery,
        site,
        dateRange: options.dateRange,
        lang:      options.lang ?? "fr",
        country,
        limit:     8,
      });
      addResults(socialResults);
    }
  }

  logger.info(`🏁 Multi-source total: ${results.length} résultats bruts`);
  return results.slice(0, limit * 3); // Garder large pour le filtre NLP
}

// ─── Helpers ────────────────────────────────────────

function buildSubreddits(domain?: string): string[] {
  const base = [
    "france", "Paris", "Entrepreneur", "Freelance", "petitboulot",
    "Quebec", "Suisse", "Belgique", "autoentrepreneur", "entrepreunariat",
  ];
  if (!domain || domain === "all") return base;

  const extras: Record<string, string[]> = {
    restaurant: ["restauration", "cuisine"],
    beauty:     ["coiffure", "beauty"],
    immo:       ["immobilier", "France_immobilier"],
    artisan:    ["bricolage", "renovation"],
    ecommerce:  ["Ecommerce", "dropshipping", "vente"],
    freelance:  ["Freelance", "webdev", "graphisme"],
    medical:    ["sante"],
  };
  return [...base, ...(extras[domain] ?? [])];
}

function detectCountryFromLang(lang?: string): string {
  if (lang === "he") return "il";
  if (lang === "en") return "us";
  return "fr";
}
