/**
 * contentAnalyzer.ts — Analyse NLP des posts pour détecter des demandes de création de site web.
 *
 * Retourne un score de pertinence (0-100) et des métadonnées extraites :
 * - Secteur d'activité (restaurant, coiffeur, immo, …)
 * - Localisation mentionnée
 * - Contact potentiel
 * - Type de demande (site vitrine, e-commerce, refonte, …)
 */

// ─── Patterns de demande de site web ───────────────

/** Expressions indiquant une DEMANDE active de création de site */
export const WEB_REQUEST_PATTERNS_FR = [
  // Demandes directes
  /(?:cherche?|recherche?|besoin d[e']|je veux|je souhaite|je voudrais)\s+(?:un[e]?\s+)?(?:développeur|dev|créateur|webmaster|freelance|agence)\s+web/i,
  /(?:cherche?|recherche?|besoin d[e'])\s+(?:quelqu(?:'|')un|une personne|un professionnel)\s+(?:pour|qui)\s+(?:créer|faire|développer|réaliser|refaire|concevoir)\s+(?:un[e]?\s+)?(?:site|application|appli|vitrine|e-commerce|boutique\s+en\s+ligne)/i,
  /(?:créer?|faire?|développer?|réaliser?|refaire?|concevoir?|construire?)\s+(?:mon|notre|un[e]?)\s+(?:site\s+(?:web|internet|vitrine|e-commerce)|application\s+(?:web|mobile))/i,
  /(?:besoin d[e']|je cherche?|recherche?)\s+(?:un[e]?\s+)?site\s+(?:web|internet|vitrine|e-commerce)/i,
  /(?:qui(?:\s+peut|\s+saurait|\s+serait capable de)|quelqu(?:'|')un pour)\s+(?:me\s+)?(?:créer|faire|développer|réaliser|concevoir)\s+(?:un[e]?\s+)?(?:site|vitrine|boutique)/i,
  /(?:demande de|appel à)\s+(?:devis|proposition|offre)\s+(?:pour\s+)?(?:site\s+web|développement\s+web|création\s+de\s+site)/i,
  /(?:site\s+(?:web|internet)\s+(?:pour\s+(?:mon|ma|notre|ma|son|sa)\s+(?:société|entreprise|commerce|boutique|restaurant|salon|cabinet|agence)))/i,
  /(?:pas encore de|n['''](?:ai|avons) pas\s+(?:de\s+)?|sans)\s+(?:site\s+(?:web|internet)|présence\s+en\s+ligne|vitrine\s+(?:en\s+ligne|web|internet))/i,
  /(?:présence\s+(?:en\s+ligne|sur\s+le\s+web|sur\s+internet)|vitrine\s+(?:web|en\s+ligne|numérique))\s+(?:pour\s+(?:mon|notre|ma))/i,
  /(?:e-commerce|boutique\s+en\s+ligne|shop\s+en\s+ligne)\s+(?:pour\s+)?(?:vendre|commercialiser)/i,
  /(?:refonte|redesign|mise\s+à\s+jour)\s+(?:de\s+(?:mon|notre|ma)\s+)?(?:site\s+(?:web|internet))/i,
  /besoin\s+(?:d[e']\s+)?(?:créer|lancer|ouvrir|mettre\s+en\s+place)\s+(?:un[e]?\s+)?(?:site|boutique|plateforme|vitrine)/i,
];

export const WEB_REQUEST_PATTERNS_EN = [
  /(?:looking for|need|searching for|want|require)\s+(?:a\s+)?(?:web\s+developer|website\s+developer|web\s+designer|freelancer|agency)\s+(?:to|who)/i,
  /(?:need|want|looking for)\s+(?:someone\s+to|help\s+to|a\s+person\s+to)\s+(?:build|create|make|develop|design)\s+(?:a\s+)?(?:website|web\s+app|e-commerce|online\s+store)/i,
  /(?:build|create|make|develop|design)\s+(?:my|our|a)\s+website/i,
  /(?:website|web\s+presence|online\s+store)\s+(?:for\s+(?:my|our)\s+(?:business|company|restaurant|salon|shop|store))/i,
  /(?:no\s+website|don['']t\s+have\s+a\s+website|without\s+(?:a\s+)?website)/i,
  /(?:website|e-commerce|online\s+shop)\s+(?:design|development|creation)\s+(?:needed|required|wanted)/i,
];

export const WEB_REQUEST_PATTERNS_HE = [
  /(?:מחפש|צריך|רוצה)\s+(?:מישהו\s+ל)?(?:בנות|לבנות|לפתח|ליצור|לעצב)\s+(?:אתר|חנות\s+אונליין|אפליקציה)/i,
  /(?:אתר\s+(?:אינטרנט|גלישה|עסקי)|חנות\s+(?:אונליין|וירטואלית))\s+(?:בשביל|עבור|ל)/i,
  /(?:חסר\s+לי|אין\s+לי|ללא)\s+(?:אתר|נוכחות\s+(?:אינטרנטית|ברשת))/i,
];

/** Patterns qui DISQUALIFIENT — spam, non-pertinent */
const NEGATIVE_PATTERNS = [
  /(?:je\s+vends|à\s+vendre|en\s+vente|for\s+sale|selling)\s+(?:un[e]?\s+)?site/i,
  /(?:tutoriel|tutorial|formation|cours|apprendre)/i,
  /(?:gratuit|free)\s+(?:website\s+builder|créateur\s+de\s+site)/i,
  /wix|squarespace|wordpress|shopify\s+(?:tutorial|tuto|cours|formation)/i,
];

// ─── Secteurs d'activité ────────────────────────────

const DOMAIN_PATTERNS: Record<string, RegExp[]> = {
  restaurant: [
    /(?:restaurant|brasserie|bistro|pizzeria|sushi|kebab|traiteur|crêperie|cuisine|gastronomie|chef|food)/i,
    /(?:מסעדה|בית\s?קפה|קייטרינג)/i,
  ],
  beauty: [
    /(?:coiffeur|coiffeuse|salon\s+de\s+coiffure|barbier|esthétique|onglerie|manucure|spa|beauté|institut)/i,
    /(?:מספרה|ספא|קוסמטיקאית)/i,
  ],
  immo: [
    /(?:immobilier|agent\s+immobilier|agence\s+immobilière|notaire|promotion\s+immobilière|location|gestion\s+locative)/i,
    /(?:נדל"ן|תיווך)/i,
  ],
  artisan: [
    /(?:plombier|électricien|serrurier|peintre|maçon|couvreur|menuisier|artisan|bâtiment|travaux|rénovation|bricolage)/i,
    /(?:שרברב|חשמלאי|שיפוצניק)/i,
  ],
  medical: [
    /(?:médecin|dentiste|kinésithérapeute|ostéopathe|pharmacie|cabinet\s+médical|clinique|thérapeute|psychologue|naturopathe)/i,
    /(?:רופא|דנטיסט|קליניקה)/i,
  ],
  ecommerce: [
    /(?:boutique\s+en\s+ligne|e-commerce|vente\s+en\s+ligne|marketplace|shop\s+online|produits|catalogue)/i,
    /(?:חנות\s+אונליין|מכירות\s+אינטרנטיות)/i,
  ],
  freelance: [
    /(?:freelance|indépendant|auto-entrepreneur|consultant|coach|formateur|photographe|graphiste|vidéaste)/i,
    /(?:עצמאי|פרילנסר|יועץ)/i,
  ],
  other: [],
};

// ─── Extraction de localisation ─────────────────────

const LOCATION_PATTERNS = [
  /(?:à|en|sur|dans|région|ville\s+de|commune\s+de|quartier\s+de)\s+([A-ZÀ-Ö][a-zà-ö][\w\s-]{2,30})/,
  /(?:based\s+in|located\s+in|in\s+the)\s+([A-Z][a-z][\w\s-]{2,30})/i,
  /\b(Paris|Lyon|Marseille|Bordeaux|Toulouse|Nantes|Strasbourg|Montpellier|Lille|Nice|Rennes|Grenoble|Netanya|Tel\s*Aviv|Jerusalem|Haifa|Montreal|Bruxelles|Genève)\b/i,
];

// ─── Résultats de l'analyse ─────────────────────────

export interface AnalysisResult {
  isWebRequest: boolean;
  relevanceScore: number;       // 0-100
  domain: string;               // Secteur détecté
  location?: string;            // Localisation extraite
  requestType: string;          // "vitrine", "ecommerce", "refonte", "application", "unknown"
  language: "fr" | "en" | "he" | "unknown";
  matchedPatterns: string[];    // Pour debug
}

// ─── Fonction principale ────────────────────────────

export function analyzeContent(title: string, snippet: string): AnalysisResult {
  const text = `${title} ${snippet}`.normalize("NFC");
  const result: AnalysisResult = {
    isWebRequest: false,
    relevanceScore: 0,
    domain: "other",
    requestType: "unknown",
    language: "unknown",
    matchedPatterns: [],
  };

  // 1) Détecter la langue
  if (/[à-ö|ù-ü|ç]/i.test(text) || /\b(je|tu|il|nous|vous|ils|le|la|les|un|une|des)\b/i.test(text)) {
    result.language = "fr";
  } else if (/[\u05D0-\u05FF]/.test(text)) {
    result.language = "he";
  } else {
    result.language = "en";
  }

  // 2) Vérifier les patterns négatifs
  for (const neg of NEGATIVE_PATTERNS) {
    if (neg.test(text)) {
      result.relevanceScore = 0;
      result.isWebRequest = false;
      return result;
    }
  }

  // 3) Score de pertinence
  let score = 0;
  const allPatterns = [
    ...WEB_REQUEST_PATTERNS_FR,
    ...WEB_REQUEST_PATTERNS_EN,
    ...WEB_REQUEST_PATTERNS_HE,
  ];

  for (const pattern of allPatterns) {
    if (pattern.test(text)) {
      score += 25;
      result.matchedPatterns.push(pattern.source.substring(0, 50));
      if (score >= 75) break;
    }
  }

  // Bonus : mots clés additionnels
  const bonusKeywords = [
    { re: /devis/i, pts: 10 },
    { re: /urgent/i, pts: 8 },
    { re: /budget/i, pts: 8 },
    { re: /(?:contacter|contactez|appelez)/i, pts: 5 },
    { re: /(?:société|entreprise|commerce|startup)/i, pts: 5 },
    { re: /(?:pas de site|sans site|aucune présence|no website)/i, pts: 15 },
  ];
  for (const kw of bonusKeywords) {
    if (kw.re.test(text)) score = Math.min(100, score + kw.pts);
  }

  result.relevanceScore = Math.min(100, score);
  result.isWebRequest = score >= 25;

  // 4) Détecter le secteur
  for (const [domain, patterns] of Object.entries(DOMAIN_PATTERNS)) {
    if (domain === "other") continue;
    for (const p of patterns) {
      if (p.test(text)) {
        result.domain = domain;
        break;
      }
    }
    if (result.domain !== "other") break;
  }

  // 5) Détecter la localisation
  for (const locPat of LOCATION_PATTERNS) {
    const match = text.match(locPat);
    if (match?.[1]) {
      result.location = match[1].trim();
      break;
    }
  }

  // 6) Type de demande
  if (/(?:e-commerce|boutique\s+en\s+ligne|online\s+store|חנות\s+אונליין)/i.test(text)) {
    result.requestType = "ecommerce";
  } else if (/(?:refonte|redesign|remettre\s+à\s+jour|moderniser)/i.test(text)) {
    result.requestType = "refonte";
  } else if (/(?:application|appli\s+mobile|app\s+mobile)/i.test(text)) {
    result.requestType = "application";
  } else if (result.isWebRequest) {
    result.requestType = "vitrine";
  }

  return result;
}

/** Filtre une liste de résultats pour ne garder que les vraies demandes web */
export function filterWebRequests<T extends { title: string; snippet: string }>(
  results: T[],
  minScore: number = 25
): Array<T & { analysis: AnalysisResult }> {
  return results
    .map(r => ({ ...r, analysis: analyzeContent(r.title, r.snippet) }))
    .filter(r => r.analysis.isWebRequest && r.analysis.relevanceScore >= minScore)
    .sort((a, b) => b.analysis.relevanceScore - a.analysis.relevanceScore);
}
