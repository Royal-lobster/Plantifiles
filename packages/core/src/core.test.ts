import { describe, expect, it } from "vitest";
import { diff } from "./diff.js";
import { EXAMPLE_PLAN } from "./example.js";
import { normalize } from "./normalize.js";
import { skim } from "./skim.js";

describe("normalize", () => {
  it("keeps block keys stable when content changes under the same heading path", () => {
    const nextVersion = EXAMPLE_PLAN.replace("costly proration errors", "frequent proration errors").replace(
      "Webhook replay could double-charge.",
      "Delayed webhook replay could double-charge.",
    );
    expect(normalize(nextVersion).map((block) => block.key)).toEqual(normalize(EXAMPLE_PLAN).map((block) => block.key));
  });

  it("uses an explicit id as the block key", () => {
    const decision = normalize(EXAMPLE_PLAN).find((block) => block.kind === "Decision");
    expect(decision?.key).toBe("historical-invoices");
  });

  it("normalizes line endings before hashing", () => {
    expect(normalize(EXAMPLE_PLAN.replace(/\n/g, "\r\n"))).toEqual(normalize(EXAMPLE_PLAN));
  });
});

describe("diff", () => {
  it("classifies added, removed, modified, and moved blocks", () => {
    const previous = normalize(`<TLDR id="summary">
Short summary.
</TLDR>

<Decision id="choice" owner="@dev">
Old?
</Decision>

<Risk id="gone" severity="low">
Gone.
</Risk>`);
    const next = normalize(`An inserted paragraph.

<TLDR id="summary">
Short summary.
</TLDR>

<Decision id="choice" owner="@dev">
New?
</Decision>

<Phase id="new" n="1" title="Build">
- [ ] Ship
</Phase>`);
    const result = diff(previous, next);

    expect(result.changes.map((change) => [change.key, change.type])).toEqual(
      expect.arrayContaining([
        ["summary", "moved"],
        ["choice", "modified"],
        ["gone", "removed"],
        ["new", "added"],
      ]),
    );
    expect(result.summary).toContain("Removed Risk");
    expect(result.summary).toContain("Phase (Build)");
    expect(result.summary).toContain("Modified Decision");
    expect(result.summary).toContain("Moved TLDR");
  });

  it("reports no structural changes for identical blocks", () => {
    const blocks = normalize(EXAMPLE_PLAN);
    expect(diff(blocks, blocks)).toEqual({ changes: [], summary: "No structural changes." });
  });
});

describe("skim", () => {
  it("keeps review-critical components and projects phases to their titles", () => {
    const projection = skim(normalize(EXAMPLE_PLAN));
    expect(new Set(projection.map((block) => block.kind))).toEqual(
      new Set(["TLDR", "Decision", "Tradeoff", "Diagram", "Phase", "Risk"]),
    );
    expect(projection.find((block) => block.kind === "Phase")?.source).toBe("Dual-write");
    expect(projection.some((block) => block.kind === "Rejected")).toBe(false);
  });
});
