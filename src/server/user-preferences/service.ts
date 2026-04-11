import { promises as fs } from "node:fs";
import path from "node:path";
import {
  DEFAULT_USER_PREFERENCES,
  MAX_PINNED_ITEMS,
  type SidebarItemId,
  type UserPreferences,
  sanitizeUserPreferences,
} from "@/src/types/user-preferences";

type StoreShape = Record<string, UserPreferences>;
let storeWriteQueue: Promise<void> = Promise.resolve();

const STORE_DIR = path.join(process.cwd(), ".data");
const STORE_FILE = path.join(STORE_DIR, "user-preferences.json");

async function ensureStoreExists() {
  await fs.mkdir(STORE_DIR, { recursive: true });

  try {
    await fs.access(STORE_FILE);
  } catch {
    await fs.writeFile(STORE_FILE, JSON.stringify({}, null, 2), "utf8");
  }
}

async function readStore(): Promise<StoreShape> {
  await ensureStoreExists();

  try {
    const raw = await fs.readFile(STORE_FILE, "utf8");
    const parsed = JSON.parse(raw) as unknown;

    if (!parsed || typeof parsed !== "object") {
      return {};
    }

    const safe: StoreShape = {};
    for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
      safe[key] = sanitizeUserPreferences(value);
    }
    return safe;
  } catch {
    return {};
  }
}

async function writeStore(next: StoreShape) {
  await ensureStoreExists();
  await fs.writeFile(STORE_FILE, JSON.stringify(next, null, 2), "utf8");
}

export async function getUserPreferences(userId: string): Promise<UserPreferences> {
  const store = await readStore();
  return store[userId] ?? DEFAULT_USER_PREFERENCES;
}

export async function updateUserPreferences(
  userId: string,
  patch: Partial<UserPreferences>,
): Promise<UserPreferences> {
  const run = async () => {
    const store = await readStore();
    const current = store[userId] ?? DEFAULT_USER_PREFERENCES;

    const next = sanitizeUserPreferences({
      ...current,
      ...patch,
    });

    if (next.pinnedIds.length > MAX_PINNED_ITEMS) {
      throw new Error(`Only ${MAX_PINNED_ITEMS} items can be pinned.`);
    }

    store[userId] = next;
    await writeStore(store);
    return next;
  };

  const resultPromise = storeWriteQueue.then(run);
  storeWriteQueue = resultPromise.then(
    () => undefined,
    () => undefined,
  );

  return resultPromise;
}

export function buildPinnedList(
  currentPinnedIds: SidebarItemId[],
  itemId: SidebarItemId,
  shouldPin: boolean,
): SidebarItemId[] {
  if (!shouldPin) {
    return currentPinnedIds.filter((id) => id !== itemId);
  }

  if (currentPinnedIds.includes(itemId)) {
    return currentPinnedIds;
  }

  if (currentPinnedIds.length >= MAX_PINNED_ITEMS) {
    throw new Error(`Only ${MAX_PINNED_ITEMS} items can be pinned.`);
  }

  return [...currentPinnedIds, itemId];
}