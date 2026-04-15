/**
 * googlePlaces.ts — Client Google Places API.
 * Nearby Search, Text Search, Place Details, pagination.
 */

import { config, FRENCH_INDICATORS, FRENCH_PLACE_TYPES } from "../config";
import { acquireToken, backoff, sleep } from "../utils/rateLimiter";
import { logger } from "../utils/logger";
import { LatLng } from "./geocode";

// ─── Types ─────────────────────────────────────────

export interface PlaceBasic {
  place_id: string;
  name: string;
  vicinity?: string;
  geometry?: { location: LatLng };
  types?: string[];
  rating?: number;
  user_ratings_total?: number;
  business_status?: string;
}

export interface PlaceDetails {
  place_id: string;
  name: string;
  formatted_address?: string;
  formatted_phone_number?: string;
  international_phone_number?: string;
  website?: string;
  url?: string; // Google Maps URL
  rating?: number;
  user_ratings_total?: number;
  types?: string[];
}

export interface ProcessedLead {
  place_id: string;
  name: string;
  address: string;
  phone: string;
  website: string;
  rating: number;
  reviews: number;
  types: string;
  no_website: boolean;
  social_only: boolean;
  french_business: boolean;
  google_maps_url: string;
}

// ─── API Calls ─────────────────────────────────────

const BASE_URL = "https://maps.googleapis.com/maps/api/place";

async function apiCall(url: string, maxRetries = 4): Promise<any> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    await acquireToken();
    const res = await fetch(url);

    if (res.status === 429) {
      await backoff(attempt);
      continue;
    }

    const data = await res.json();

    if (data.status === "OVER_QUERY_LIMIT") {
      await backoff(attempt);
      continue;
    }

    return data;
  }
  throw new Error("API Google Places: trop de tentatives échouées.");
}

/**
 * Nearby Search — cherche des lieux autour d'un point.
 * Gère la pagination via next_page_token.
 */
export async function nearbySearch(
  location: LatLng,
  query: string,
  radius: number,
  language: string = "fr",
  limit: number = 60
): Promise<PlaceBasic[]> {
  const results: PlaceBasic[] = [];
  let pageToken: string | undefined;
  let pages = 0;

  do {
    const params = new URLSearchParams({
      location: `${location.lat},${location.lng}`,
      radius: String(radius),
      keyword: query,
      language,
      key: config.googleApiKey,
    });
    if (pageToken) {
      params.set("pagetoken", pageToken);
    }

    const url = `${BASE_URL}/nearbysearch/json?${params}`;
    logger.info(`🔍 Nearby Search page ${pages + 1}: "${query}" autour de (${location.lat.toFixed(4)}, ${location.lng.toFixed(4)})`);

    const data = await apiCall(url);

    if (data.status === "ZERO_RESULTS") {
      logger.info("   → Aucun résultat.");
      break;
    }

    if (data.status !== "OK" && data.status !== "ZERO_RESULTS") {
      logger.error(`   → Erreur API: ${data.status} — ${data.error_message || ""}`);
      break;
    }

    if (data.results) {
      results.push(...data.results);
    }

    pageToken = data.next_page_token;
    pages++;

    if (results.length >= limit) break;

    // Google exige un délai avant d'utiliser le next_page_token
    if (pageToken) {
      await sleep(2200);
    }
  } while (pageToken && pages < 3);

  return results.slice(0, limit);
}

/**
 * Text Search — cherche des lieux par texte libre.
 */
