import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { FileStore } from "./store.js";
import { createPositionCircleServer } from "./server.js";

const rootDir = dirname(dirname(fileURLToPath(import.meta.url)));
const port = Number(process.env.PORT ?? 8787);
const dataFile = process.env.DATA_FILE ?? join(rootDir, "data", "store.json");
const seedFile = process.env.SEED_FILE ?? join(rootDir, "data", "seed.json");

const store = new FileStore({ dataFile, seedFile });
const server = createPositionCircleServer({ store });

server.listen(port, () => {
  console.log(`PositionCircle API running at http://localhost:${port}`);
  console.log(`Data file: ${dataFile}`);
});
