import { existsSync } from "node:fs";
import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

export class FileStore {
  constructor({ dataFile, seedFile }) {
    this.dataFile = dataFile;
    this.seedFile = seedFile;
    this.writeChain = Promise.resolve();
  }

  async init() {
    await mkdir(dirname(this.dataFile), { recursive: true });
    if (!existsSync(this.dataFile)) {
      await copyFile(this.seedFile, this.dataFile);
    }
  }

  async read() {
    await this.init();
    const raw = await readFile(this.dataFile, "utf8");
    return normalizeStoreData(JSON.parse(raw));
  }

  async write(data) {
    await this.init();
    this.writeChain = this.writeChain.then(async () => {
      const tempFile = `${this.dataFile}.tmp`;
      await writeFile(tempFile, `${JSON.stringify(data, null, 2)}\n`);
      await writeFile(this.dataFile, `${JSON.stringify(data, null, 2)}\n`);
    });
    await this.writeChain;
  }

  async update(mutator) {
    const data = await this.read();
    const result = await mutator(data);
    await this.write(data);
    return result;
  }
}

function normalizeStoreData(data) {
  data.groups ??= [];
  data.holdings ??= [];
  data.holdingEvents ??= [];
  return data;
}
