import type { FamilyTree } from "./types";

export const TREE_SNAPSHOT_OBJECT_KEY = "system/tree-snapshot.json";
export const VISIBILITY_SNAPSHOT_OBJECT_KEY = "system/site-visibility.txt";
export const MEMBERS_SNAPSHOT_OBJECT_KEY = "system/members.json";

export type MemberAccessSnapshot = {
  members: { email: string; role: "admin" | "canEdit" | "canView"; personId: string | null }[];
  links: { email: string; memberEmail: string; provider: string | null }[];
};

export function isD1DailyReadLimitError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return message.includes("exceeded D1's free tier daily row read limit");
}

export function parseMemberAccessSnapshot(value: string): MemberAccessSnapshot | null {
  try {
    const parsed = JSON.parse(value) as Partial<MemberAccessSnapshot>;
    if (!Array.isArray(parsed.members) || !Array.isArray(parsed.links)) return null;
    return parsed as MemberAccessSnapshot;
  } catch {
    return null;
  }
}

export function parseTreeSnapshot(value: string): FamilyTree | null {
  try {
    const parsed = JSON.parse(value) as Partial<FamilyTree>;
    if (!Array.isArray(parsed.people) || !Array.isArray(parsed.relationships) || !Array.isArray(parsed.stories)) return null;
    return parsed as FamilyTree;
  } catch {
    return null;
  }
}
