/**
 * Service Logger for RAG Service
 * Provides structured logging with consistent format
 */

import pino from 'pino';

export function createServiceLogger(serviceName: string) {
  return pino({
    level: process.env.LOG_LEVEL || 'info',
    formatters: {
      level: (label) => {
        return { level: label };
      },
    },
    timestamp: pino.stdTimeFunctions.isoTime,
  }).child({ service: serviceName });
}

export const logger = createServiceLogger('rag-service');