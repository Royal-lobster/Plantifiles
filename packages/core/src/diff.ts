import type { Block, BlockChange, ChangeType, StructuralDiff } from "./types.js";

const ACTION_LABEL: Record<ChangeType, string> = {
  added: "Added",
  removed: "Removed",
  modified: "Modified",
  moved: "Moved",
};

function describeChanges(type: ChangeType, changes: BlockChange[]): string | undefined {
  const matching = changes.filter((change) => change.type === type);
  if (matching.length === 0) return undefined;

  const counts = new Map<string, BlockChange[]>();
  for (const change of matching) {
    const byKind = counts.get(change.kind) ?? [];
    byKind.push(change);
    counts.set(change.kind, byKind);
  }

  const groups = [...counts.entries()].map(([kind, entries]) => {
    const title = entries.length === 1 ? (entries[0]?.next?.title ?? entries[0]?.previous?.title) : undefined;
    const noun = entries.length === 1 ? kind : `${kind}s`;
    return `${entries.length === 1 ? "" : `${entries.length} `}${noun}${title ? ` (${title})` : ""}`;
  });

  const detail = groups.length === 1 ? groups[0] : `${groups.slice(0, -1).join(", ")} and ${groups.at(-1)}`;
  return `${ACTION_LABEL[type]} ${detail}.`;
}

export function diff(previousBlocks: Block[], nextBlocks: Block[]): StructuralDiff {
  const previousByKey = new Map(previousBlocks.map((block) => [block.key, block]));
  const nextByKey = new Map(nextBlocks.map((block) => [block.key, block]));
  const changes: BlockChange[] = [];

  for (const previous of previousBlocks) {
    const next = nextByKey.get(previous.key);
    if (!next) {
      changes.push({ type: "removed", key: previous.key, kind: previous.kind, previous });
    } else if (previous.contentHash !== next.contentHash) {
      changes.push({ type: "modified", key: next.key, kind: next.kind, previous, next });
    } else if (previous.ordinal !== next.ordinal) {
      changes.push({ type: "moved", key: next.key, kind: next.kind, previous, next });
    }
  }

  for (const next of nextBlocks) {
    if (!previousByKey.has(next.key)) changes.push({ type: "added", key: next.key, kind: next.kind, next });
  }

  const sentences = (["removed", "added", "modified", "moved"] as const)
    .map((type) => describeChanges(type, changes))
    .filter((sentence): sentence is string => Boolean(sentence));

  return { changes, summary: sentences.join(" ") || "No structural changes." };
}
