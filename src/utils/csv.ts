/**
 * csv.ts — Génère un fichier CSV à partir des leads en base.
 */

import { Lead } from "../db/queries";

const CSV_HEADERS = [
  "place_id",
  "name",
  "address",
  "phone",
  "website",
  "rating",
  "reviews",
  "types",
  "no_website",
  "social_only",
  "french_business",
  "status",
  "lead_score",
  "followup_at",
  "last_contacted_at",
  "google_maps_url",
  "scanned_at",
];

function escapeCSV(value: string): string {
  if (value.includes(",") || value.includes('"') || value.includes("\n")) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export function leadsToCSV(leads: Lead[]): string {
  const lines: string[] = [CSV_HEADERS.join(",")];

  for (const lead of leads) {
    const row = [
      lead.place_id,
      lead.name,
      lead.address || "",
      lead.phone || "",
      lead.website || "",
      String(lead.rating ?? ""),
      String(lead.reviews ?? ""),
      lead.types || "",
      lead.no_website ? "OUI" : "NON",
      lead.social_only ? "OUI" : "NON",
      lead.french_business ? "OUI" : "NON",
      lead.status || "NEW",
      String(lead.lead_score ?? 0),
      lead.followup_at || "",
      lead.last_contacted_at || "",
      lead.google_maps_url || "",
      lead.scanned_at || "",
    ].map(escapeCSV);
    lines.push(row.join(","));
  }

  return lines.join("\n");
}
