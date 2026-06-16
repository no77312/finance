import { existsSync } from "node:fs";
import { copyFile, mkdir, readFile, rename, writeFile } from "node:fs/promises";
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
      await rename(tempFile, this.dataFile);
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
  data.users ??= usersFromGroups(data.groups ?? []);
  data.sessions ??= [];
  data.groups ??= [];
  data.holdings ??= [];
  data.holdingEvents ??= [];
  data.portfolioSnapshots ??= buildLegacyPortfolioSnapshots(data.holdings);
  return data;
}

function buildLegacyPortfolioSnapshots(holdings) {
  const snapshotsByOwnerGroup = new Map();

  for (const holding of holdings ?? []) {
    const key = `${holding.groupID}:${holding.ownerID}`;
    const existing = snapshotsByOwnerGroup.get(key) ?? {
      id: `LEGACY-${holding.groupID}-${holding.ownerID}`,
      groupID: holding.groupID,
      ownerID: holding.ownerID,
      source: "legacy",
      createdAt: holding.updatedAt ?? new Date().toISOString(),
      holdings: []
    };

    if (new Date(holding.updatedAt ?? 0) > new Date(existing.createdAt ?? 0)) {
      existing.createdAt = holding.updatedAt;
    }

    existing.holdings.push(snapshotHoldingFromHolding(holding));
    snapshotsByOwnerGroup.set(key, existing);
  }

  return Array.from(snapshotsByOwnerGroup.values())
    .map((snapshot) => ({
      ...snapshot,
      holdings: snapshot.holdings.sort((first, second) => first.symbol.localeCompare(second.symbol))
    }))
    .sort((first, second) => new Date(first.createdAt ?? 0) - new Date(second.createdAt ?? 0));
}

function snapshotHoldingFromHolding(holding) {
  return {
    holdingID: holding.id,
    symbol: holding.symbol,
    assetName: holding.assetName,
    market: holding.market,
    quantity: Number(holding.quantity),
    averageCost: Number(holding.averageCost),
    lastPrice: Number(holding.lastPrice),
    currency: holding.currency,
    visibility: holding.visibility,
    note: holding.note ?? "",
    updatedAt: holding.updatedAt ?? null
  };
}

function usersFromGroups(groups) {
  const usersByID = new Map();
  for (const group of groups) {
    for (const member of group.members ?? []) {
      if (!usersByID.has(member.id)) {
        usersByID.set(member.id, {
          id: member.id,
          provider: "seed",
          providerUserID: member.id,
          displayName: member.displayName,
          email: "",
          avatarSymbol: member.avatarSymbol,
          createdAt: member.joinedAt,
          lastSignedInAt: member.joinedAt
        });
      }
    }
  }
  return Array.from(usersByID.values());
}
