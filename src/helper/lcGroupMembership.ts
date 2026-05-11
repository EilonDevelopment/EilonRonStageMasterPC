import type { ILC } from './types';

/** True if the LC belongs to the given group id (comma-separated `groups` field). */
export function lcBelongsToGroup(item: Pick<ILC, 'groups'>, groupId: string): boolean {
  if (!groupId) return false;
  const parts = item.groups?.split(',').map((g) => String(g).trim()).filter(Boolean) ?? [];
  return parts.includes(String(groupId));
}
