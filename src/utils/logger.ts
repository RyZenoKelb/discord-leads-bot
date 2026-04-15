/**
 * logger.ts — Logger centralisé avec Winston.
 * Affiche dans la console avec horodatage + couleurs.
 */

import winston from "winston";

export const logger = winston.createLogger({
  level: "info",
  format: winston.format.combine(
    winston.format.timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
    winston.format.errors({ stack: true }),
    winston.format.printf(({ timestamp, level, message, stack }) => {
      const msg = stack || message;
      return `[${timestamp}] ${level.toUpperCase().padEnd(5)} ${msg}`;
    })
  ),
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(winston.format.colorize({ all: true })),
    }),
  ],
});
