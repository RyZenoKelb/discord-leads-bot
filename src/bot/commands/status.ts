/**
 * status.ts — Commande /status
 * Affiche les scans en cours et les statistiques récentes.
 */

import {
  ChatInputCommandInteraction,
  SlashCommandBuilder,
  EmbedBuilder,
  MessageFlags,
} from "discord.js";
import { getRunningJobs, getRecentJobs } from "../../db/queries";

export const data = new SlashCommandBuilder()
  .setName("status")
  .setDescription("📊 Affiche les scans en cours et l'historique récent");

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const guildId = interaction.guildId;
  if (!guildId) {
    await interaction.reply({ content: "❌ Commande serveur uniquement.", flags: MessageFlags.Ephemeral });
    return;
  }

  const running = getRunningJobs(guildId);
  const recent = getRecentJobs(guildId, 10);

  const embed = new EmbedBuilder().setColor(0x9b59b6).setTitle("📊 Status des scans");

  // Jobs en cours
  if (running.length > 0) {
    const runningStr = running
      .map(
        (j) =>
          `🔄 **${j.query || "?"}** @ ${j.city || "?"} — ${j.total_kept} retenus / ${j.total_found} trouvés (${j.total_nosite} sans site)`
      )
      .join("\n");
    embed.addFields({ name: "⏳ En cours", value: runningStr });
  } else {
    embed.addFields({ name: "⏳ En cours", value: "Aucun scan en cours." });
  }

  // Historique récent
  if (recent.length > 0) {
    const historyStr = recent
      .map((j) => {
        const icon = j.status === "DONE" ? "✅" : j.status === "ERROR" ? "❌" : "🔄";
        return `${icon} **${j.query || "?"}** @ ${j.city || "?"} — ${j.total_kept}/${j.total_found} (${j.started_at || ""})`;
      })
      .join("\n");
    embed.addFields({ name: "📜 Historique récent", value: historyStr });
  }

  embed.setTimestamp();
  await interaction.reply({ embeds: [embed] });
}
