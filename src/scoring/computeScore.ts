/**
 * computeScore.ts — Lead Scoring (0–100).
 *
 * Calcule un score de priorité pour chaque lead.
 * Plus le score est élevé, plus le lead est intéressant à contacter.
 *
 * Barème :
 *   +35  no_website (pas de site du tout)
 *   +20  social_only (site = Instagram/Facebook uniquement) — non cumulable avec +35
 *   +10  french_business (heuristique FR)
 *   +15  rating >= 4.6  |  +10 si >= 4.3  |  +5 si >= 4.0
 *   +15  reviews >= 200 |  +10 si >= 50   |  +5 si >= 10
 *   +10  téléphone présent
 *   -20  status IGNORE
 *   Clamp 0..100
 */

export interface ScoreInput {
  no_website: boolean;
  social_only: boolean;
  french_business: boolean;
  rating?: number | null;
  reviews?: number | null;
  phone?: string | null;
  status?: string;
}

export function computeLeadScore(input: ScoreInput): number {
  let score = 0;

  // ─── Website bonus (non cumulable) ─────────────
  if (input.no_website) {
    score += 35;
  } else if (input.social_only) {
    score += 20;
  }

  // ─── French business ───────────────────────────
  if (input.french_business) {
    score += 10;
  }

  // ─── Rating bonus ──────────────────────────────
  const rating = input.rating ?? 0;
  if (rating >= 4.6) {
    score += 15;
  } else if (rating >= 4.3) {
    score += 10;
  } else if (rating >= 4.0) {
    score += 5;
  }

  // ─── Reviews bonus ─────────────────────────────
  const reviews = input.reviews ?? 0;
  if (reviews >= 200) {
    score += 15;
  } else if (reviews >= 50) {
    score += 10;
  } else if (reviews >= 10) {
    score += 5;
  }

  // ─── Téléphone présent ─────────────────────────
  if (input.phone && input.phone.trim().length > 0) {
    score += 10;
  }

  // ─── Pénalité IGNORE ──────────────────────────
  if (input.status === "IGNORE") {
    score -= 20;
  }

  // ─── Clamp 0..100 ─────────────────────────────
  return Math.max(0, Math.min(100, score));
}

/** Génère la liste de tags JSON à partir des flags du lead */
export function buildLeadTags(input: {
  no_website: boolean;
  social_only: boolean;
  french_business: boolean;
}): string {
  const tags: string[] = [];
  if (input.no_website) tags.push("nosite");
  if (input.social_only) tags.push("social_only");
  if (input.french_business) tags.push("fr_tag");
  return JSON.stringify(tags);
}
