import { loadRuntimeConfig } from "./config.js";
import { FileStore } from "./store.js";
import { createPositionCircleServer } from "./server.js";

const config = loadRuntimeConfig();

const store = new FileStore({
  dataFile: config.dataFile,
  seedFile: config.seedFile
});
const server = createPositionCircleServer({ store, config });

server.listen(config.port, () => {
  console.log(`PositionCircle API running at http://localhost:${config.port}`);
  console.log(`Data file: ${config.dataFile}`);
});
