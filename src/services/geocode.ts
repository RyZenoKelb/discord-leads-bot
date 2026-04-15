/**
 * geocode.ts — Convertit un nom de ville en coordonnées lat/lng
 * via l'API Geocoding de Google.
 */

import { config } from "../config";
import { acquireToken, backoff } from "../utils/rateLimiter";
import { logger } from "../utils/logger";

export interface LatLng {
  lat: number;
  lng: number;
}

/**
 * Géocode une ville en lat/lng.
 * @param city - Nom de la ville (ex: "Paris", "Tel Aviv")
 * @param country - Code pays ISO optionnel pour biaiser (ex: "FR", "IL")
 */
export async function geocodeCity(city: string, country?: string): Promise<LatLng> {
  const params = new URLSearchParams({
    address: city,
    key: config.googleApiKey,
    language: "fr",
  });
  if (country) {
    params.set("components", `country:${country}`);
  }

  for (let attempt = 0; attempt < 5; attempt++) {
    await acquireToken();

    const url = `https://maps.googleapis.com/maps/api/geocode/json?${params}`;
    logger.info(`🌍 Geocoding: "${city}"${country ? ` (pays: ${country})` : ""}`);

    const res = await fetch(url);

    if (res.status === 429) {
      await backoff(attempt);
      continue;
    }

    const data = (await res.json()) as any;

    if (data.status === "OVER_QUERY_LIMIT") {
      await backoff(attempt);
      continue;
    }

    if (data.status !== "OK" || !data.results?.length) {
      throw new Error(`Geocoding échoué pour "${city}": ${data.status} — ${data.error_message || "Aucun résultat"}`);
    }

    const loc = data.results[0].geometry.location;
    logger.info(`📍 "${city}" → ${loc.lat}, ${loc.lng}`);
    return { lat: loc.lat, lng: loc.lng };
  }

  throw new Error(`Geocoding: trop de tentatives pour "${city}"`);
}

/**
 * Parse une chaîne "lat,lng" en coordonnées.
 * Retourne null si le format est invalide.
 */
export function parseLatLng(input: string): LatLng | null {
  const parts = input.split(",").map((s) => s.trim());
  if (parts.length !== 2) return null;
  const lat = parseFloat(parts[0]);
  const lng = parseFloat(parts[1]);
  if (isNaN(lat) || isNaN(lng)) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  return { lat, lng };
}