export async function textSearch(
  query: string,
  location: LatLng,
  radius: number,
  language: string = "fr",
  limit: number = 60
): Promise<PlaceBasic[]> {
  const results: PlaceBasic[] = [];
  let pageToken: string | undefined;
  let pages = 0;

  do {
    const params = new URLSearchParams({
      query,
      location: `${location.lat},${location.lng}`,
      radius: String(radius),
      language,
      key: config.googleApiKey,
    });
    if (pageToken) {
      params.set("pagetoken", pageToken);
    }

    const url = `${BASE_URL}/textsearch/json?${params}`;
    logger.info(`🔍 Text Search page ${pages + 1}: "${query}"`);

    const data = await apiCall(url);

    if (data.status === "ZERO_RESULTS") {
      logger.info("   → Aucun résultat.");
      break;
    }

    if (data.status !== "OK" && data.status !== "ZERO_RESULTS") {
      logger.error(`   → Erreur API: ${data.status} — ${data.error_message || ""}`);
      break;
    }

    if (data.results) {
      results.push(...data.results);
    }

    pageToken = data.next_page_token;
    pages++;

    if (results.length >= limit) break;

    if (pageToken) {
      await sleep(2200);
    }
  } while (pageToken && pages < 3);

  return results.slice(0, limit);
}

/**
 * Place Details — récupère les informations détaillées d'un lieu.
 */
export async function getPlaceDetails(placeId: string, language: string = "fr"): Promise<PlaceDetails | null> {
  const params = new URLSearchParams({
    place_id: placeId,
    fields: "place_id,name,formatted_address,formatted_phone_number,international_phone_number,website,url,rating,user_ratings_total,types",
    language,
    key: config.googleApiKey,
  });

  const url = `${BASE_URL}/details/json?${params}`;
  const data = await apiCall(url);

  if (data.status !== "OK") {
    logger.warn(`⚠️  Détails indisponibles pour ${placeId}: ${data.status}`);
    return null;
  }

  return data.result as PlaceDetails;
}

// ─── Processing ────────────────────────────────────

/**
 * Détermine si un business est "sans site" ou "social only".
 */
function analyzeWebsite(website?: string): { no_website: boolean; social_only: boolean } {
  if (!website) {
    return { no_website: true, social_only: false };
  }
  const lower = website.toLowerCase();
  const isSocial =
    lower.includes("facebook.com") ||
    lower.includes("instagram.com") ||
    lower.includes("fb.com");
  return { no_website: false, social_only: isSocial };
}

/**
 * Heuristique: est-ce un "business français" ?
 */
function isFrenchBusiness(name: string, types: string[], scanQuery: string): boolean {
  const lower = name.toLowerCase();

  // (a) Nom contient un indicateur français
  if (FRENCH_INDICATORS.some((ind) => lower.includes(ind))) return true;

  // (b) Types Google correspondent
  if (types.some((t) => FRENCH_PLACE_TYPES.includes(t))) return true;

  // (c) La query de scan contient des mots FR
  const queryLower = scanQuery.toLowerCase();
  if (FRENCH_INDICATORS.some((ind) => queryLower.includes(ind))) return true;

  return false;
}

/**
 * Transforme un PlaceDetails en ProcessedLead.
 */
export function processPlace(details: PlaceDetails, scanQuery: string): ProcessedLead {
  const { no_website, social_only } = analyzeWebsite(details.website);
  const types = details.types || [];
  const french = isFrenchBusiness(details.name, types, scanQuery);

  return {
    place_id: details.place_id,
    name: details.name,
    address: details.formatted_address || "",
    phone: details.international_phone_number || details.formatted_phone_number || "",
    website: details.website || "",
    rating: details.rating || 0,
    reviews: details.user_ratings_total || 0,
    types: types.join(", "),
    no_website,
    social_only,
    french_business: french,
    google_maps_url: details.url || `https://www.google.com/maps/place/?q=place_id:${details.place_id}`,
  };
}

/**
 * Applique les filtres utilisateur sur un lead.
 * Retourne true si le lead passe les filtres.
 */
export function passesFilters(
  lead: ProcessedLead,
  options: {
    nosite?: boolean;
    min_rating?: number;
    min_reviews?: number;
  }
): boolean {
  // Filtre nosite: ne garder que ceux sans website ou social-only
  if (options.nosite && !lead.no_website && !lead.social_only) {
    return false;
  }

  // Filtre rating minimum
  if (options.min_rating && lead.rating < options.min_rating) {
    return false;
  }

  // Filtre reviews minimum
  if (options.min_reviews && lead.reviews < options.min_reviews) {
    return false;
  }

  return true;
}
