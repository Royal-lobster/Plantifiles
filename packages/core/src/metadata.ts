import { parseDocument } from "yaml";
import type { ArtifactMetadata, ArtifactProfile } from "./types.js";

const FRONTMATTER = /^---\n([\s\S]*?)\n---(?:\n|$)/;
const AUTHORED_KEYS: Record<string, true> = {
	title: true,
	kind: true,
	emoji: true,
	audience: true,
	outcomes: true,
};
const CANONICAL_READ_ONLY_KEYS: Record<string, true> = {
	version: true,
	status: true,
	url: true,
	openDecisions: true,
	updatedAt: true,
};
const PROFILES: Record<ArtifactProfile, true> = {
	plan: true,
	lesson: true,
	"guided-plan": true,
};

type MetadataIssue = {
	rule: string;
	message: string;
	line: number;
};

export type MetadataParseResult = {
	metadata: ArtifactMetadata;
	issues: MetadataIssue[];
};

function lineForKey(frontmatter: string, key: string): number {
	const lines = frontmatter.split("\n");
	const index = lines.findIndex((line) => new RegExp(`^${key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*:`).test(line));
	return index < 0 ? 1 : index + 2;
}

function nonemptyString(value: unknown): string | undefined {
	return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

export function parseArtifactMetadata(source: string): MetadataParseResult {
	const normalized = source.replace(/\r\n?/g, "\n");
	const frontmatter = normalized.match(FRONTMATTER)?.[1];
	const metadata: ArtifactMetadata = { profile: null, outcomes: [] };
	const issues: MetadataIssue[] = [];

	if (frontmatter === undefined) {
		issues.push({
			rule: "frontmatter-required",
			message: "Add YAML frontmatter with nonempty title and kind fields.",
			line: 1,
		});
		return { metadata, issues };
	}

	const document = parseDocument(frontmatter, { uniqueKeys: true });
	if (document.errors.length > 0) {
		issues.push({
			rule: "frontmatter-yaml",
			message: `Frontmatter is not valid YAML: ${document.errors[0]?.message ?? "unknown YAML error"}`,
			line: 1,
		});
		return { metadata, issues };
	}

	const value = document.toJS() as unknown;
	if (value === null || typeof value !== "object" || Array.isArray(value)) {
		issues.push({
			rule: "frontmatter-yaml",
			message: "Frontmatter must be a YAML mapping.",
			line: 1,
		});
		return { metadata, issues };
	}

	const fields = value as Record<string, unknown>;
	for (const key of Object.keys(fields)) {
		if (AUTHORED_KEYS[key] || CANONICAL_READ_ONLY_KEYS[key]) continue;
		issues.push({
			rule: "frontmatter-vocabulary",
			message: `Unknown frontmatter field "${key}".`,
			line: lineForKey(frontmatter, key),
		});
	}

	const title = nonemptyString(fields.title);
	if (title) {
		metadata.title = title;
	} else {
		issues.push({
			rule: "frontmatter-title",
			message: "Frontmatter requires a nonempty title string.",
			line: lineForKey(frontmatter, "title"),
		});
	}

	const kind = nonemptyString(fields.kind);
	if (kind && PROFILES[kind as ArtifactProfile]) {
		metadata.profile = kind as ArtifactProfile;
	} else {
		issues.push({
			rule: "frontmatter-kind",
			message: 'Frontmatter kind must be "plan", "lesson", or "guided-plan".',
			line: lineForKey(frontmatter, "kind"),
		});
	}

	if (fields.emoji !== undefined) {
		const emoji = nonemptyString(fields.emoji);
		if (emoji) {
			metadata.emoji = emoji;
		} else {
			issues.push({
				rule: "frontmatter-emoji",
				message: "Frontmatter emoji must be a nonempty string when provided.",
				line: lineForKey(frontmatter, "emoji"),
			});
		}
	}

	if (fields.audience !== undefined) {
		const audience = nonemptyString(fields.audience);
		if (audience && !audience.includes("\n")) {
			metadata.audience = audience;
		} else {
			issues.push({
				rule: "frontmatter-audience",
				message: "Frontmatter audience must be one nonempty line.",
				line: lineForKey(frontmatter, "audience"),
			});
		}
	}

	if (fields.outcomes !== undefined) {
		if (
			Array.isArray(fields.outcomes) &&
			fields.outcomes.length >= 1 &&
			fields.outcomes.length <= 5 &&
			fields.outcomes.every((outcome) => typeof outcome === "string" && outcome.trim())
		) {
			metadata.outcomes = fields.outcomes.map((outcome) => (outcome as string).trim());
		} else {
			issues.push({
				rule: "frontmatter-outcomes",
				message: "Frontmatter outcomes must contain one to five nonempty strings.",
				line: lineForKey(frontmatter, "outcomes"),
			});
		}
	}

	return { metadata, issues };
}
