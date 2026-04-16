/**
 * index.ts — Point d'entrée du bot Discord.
 * Initialise le client Discord, la DB, et écoute les interactions.
 */

import {
  Client,
  GatewayIntentBits,
  Events,
  ChatInputCommandInteraction,
  ButtonInteraction,
  ModalSubmitInteraction,
  Interaction,
  MessageFlags,
  ActivityType,
} from "discord.js";
import { config } from "./config";
import { logger } from "./utils/logger";
import { getDb } from "./db/schema";
import { deployCommands } from "./deploy-commands";
import { getGlobalLeadCounts } from "./db/queries";

// Commandes
import * as scanCommand from "./bot/commands/scan";
import * as scanGridCommand from "./bot/commands/scan_grid";
import * as filtersCommand from "./bot/commands/filters";
import * as exportCommand from "./bot/commands/export";
import * as statusCommand from "./bot/commands/status";
import * as helpCommand from "./bot/commands/help";
import * as guideCommand from "./bot/commands/guide";
import * as updateCommand from "./bot/commands/update";
import * as callQueueCommand from "./bot/commands/callQueue";
import * as statsNowCommand from "./bot/commands/statsNow";
import * as enrichEmailCommand from "./bot/commands/enrichEmail";
import * as leadNotesCommand from "./bot/commands/leadNotes";
import * as dailyStatsCommand from "./bot/commands/dailyStats";
import * as resetDbCommand from "./bot/commands/resetDb";
import * as clearCommand from "./bot/commands/clear";
import * as pipelineCommand from "./bot/commands/pipeline";
import * as leadSearchCommand from "./bot/commands/leadSearch";
import * as blacklistCommand from "./bot/commands/blacklist";
import * as recapCommand from "./bot/commands/recap";
import * as huntCommand from "./bot/commands/hunt";

// Interactions
import { handleButton } from "./bot/interactions/buttons";
import { handleModal } from "./bot/interactions/modals";

// Jobs
import { startStatsPoster } from "./jobs/statsPoster";
import { startFollowupChecker } from "./jobs/followupChecker";
import { startDailyStatsPoster } from "./jobs/dailyStatsPoster";

// ─── Client Discord ────────────────────────────────

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
  ],
});

// ─── Commandes map ─────────────────────────────────

const commandHandlers: Record<string, (i: ChatInputCommandInteraction) => Promise<void>> = {
  scan: scanCommand.execute,
  scan_grid: scanGridCommand.execute,
  filters_set: filtersCommand.filtersSetExecute,
  filters_show: filtersCommand.filtersShowExecute,
  export: exportCommand.execute,
  status: statusCommand.execute,
  help: helpCommand.execute,
  guide: guideCommand.execute,
  update: updateCommand.execute,
  call_queue: callQueueCommand.callQueueExecute,
  call_next: callQueueCommand.callNextExecute,
  stats_now: statsNowCommand.execute,
  enrich_email: enrichEmailCommand.execute,
  lead_notes: leadNotesCommand.execute,
  daily_stats: dailyStatsCommand.execute,
  reset_db:    resetDbCommand.execute,
  clear:       clearCommand.execute,
  pipeline:    pipelineCommand.execute,
  lead_search: leadSearchCommand.execute,
  blacklist:   blacklistCommand.execute,
  recap:       recapCommand.execute,
  hunt:        huntCommand.execute,
};

// ─── Events ────────────────────────────────────────

client.once(Events.ClientReady, async (readyClient) => {
  logger.info(`🤖 Bot connecté en tant que ${readyClient.user.tag}`);
  logger.info(`📡 Présent sur ${readyClient.guilds.cache.size} serveur(s)`);

  // Enregistrer les commandes slash
  try {
    await deployCommands(readyClient.user.id);
  } catch (err) {
    logger.error(`Erreur deploy commandes: ${err}`);
  }

  // Démarrer les jobs planifiés
  startStatsPoster(client);
  startFollowupChecker(client);
  startDailyStatsPoster(client);

  // ─── Statut rotatif du bot ─────────────────────
  startRotatingStatus(client);
});

