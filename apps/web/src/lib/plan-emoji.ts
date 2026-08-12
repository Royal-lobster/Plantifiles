import { planEmojiFromSource } from "@plantifiles/core";
import { z } from "zod";

const PLAN_EMOJI_MESSAGE =
	"Emoji must be at most 8 characters, include a non-ASCII symbol, and contain no ASCII letters, digits, or whitespace.";

export const planEmojiSchema = z
	.string()
	.max(8, PLAN_EMOJI_MESSAGE)
	.regex(/^[^A-Za-z0-9\s]+$/, PLAN_EMOJI_MESSAGE)
	.refine((value) => Array.from(value).some((character) => (character.codePointAt(0) ?? 0) > 127), PLAN_EMOJI_MESSAGE);

export function resolvePlanEmoji(
	source: string,
	apiEmoji?: string | undefined,
	existingEmoji?: string | null | undefined,
): string | null {
	const candidate = apiEmoji ?? planEmojiFromSource(source) ?? existingEmoji ?? null;
	if (candidate === null) return null;
	const parsed = planEmojiSchema.safeParse(candidate);
	if (!parsed.success) {
		throw Response.json({ error: "invalid_emoji", message: PLAN_EMOJI_MESSAGE }, { status: 400 });
	}
	return parsed.data;
}
