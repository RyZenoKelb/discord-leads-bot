/**
 * deploy-commands.ts — Enregistre les commandes slash auprès de Discord.
 * Exécuter une fois avec: npm run deploy-commands
 * Ou automatiquement au démarrage du bot.
 */

import { REST, Routes } from "discord.js";
import { config } from "./config";
import { logger } from "./utils/logger";

// Importer les commandes
import { data as scanData } from "./bot/commands/scan";
import { data as scanGridData } from "./bot/commands/scan_grid";
import { filtersSetData, filtersShowData } from "./bot/commands/filters";
import { data as exportData } from "./bot/commands/export";
import { data as statusData } from "./bot/commands/status";
import { data as helpData } from "./bot/commands/help";
import { data as guideData } from "./bot/commands/guide";
import { data as updateData } from "./bot/commands/update";
import { callQueueData, callNextData } from "./bot/commands/callQueue";
import { data as statsNowData } from "./bot/commands/statsNow";
import { data as enrichEmailData } from "./bot/commands/enrichEmail";
import { data as leadNotesData } from "./bot/commands/leadNotes";
import { data as dailyStatsData } from "./bot/commands/dailyStats";
import { data as resetDbData }    from "./bot/commands/resetDb";
import { data as clearData }      from "./bot/commands/clear";
import { data as pipelineData }   from "./bot/commands/pipeline";
import { data as leadSearchData } from "./bot/commands/leadSearch";
import { data as blacklistData }  from "./bot/commands/blacklist";
import { data as recapData }      from "./bot/commands/recap";
import { data as huntData }       from "./bot/commands/hunt";

const commands = [
  scanData.toJSON(),
  scanGridData.toJSON(),
  filtersSetData.toJSON(),
  filtersShowData.toJSON(),
  exportData.toJSON(),
  statusData.toJSON(),
  helpData.toJSON(),
  guideData.toJSON(),
  updateData.toJSON(),
  callQueueData.toJSON(),
  callNextData.toJSON(),
  statsNowData.toJSON(),
  enrichEmailData.toJSON(),
  leadNotesData.toJSON(),
  dailyStatsData.toJSON(),
  resetDbData.toJSON(),
  clearData.toJSON(),
  pipelineData.toJSON(),
  leadSearchData.toJSON(),
  blacklistData.toJSON(),
  recapData.toJSON(),
  huntData.toJSON(),
];

export async function deployCommands(clientId: string): Promise<void> {
  const rest = new REST({ version: "10" }).setToken(config.discordToken);

  try {
    logger.info(`🔄 Enregistrement de ${commands.length} commandes slash…`);

    await rest.put(Routes.applicationCommands(clientId), {
      body: commands,
    });

    logger.info("✅ Commandes slash enregistrées avec succès !");
  } catch (error) {
    logger.error(`❌ Erreur enregistrement commandes: ${error}`);
    throw error;
  }
}

// Exécution directe
if (require.main === module) {
  (async () => {
    // Il faut le client ID — on le récupère via le token
    const rest = new REST({ version: "10" }).setToken(config.discordToken);
    try {
      const app = (await rest.get(Routes.currentApplication())) as any;
      await deployCommands(app.id);
    } catch (e) {
      logger.error(`Erreur: ${e}`);
      process.exit(1);
    }
  })();
}