client.on(Events.InteractionCreate, async (interaction: Interaction) => {
  try {
    // Commandes slash
    if (interaction.isChatInputCommand()) {
      const handler = commandHandlers[interaction.commandName];
      if (handler) {
        logger.info(
          `⚡ Commande /${interaction.commandName} par ${interaction.user.tag} dans ${interaction.guild?.name || "DM"}`
        );
        await handler(interaction);
      } else {
        await interaction.reply({ content: "❌ Commande inconnue.", flags: MessageFlags.Ephemeral });
      }
      return;
    }

    // Boutons
    if (interaction.isButton()) {
      await handleButton(interaction as ButtonInteraction);
      return;
    }

    // Modales
    if (interaction.isModalSubmit()) {
      await handleModal(interaction as ModalSubmitInteraction);
      return;
    }
  } catch (error: any) {
    logger.error(`❌ Erreur interaction: ${error.message}\n${error.stack}`);

    // Essayer de répondre si possible
    try {
      if (interaction.isRepliable()) {
        if (interaction.replied || interaction.deferred) {
          await interaction.followUp({
            content: "❌ Une erreur est survenue.",
            flags: MessageFlags.Ephemeral,
          });
        } else {
          await interaction.reply({
            content: "❌ Une erreur est survenue.",
            flags: MessageFlags.Ephemeral,
          });
        }
      }
    } catch {
      // Silencieux si on ne peut même pas répondre
    }
  }
});

// ─── Gestion erreurs globales ──────────────────────

client.on(Events.Error, (error) => {
  logger.error(`❌ Erreur client Discord: ${error.message}`);
});

process.on("unhandledRejection", (error: any) => {
  logger.error(`❌ Promise non gérée: ${error?.message || error}`);
});

process.on("uncaughtException", (error) => {
  logger.error(`❌ Exception non gérée: ${error.message}`);
  process.exit(1);
});

// ─── Statut rotatif du bot ─────────────────────────
// Fait tourner le statut entre : leads scannés, à appeler, conclus

function startRotatingStatus(botClient: Client): void {
  let statusIndex = 0;

  const updateStatus = () => {
    try {
      const counts = getGlobalLeadCounts();
      const statuses = [
        { text: `📊 ${counts.totalScanned} leads scannés`, type: ActivityType.Custom },
        { text: `📞 ${counts.toCall} leads à appeler`, type: ActivityType.Custom },
        { text: `✅ ${counts.concluded} leads conclus`, type: ActivityType.Custom },
        { text: `🎯 ${counts.webRequests} demandes détectées`, type: ActivityType.Custom },
        { text: `🔍 /scan ou /hunt pour prospecter`, type: ActivityType.Custom },
      ];

      const current = statuses[statusIndex % statuses.length];
      botClient.user?.setPresence({
        activities: [
          {
            name: current.text,
            type: current.type,
          },
        ],
        status: "online",
      });

      statusIndex++;
    } catch (err) {
      logger.warn(`⚠️ Erreur statut rotatif: ${err}`);
    }
  };

  // Mettre à jour toutes les 30 secondes
  setInterval(updateStatus, 30_000);

  // Premier appel après 3s (laisser le temps à la DB de s'initialiser)
  setTimeout(updateStatus, 3_000);

  logger.info("🔄 Statut rotatif du bot activé (rotation toutes les 30s)");
}

// ─── Démarrage ─────────────────────────────────────

async function main(): Promise<void> {
  logger.info("🚀 Démarrage du bot Discord Leads…");

  // Initialiser la base de données
  getDb();

  // Connecter le bot
  await client.login(config.discordToken);
}

main().catch((err) => {
  logger.error(`❌ Erreur fatale: ${err.message}`);
  process.exit(1);
});
