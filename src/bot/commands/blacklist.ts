/**
 * blacklist.ts — Commande /blacklist
 * Blackliste un lead (par place_id), un domaine de site web ou un nom
 * pour l'ignorer définitivement dans les futures scans.
 *
 * Fonctions :
 *  - /blacklist add   → Ignore un lead et ajoute son domaine/nom en liste noire
 *  - /blacklist list  → Affiche les entrées blacklistées
 *  - /blacklist remove→ Retire une entrée de la blacklist
 */

import {
  ChatInputCommandInteraction,
  SlashCommandBuilder,
  EmbedBuilder,
  MessageFlags,
  PermissionFlagsBits,
} from "discord.js";
import { getDb } from "../../db/schema";
import { logger } from "../../utils/logger";

export const data = new SlashCommandBuilder()
  .setName("blacklist")
  .setDescription("🚫 Gère la blacklist (leads / domaines à ignorer dans les scans)")
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
  .addSubcommand((sub) =>
    sub
      .setName("add")
      .setDescription("➕ Ajoute un lead ou un domaine à la blacklist")
      .addStringOption((opt) =>
        opt
          .setName("type")
          .setDescription("Que blacklister ?")
          .setRequired(true)
          .addChoices(
            { name: "📋 Lead (place_id ou nom exact)", value: "lead"   },
            { name: "🌐 Domaine de site web",          value: "domain" },
            { name: "📝 Nom / mot-clé",                value: "name"   },
          )
      )
      .addStringOption((opt) =>
        opt
          .setName("value")
          .setDescription("Valeur à blacklister (place_id, exemple.com, ou mot-clé)")
          .setRequired(true)
      )
      .addStringOption((opt) =>
        opt
          .setName("reason")
          .setDescription("Raison (optionnel)")
      )
  )
  .addSubcommand((sub) =>
    sub
      .setName("list")
      .setDescription("📋 Affiche la liste noire actuelle")
  )
  .addSubcommand((sub) =>
    sub
      .setName("remove")
      .setDescription("🗑️ Retire une entrée de la blacklist")
      .addIntegerOption((opt) =>
        opt
          .setName("id")
          .setDescription("ID de l'entrée (visible dans /blacklist list)")
          .setRequired(true)
      )
  ) as SlashCommandBuilder;

// ─── Initialiser la table blacklist si besoin ───────

function ensureBlacklistTable(): void {
  const db = getDb();
  db.exec(`
    CREATE TABLE IF NOT EXISTS blacklist (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      guild_id   TEXT    NOT NULL,
      type       TEXT    NOT NULL,
      value      TEXT    NOT NULL,
      reason     TEXT,
      added_by   TEXT,
      created_at TEXT    DEFAULT (datetime('now')),
      UNIQUE(guild_id, type, value)
    );
  `);
}

interface BlacklistRow {
  id: number;
  guild_id: string;
  type: string;
  value: string;
  reason: string | null;
  added_by: string | null;
  created_at: string;
}

const TYPE_EMOJI: Record<string, string> = {
  lead:   "📋",
  domain: "🌐",
  name:   "📝",
};

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const guildId = interaction.guildId;
  if (!guildId) {
    await interaction.reply({ content: "❌ Commande serveur uniquement.", flags: MessageFlags.Ephemeral });
    return;
  }

  const sub = interaction.options.getSubcommand();
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  try {
    ensureBlacklistTable();
    const db = getDb();

    // ── ADD ───────────────────────────────────────
    if (sub === "add") {
      const type   = interaction.options.getString("type", true);
      const value  = interaction.options.getString("value", true).trim().toLowerCase();
      const reason = interaction.options.getString("reason");

      // Si c'est un lead, on l'ignore aussi en BDD
      if (type === "lead") {
        // Cherche par place_id ou nom exact
        const lead = db.prepare(
          "SELECT place_id, name FROM leads WHERE guild_id = ? AND (place_id = ? OR LOWER(name) = ?)"
        ).get(guildId, value, value) as { place_id: string; name: string } | undefined;

        if (lead) {
          db.prepare(
            "UPDATE leads SET status = 'IGNORE', updated_at = datetime('now') WHERE place_id = ?"
          ).run(lead.place_id);
        }
      }

      try {
        db.prepare(
          "INSERT INTO blacklist (guild_id, type, value, reason, added_by) VALUES (?, ?, ?, ?, ?)"
        ).run(guildId, type, value, reason ?? null, interaction.user.tag);
      } catch {
        await interaction.editReply(`⚠️ **\`${value}\`** est déjà dans la blacklist.`);
        return;
      }

      const embed = new EmbedBuilder()
        .setTitle(`🚫 Blacklist — Ajouté`)
        .setColor(0xff4444)
        .addFields(
          { name: "Type",   value: `${TYPE_EMOJI[type]} ${type}`, inline: true },
          { name: "Valeur", value: `\`${value}\``,                inline: true },
          { name: "Raison", value: reason ?? "—",                 inline: true },
        )
        .setFooter({ text: `Ajouté par ${interaction.user.tag}` })
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });
      logger.info(`🚫 Blacklist ADD [${type}] "${value}" par ${interaction.user.tag}`);

    // ── LIST ──────────────────────────────────────
    } else if (sub === "list") {
      const rows = db.prepare(
        "SELECT * FROM blacklist WHERE guild_id = ? ORDER BY created_at DESC LIMIT 25"
      ).all(guildId) as BlacklistRow[];

      if (rows.length === 0) {
        await interaction.editReply("📋 La blacklist est vide.");
        return;
      }

      const lines = rows.map((r) => {
        const emoji  = TYPE_EMOJI[r.type] ?? "❓";
        const reason = r.reason ? ` — _${r.reason}_` : "";
        const date   = r.created_at.slice(0, 10);
        return `**#${r.id}** ${emoji} \`${r.value}\` (${r.type})${reason} · ${date}`;
      });

      const embed = new EmbedBuilder()
        .setTitle("🚫 Blacklist")
        .setColor(0xff8800)
        .setDescription(lines.join("\n"))
        .setFooter({ text: `${rows.length} entrée(s) · /blacklist remove id:N pour retirer` })
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });

    // ── REMOVE ────────────────────────────────────
    } else if (sub === "remove") {
      const id = interaction.options.getInteger("id", true);

      const row = db.prepare(
        "SELECT * FROM blacklist WHERE id = ? AND guild_id = ?"
      ).get(id, guildId) as BlacklistRow | undefined;

      if (!row) {
        await interaction.editReply(`❌ Entrée #${id} introuvable.`);
        return;
      }

      db.prepare("DELETE FROM blacklist WHERE id = ?").run(id);

      await interaction.editReply(
        `✅ Entrée **#${id}** (\`${row.value}\`) retirée de la blacklist.`
      );
      logger.info(`🗑️ Blacklist REMOVE #${id} "${row.value}" par ${interaction.user.tag}`);
    }

  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    logger.error(`❌ Erreur /blacklist: ${msg}`);
    await interaction.editReply(`❌ Erreur: ${msg}`);
  }
}

/** Vérifie si une valeur est blacklistée (pour l'utiliser dans les scans) */
export function isBlacklisted(guildId: string, type: string, value: string): boolean {
  try {
    ensureBlacklistTable();
    const db = getDb();
    const row = db.prepare(
      "SELECT 1 FROM blacklist WHERE guild_id = ? AND type = ? AND value = ? LIMIT 1"
    ).get(guildId, type, value.toLowerCase());
    return !!row;
  } catch {
    return false;
  }
}
