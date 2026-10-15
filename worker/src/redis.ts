import { Redis } from "ioredis";
import { config } from "./config";

/**
 * BullMQ requires `maxRetriesPerRequest: null` on the connection used by
 * blocking workers; without it the worker throws on startup.
 */
export function createRedisConnection(): Redis {
  return new Redis(config.redisUrl, { maxRetriesPerRequest: null });
}
