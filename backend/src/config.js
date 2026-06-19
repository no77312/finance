import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = dirname(dirname(fileURLToPath(import.meta.url)));

export function loadRuntimeConfig(env = process.env) {
  return {
    rootDir,
    port: Number(env.PORT ?? 8787),
    dataFile: env.DATA_FILE ?? join(rootDir, "data", "store.json"),
    seedFile: env.SEED_FILE ?? join(rootDir, "data", "seed.json"),
    publicDir: resolve(env.PUBLIC_DIR ?? join(rootDir, "public")),
    googleClientID: env.GOOGLE_CLIENT_ID ?? "",
    priceRefreshToken: env.PRICE_REFRESH_TOKEN ?? "",
    appTimeZone: env.APP_TIME_ZONE || "Asia/Shanghai"
  };
}
