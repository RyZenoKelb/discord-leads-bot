/**
 * config.ts — Configuration centralisée du bot.
 * Lit les variables d'environnement depuis .env
 * Si une variable obligatoire manque, le bot refuse de démarrer.
 */

import "dotenv/config";

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    console.error(`❌ Variable d'environnement manquante : ${name}`);
    console.error(`   Copie .env.example vers .env et remplis les valeurs.`);
    process.exit(1);
  }
  return value;
}

export const config = {
  /** Token du bot Discord */
  discordToken: required("DISCORD_BOT_TOKEN"),

  /** Clé API Google Maps */
  googleApiKey: required("GOOGLE_MAPS_API_KEY"),

  /** ID du channel où poster les leads */
  leadsChannelId: required("LEADS_CHANNEL_ID"),

  /** ID du channel "à appeler" */
  callChannelId: process.env.CALL_CHANNEL_ID || "",

  /** ID Discord de l'associé à mentionner */
  associateUserId: process.env.ASSOCIATE_USER_ID || "",

  /** ID du salon Call Queue (file d'appels priorisée) */
  callQueueChannelId: process.env.CALL_QUEUE_CHANNEL_ID || "",

  /** ID du salon Stats */
  statsChannelId: process.env.STATS_CHANNEL_ID || "",

  /** ID du salon Follow-up (relances) */
  followupChannelId: process.env.FOLLOWUP_CHANNEL_ID || "",

  /** Intervalle entre les posts de stats (minutes) */
  statsPostIntervalMin: parseInt(process.env.STATS_POST_INTERVAL_MIN || "10", 10),

  /** Intervalle entre les checks de relances (minutes) */
  followupCheckIntervalMin: parseInt(process.env.FOLLOWUP_CHECK_INTERVAL_MIN || "60", 10),

  /** URL Postgres (optionnel — sinon SQLite) */
  databaseUrl: process.env.DATABASE_URL || "",

  /** Nombre de requêtes Google par seconde */
  rateLimitPerSec: parseInt(process.env.RATE_LIMIT_PER_SEC || "5", 10),

  // ─── SMTP Email Outreach ───────────────────────
  /** SMTP host */
  smtpHost: process.env.SMTP_HOST || "",
  /** SMTP port */
  smtpPort: parseInt(process.env.SMTP_PORT || "465", 10),
  /** SMTP user */
  smtpUser: process.env.SMTP_USER || "",
  /** SMTP password */
  smtpPass: process.env.SMTP_PASS || "",
  /** SMTP secure (TLS) */
  smtpSecure: (process.env.SMTP_SECURE || "true") === "true",
  /** From email address */
  fromEmail: process.env.FROM_EMAIL || "",
  /** From display name */
  fromName: process.env.FROM_NAME || "Orlan",
  /** Email rate limit per minute */
  emailRateLimitPerMin: parseInt(process.env.EMAIL_RATE_LIMIT_PER_MIN || "10", 10),

  // ─── Daily Stats ──────────────────────────────
  /** Heure du post quotidien (HH:MM, heure Israël) */
  dailyStatsTime: process.env.DAILY_STATS_TIME || "21:00",
} as const;

/** Domaines prédéfinis : alias → liste de queries Google */
export const DOMAIN_ALIASES: Record<string, string[]> = {
  // ─── Domaines généraux (FR) ────────────────────
  restaurant: [
    "restaurant",
    "brasserie",
    "bistro",
    "traiteur",
    "pizzeria",
    "crêperie",
    "kebab",
    "sushi",
  ],
  beauty: [
    "coiffeur",
    "coiffeuse",
    "salon de coiffure",
    "institut de beauté",
    "barbier",
    "esthéticienne",
    "onglerie",
    "manucure",
  ],
  bakery: [
    "boulangerie",
    "pâtisserie",
    "boulanger",
  ],
  auto: [
    "garage automobile",
    "carrosserie",
    "mécanicien",
    "contrôle technique",
    "pneu",
  ],
  medical: [
    "médecin",
    "dentiste",
    "pharmacie",
    "kiné",
    "ostéopathe",
    "opticien",
    "infirmier",
  ],
  immo: [
    "agence immobilière",
    "agent immobilier",
    "notaire",
  ],
  artisan: [
    "plombier",
    "électricien",
    "serrurier",
    "peintre bâtiment",
    "maçon",
    "couvreur",
    "menuisier",
  ],

  // ─── Domaines Israël 🇮🇱 ────────────────────────
  il_food: [
    "מסעדה",           // restaurant
    "מאפייה",          // boulangerie
    "קונדיטוריה",       // pâtisserie
    "פיצרייה",         // pizzeria
    "בית קפה",         // café
    "קייטרינג",        // traiteur
    "סושי",            // sushi
    "שווארמה",         // shawarma
    "בשרים",           // grillade
    "restaurant",
  ],
  il_beauty: [
    "מספרה",           // coiffeur
    "מכון יופי",       // institut de beauté
    "ברבר",            // barbier
    "קוסמטיקאית",      // esthéticienne
    "מניקור פדיקור",    // manucure pédicure
    "ציפורניים",       // ongles
    "beauty salon",
    "hair salon",
    "barber",
  ],
  il_services: [
    "מוסך",            // garage
    "שרברב",           // plombier
    "חשמלאי",          // électricien
    "מסגר",            // serrurier
    "צבעי",            // peintre
    "מיזוג אוויר",     // climatisation
    "נקיון",           // nettoyage
    "הובלות",          // déménagement
    "שיפוצים",         // rénovation
  ],

  // ─── 🇫🇷🇮🇱 Francophones en Israël ─────────────
  il_french: [
    "boulangerie",
    "pâtisserie",
    "pâtisserie française",
    "restaurant français",
    "traiteur français",
    "coiffeur français",
    "salon de coiffure",
    "institut de beauté",
    "crêperie",
    "fromagerie",
    "charcuterie",
    "brasserie",
    "bistro",
    "french bakery",
    "french restaurant",
  ],
};

/** Mots-clés heuristiques pour tagger "business français" (y compris francophones en Israël) */
export const FRENCH_INDICATORS = [
  // Métiers / enseignes typiquement françaises
  "boulangerie",
  "pâtisserie",
  "traiteur",
  "brasserie",
  "bistro",
  "bistrot",
  "crêperie",
  "fromagerie",
  "charcuterie",
  "institut de beauté",
  "coiffure",
  "salon de coiffure",
  "tabac",
  "pressing",
  "fleuriste",
  "cave à vin",
  "épicerie",
  // Mots souvent dans les noms de commerces FR en Israël
  "chez ",
  "maison ",
  "le petit",
  "la petite",
  "au bon",
  "la bonne",
  "café de",
  "français",
  "française",
  "french",
  "de france",
  "de paris",
  "parisien",
  "lyonnais",
  "marseillais",
  "provençal",
];

/** Types Google Places associés aux businesses françaises */
export const FRENCH_PLACE_TYPES = [
  "bakery",
  "french_restaurant",
  "cafe",
  "hair_care",
  "beauty_salon",
  "florist",
];

/** Villes israéliennes à forte communauté francophone — pour référence */
export const FRANCO_IL_CITIES = [
  "Netanya",
  "Ashdod",
  "Jerusalem",
  "Tel Aviv",
  "Raanana",
  "Herzliya",
  "Bat Yam",
  "Haifa",
  "Beer Sheva",
  "Ramat Gan",
  "Petah Tikva",
  "Modiin",
  "Ashkelon",
];
