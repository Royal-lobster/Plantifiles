import { describe, expect, it } from "vitest";
import { EXAMPLE_PLAN } from "./example.js";
import { lint } from "./lint.js";

function findingsFor(source: string, rule: string) {
  return lint(source).findings.filter((finding) => finding.rule === rule);
}

describe("lint", () => {
  it("accepts a document meeting every lint rule", () => {
    const report = lint(EXAMPLE_PLAN);
    expect(report).toMatchObject({ errors: 0, warnings: 0, score: 100, canPublish: true });
    expect(report.findings).toEqual([]);
  });

  it("requires exactly one TLDR", () => {
    const source = EXAMPLE_PLAN.replace("<TLDR>", "<Callout kind=\"note\">").replace("</TLDR>", "</Callout>");
    expect(findingsFor(source, "tldr-position")[0]?.message).toContain("exactly one");
  });

  it("requires TLDR to be the first block", () => {
    const source = EXAMPLE_PLAN.replace("<TLDR>", "An introductory paragraph.\n\n<TLDR>");
    expect(findingsFor(source, "tldr-position")[0]?.message).toContain("first block");
  });

  it("rejects a TLDR over 60 words", () => {
    const source = EXAMPLE_PLAN.replace(
      "Move subscription billing from the homegrown ledger to Stripe over three phases, keeping the ledger as read-only history.",
      Array.from({ length: 61 }, () => "word").join(" "),
    );
    expect(findingsFor(source, "tldr-length")).toHaveLength(1);
  });

  it("requires a short one-line summary after every level-two heading", () => {
    const source = EXAMPLE_PLAN.replace(
      "The current ledger has costly proration errors and no clear owner.",
      "This summary is deliberately\nwrapped across lines.",
    );
    expect(findingsFor(source, "section-summary")).toHaveLength(1);
  });

  it("rejects paragraphs over five sentences", () => {
    const source = `${EXAMPLE_PLAN}\nOne. Two. Three. Four. Five. Six.\n`;
    expect(findingsFor(source, "paragraph-length")).toHaveLength(1);
  });

  it("rejects paragraphs over 120 words", () => {
    const source = `${EXAMPLE_PLAN}\n${Array.from({ length: 121 }, () => "word").join(" ")}\n`;
    expect(findingsFor(source, "paragraph-length")).toHaveLength(1);
  });

  it.each(["Decision", "Phase", "Diagram"])("requires at least one %s", (component) => {
    const source = EXAMPLE_PLAN.replace(new RegExp(`<${component}[^>]*>[\\s\\S]*?</${component}>`), "");
    expect(findingsFor(source, "required-components").some((finding) => finding.message.includes(component))).toBe(true);
  });

  it("requires an owner on every Decision", () => {
    const source = EXAMPLE_PLAN.replace(' owner="@srujan"', "");
    expect(findingsFor(source, "decision-owner")).toHaveLength(1);
  });

  it("requires two options and exactly one recommendation", () => {
    const source = EXAMPLE_PLAN.replace(" recommended", "");
    expect(findingsFor(source, "tradeoff-options")[0]?.message).toContain("exactly one");
  });

  it("restricts risk severity", () => {
    const source = EXAMPLE_PLAN.replace('severity="high"', 'severity="critical"');
    expect(findingsFor(source, "risk-severity")).toHaveLength(1);
  });

  it("rejects headings deeper than level three", () => {
    const source = `${EXAMPLE_PLAN}\n#### Implementation detail\n`;
    expect(findingsFor(source, "heading-depth")).toHaveLength(1);
  });

  it("rejects components outside the vocabulary", () => {
    const source = `${EXAMPLE_PLAN}\n<Accordion>Unsupported</Accordion>\n`;
    expect(findingsFor(source, "component-vocabulary")[0]?.message).toContain("Accordion");
  });

  it("rejects raw HTML", () => {
    const source = `${EXAMPLE_PLAN}\n<div>Unsupported</div>\n`;
    expect(findingsFor(source, "component-vocabulary").length).toBeGreaterThan(0);
  });

  it("warns when no rejected alternative is recorded", () => {
    const source = EXAMPLE_PLAN.replace(/<Rejected[\s\S]*?<\/Rejected>\n/, "");
    expect(findingsFor(source, "rejected-alternative")).toHaveLength(1);
  });

  it("warns when read time exceeds twelve minutes", () => {
    const paragraph = Array.from({ length: 100 }, () => "word").join(" ");
    const source = `${EXAMPLE_PLAN}\n${Array.from({ length: 25 }, () => paragraph).join("\n\n")}\n`;
    const report = lint(source);
    expect(findingsFor(source, "read-time")).toHaveLength(1);
    expect(report.readTimeMinutes).toBeGreaterThan(12);
  });

  it("calculates the publish score from errors and warnings", () => {
    const source = EXAMPLE_PLAN.replace(' owner="@srujan"', "").replace(/<Rejected[\s\S]*?<\/Rejected>\n/, "");
    expect(lint(source)).toMatchObject({ errors: 1, warnings: 1, score: 87, canPublish: false });
  });
});
