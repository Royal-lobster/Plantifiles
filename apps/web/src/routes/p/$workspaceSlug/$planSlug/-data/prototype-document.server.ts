import { type DefaultTreeAdapterTypes, parseFragment, serialize } from "parse5";
import { compile } from "tailwindcss";
import tailwindPreflight from "tailwindcss/preflight.css?raw";
import tailwindTheme from "tailwindcss/theme.css?raw";

const TAILWIND_SOURCE = `${tailwindTheme}
@layer base {
${tailwindPreflight}
}
@tailwind utilities;`;

const BLOCKED_TAGS: Record<string, true> = {
	applet: true,
	base: true,
	embed: true,
	frame: true,
	frameset: true,
	iframe: true,
	link: true,
	meta: true,
	object: true,
	script: true,
};

const BLOCKED_ATTRIBUTES: Record<string, true> = {
	action: true,
	formaction: true,
	srcdoc: true,
};

const URL_ATTRIBUTES: Record<string, true> = {
	href: true,
	poster: true,
	src: true,
	"xlink:href": true,
};

const CONTENT_SECURITY_POLICY = [
	"default-src 'none'",
	"script-src 'none'",
	"style-src 'unsafe-inline'",
	"img-src https: data:",
	"media-src https: data:",
	"font-src https: data:",
	"connect-src 'none'",
	"frame-src 'none'",
	"form-action 'none'",
	"base-uri 'none'",
].join("; ");

type PrototypeSource = {
	html: string;
	candidates: string[];
};

function isElement(node: DefaultTreeAdapterTypes.ChildNode): node is DefaultTreeAdapterTypes.Element {
	return "tagName" in node;
}

function isAllowedUrl(attribute: string, value: string): boolean {
	let normalized = "";
	for (const character of value.trim()) {
		const codePoint = character.codePointAt(0) ?? 0;
		if (codePoint > 0x20 && codePoint !== 0x7f) normalized += character;
	}
	if (attribute === "href" || attribute === "xlink:href") return normalized.startsWith("#");
	if (/^https:\/\//i.test(normalized)) return true;
	return /^data:(?:image|audio|video)\/[a-z0-9.+-]+[;,]/i.test(normalized);
}

function sanitizeChildren(parent: DefaultTreeAdapterTypes.ParentNode, candidates: Set<string>): void {
	parent.childNodes = parent.childNodes.filter((node) => {
		if (!isElement(node)) return true;
		if (BLOCKED_TAGS[node.tagName]) return false;

		node.attrs = node.attrs.filter((attribute) => {
			const name = attribute.name.toLowerCase();
			if (name.startsWith("on") || BLOCKED_ATTRIBUTES[name]) return false;
			if (URL_ATTRIBUTES[name] && !isAllowedUrl(name, attribute.value)) return false;
			return true;
		});

		const classAttribute = node.attrs.find((attribute) => attribute.name === "class");
		for (const candidate of classAttribute?.value.split(/\s+/) ?? []) {
			if (candidate) candidates.add(candidate);
		}

		sanitizeChildren(node, candidates);
		if (node.tagName === "template" && "content" in node) sanitizeChildren(node.content, candidates);
		return true;
	});
}

function sanitizePrototypeHtml(source: string): PrototypeSource {
	const fragment = parseFragment(source);
	const candidates = new Set<string>();
	sanitizeChildren(fragment, candidates);
	return { html: serialize(fragment), candidates: [...candidates].sort() };
}

function escapeHtml(value: string): string {
	return value.replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

function escapeStyleEndTag(value: string): string {
	return value.replace(/<\/style/gi, "<\\/style");
}

export async function compilePrototypeDocument(source: string, title: string): Promise<string> {
	const prototype = sanitizePrototypeHtml(source);
	const compiler = await compile(TAILWIND_SOURCE);
	const css = escapeStyleEndTag(compiler.build(prototype.candidates));
	return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta http-equiv="Content-Security-Policy" content="${CONTENT_SECURITY_POLICY}"><title>${escapeHtml(title)}</title><style>${css}</style></head><body>${prototype.html}</body></html>`;
}
