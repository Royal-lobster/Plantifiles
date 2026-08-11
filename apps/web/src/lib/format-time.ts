export function formatUtcTimestamp(value: string | Date): string {
	return new Date(value)
		.toISOString()
		.replace("T", " ")
		.replace(/\.\d{3}Z$/, " UTC");
}
