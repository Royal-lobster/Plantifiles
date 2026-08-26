import { PLAN_EMOJI_MESSAGE, planEmojiSchema } from "@plantifiles/api-contract";
import { planEmojiFromSource } from "@plantifiles/core";

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
