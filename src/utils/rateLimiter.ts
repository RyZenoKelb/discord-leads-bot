/**
 * rateLimiter.ts — Contrôle le débit de requêtes vers Google Places API.
 * Empêche de dépasser le quota (default 5 req/sec).
 * Implémente un backoff exponentiel sur erreur 429.
 */

import { config } from "../config";
import { logger } from "./logger";

const MAX_PER_SEC = config.rateLimitPerSec;
const tokens: { available: number; lastRefill: number } = {
  available: MAX_PER_SEC,
  lastRefill: Date.now(),
};

function refillTokens(): void {
  const now = Date.now();
  const elapsed = now - tokens.lastRefill;
  if (elapsed >= 1000) {
    tokens.available = MAX_PER_SEC;
    tokens.lastRefill = now;
  }
}

/** Attend qu'un token soit disponible avant de faire une requête */
export async function acquireToken(): Promise<void> {
  // eslint-disable-next-line no-constant-condition
  while (true) {
    refillTokens();
    if (tokens.available > 0) {
      tokens.available--;
      return;
    }
    // Attend la prochaine seconde
    const waitMs = 1000 - (Date.now() - tokens.lastRefill) + 10;
    await sleep(waitMs);
  }
}

/** Backoff exponentiel — à utiliser quand Google renvoie 429 */
export async function backoff(attempt: number): Promise<void> {
  const delayMs = Math.min(1000 * 2 ** attempt, 30_000);
  logger.warn(`⏳ Rate limit atteint, attente ${delayMs}ms (tentative ${attempt + 1})`);
  await sleep(delayMs);
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
