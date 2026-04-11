import { prisma } from "@/lib/prisma";
import {
  DEFAULT_USER_PREFERENCES,
  MAX_PINNED_ITEMS,
  type SidebarItemId,
  type UserPreferences,
  sanitizeUserPreferences,
} from "@/src/types/user-preferences";

export async function getUserPreferences(userId: string): Promise<UserPreferences> {
  const record = await prisma.userPreference.findUnique({
    where: { userId },
    select: { data: true },
  });

  if (!record) {
    return DEFAULT_USER_PREFERENCES;
  }

  return sanitizeUserPreferences(record.data);
}

export async function updateUserPreferences(
  userId: string,
  patch: Partial<UserPreferences>,
): Promise<UserPreferences> {
  const current = await getUserPreferences(userId);

  const next = sanitizeUserPreferences({
    ...current,
    ...patch,
  });

  if (next.pinnedIds.length > MAX_PINNED_ITEMS) {
    throw new Error(`Only ${MAX_PINNED_ITEMS} items can be pinned.`);
  }

  await prisma.userPreference.upsert({
    where: { userId },
    update: { data: next },
    create: { userId, data: next },
  });

  return next;
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