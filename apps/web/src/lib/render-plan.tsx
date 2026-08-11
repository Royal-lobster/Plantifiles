import type { Root } from "hast";
import { type Components, type CreateEvaluater, toJsxRuntime } from "hast-util-to-jsx-runtime";
import { Fragment, jsx, jsxs } from "react/jsx-runtime";
import { planComponents } from "#/routes/-components/plan-components";

const HTML_ELEMENTS: Record<string, true> = {
	p: true,
	h1: true,
	h2: true,
	h3: true,
	h4: true,
	h5: true,
	h6: true,
	ul: true,
	ol: true,
	li: true,
	em: true,
	strong: true,
	code: true,
	pre: true,
	a: true,
	blockquote: true,
	hr: true,
	table: true,
	thead: true,
	tbody: true,
	tr: true,
	td: true,
	th: true,
	img: true,
	br: true,
	del: true,
	input: true,
	section: true,
	span: true,
	div: true,
};

const registry = planComponents as Record<string, unknown>;
const allowedComponents = Object.keys(registry)
	.filter((name) => /^[A-Z]/.test(name))
	.sort()
	.join(", ");

const strictRegistry = new Proxy(registry, {
	getOwnPropertyDescriptor(target, key) {
		if (typeof key !== "string" || Object.hasOwn(target, key)) return Reflect.getOwnPropertyDescriptor(target, key);
		if (HTML_ELEMENTS[key]) return undefined;
		return { configurable: true, enumerable: true, value: undefined };
	},
	get(target, key) {
		if (Object.hasOwn(target, key)) return Reflect.get(target, key);
		if (typeof key === "string" && !HTML_ELEMENTS[key]) throw new Error(`Unknown MDX element <${key}>.`);
		return undefined;
	},
});

const createEvaluater: CreateEvaluater = () => ({
	evaluateExpression(node) {
		if (node.type === "Identifier" && typeof node.name === "string") {
			if (Object.hasOwn(registry, node.name)) return registry[node.name];
			throw new Error(`Unknown MDX component <${node.name}>. Allowed: ${allowedComponents}`);
		}
		throw new Error(`JavaScript expressions are not allowed in plan documents (${node.type}).`);
	},
	evaluateProgram() {
		throw new Error("Imports and exports are not allowed in plan documents.");
	},
});

export function renderPlan(tree: Root) {
	return toJsxRuntime(tree, {
		Fragment,
		jsx,
		jsxs,
		components: strictRegistry as Components,
		createEvaluater,
		passNode: true,
	});
}
