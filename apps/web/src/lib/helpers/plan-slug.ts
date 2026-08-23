/**
 * Plan slugs are URL segments under `/p/:workspaceSlug/`, so they stay lowercase
 * ASCII. Publication and moves share this rule: a plan that changes slug while
 * moving organizations must land on the same shape it would have been published
 * with.
 */
export function slugify(value: string): string {
	return value
		.normalize("NFKD")
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-|-$/g, "")
		.slice(0, 80);
}
