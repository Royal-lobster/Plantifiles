import { describe, expect, it } from "vitest";
import { planEmojiSchema, resolvePlanEmoji } from "./plan-emoji";

const SOURCE_WITH_EMOJI = `---
title: Billing migration
emoji: 🧾
---

Plan body.
`;
const SOURCE_WITHOUT_EMOJI = `---
title: Billing migration
---

Plan body.
`;

describe("plan emoji", () => {
	it.each(["🧾", "🛡️", "⚡"])("accepts representative emoji %s", (emoji) => {
		expect(planEmojiSchema.safeParse(emoji).success).toBe(true);
	});

	it.each(["todo", ":)", "🧾 billing", "123", "🧑‍💻🧑‍💻"])("rejects non-emoji value %s", (emoji) => {
		expect(planEmojiSchema.safeParse(emoji).success).toBe(false);
	});

	it("uses the API field ahead of frontmatter and the stored value", () => {
		expect(resolvePlanEmoji(SOURCE_WITH_EMOJI, "🛡️", "⚡")).toBe("🛡️");
	});

	it("uses frontmatter ahead of the stored value", () => {
		expect(resolvePlanEmoji(SOURCE_WITH_EMOJI, undefined, "⚡")).toBe("🧾");
	});

	it("preserves the stored value when an update supplies no emoji", () => {
		expect(resolvePlanEmoji(SOURCE_WITHOUT_EMOJI, undefined, "⚡")).toBe("⚡");
	});

	it("returns null when a plan has no emoji", () => {
		expect(resolvePlanEmoji(SOURCE_WITHOUT_EMOJI)).toBeNull();
	});
});
