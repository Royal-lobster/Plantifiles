const FRONTMATTER = /^---\n([\s\S]*?)\n---(?:\n|$)/;
const EMOJI_FIELD = /^\s*emoji:\s*(.*?)\s*$/m;

function unquoteYamlScalar(value: string): string {
	if (value.length < 2) return value;
	if (value.startsWith('"') && value.endsWith('"')) {
		try {
			const parsed = JSON.parse(value);
			return typeof parsed === "string" ? parsed : value;
		} catch {
			return value;
		}
	}
	if (value.startsWith("'") && value.endsWith("'")) return value.slice(1, -1).replace(/''/g, "'");
	return value;
}

export function planEmojiFromSource(source: string): string | undefined {
	const normalized = source.replace(/\r\n?/g, "\n");
	const frontmatter = normalized.match(FRONTMATTER)?.[1];
	const value = frontmatter?.match(EMOJI_FIELD)?.[1]?.trim();
	if (!value) return undefined;
	return unquoteYamlScalar(value) || undefined;
}
