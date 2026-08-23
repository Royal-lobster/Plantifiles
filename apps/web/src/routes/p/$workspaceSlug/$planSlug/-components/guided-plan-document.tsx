import { Button } from "@plantifiles/ui/components/button";
import { cn } from "@plantifiles/ui/lib/utils";
import type { Root, RootContent } from "hast";
import { Check, ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { PlanReaderData } from "../-data/plan-reader";
import { renderPlan } from "./plan-render";

type GuidedSection = {
	key: string;
	title: string;
	tree: Root;
};

type ReadingState = {
	activeKey?: unknown;
	reviewed?: unknown;
};

function elementProperty(node: RootContent, name: string): string | undefined {
	if (node.type !== "element") return undefined;
	const value = node.properties[name];
	return typeof value === "string" || typeof value === "number" ? String(value) : undefined;
}

function renderedText(node: RootContent): string {
	if (node.type === "text") return node.value;
	if (!("children" in node) || !Array.isArray(node.children)) return "";
	return node.children.map((child) => renderedText(child as RootContent)).join("");
}

function sectionTitle(node: RootContent): string | undefined {
	if (elementProperty(node, "data-block-kind") !== "Heading2") return undefined;
	return renderedText(node).trim() || undefined;
}

function sectionKey(node: RootContent, title: string): string {
	return (
		elementProperty(node, "id") ??
		title
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, "-")
			.replace(/^-|-$/g, "")
	);
}

function guidedSections(tree: Root): GuidedSection[] {
	const sections: GuidedSection[] = [];
	let title = "Orientation";
	let key = "orientation";
	let children: RootContent[] = [];

	const flush = () => {
		if (children.length === 0) return;
		sections.push({ key, title, tree: { ...tree, children } });
	};

	for (const node of tree.children) {
		const nextTitle = sectionTitle(node);
		if (nextTitle) {
			flush();
			title = nextTitle;
			key = sectionKey(node, nextTitle);
			children = [node];
		} else {
			children.push(node);
		}
	}
	flush();
	return sections;
}

function GuidedPlanDocument({ data }: { data: PlanReaderData }) {
	const sections = useMemo(() => guidedSections(data.renderTree), [data.renderTree]);
	const storageKey = `plantifiles:reading-desk:${data.workspace.slug}:${data.plan.slug}:v${data.version.number}`;
	const [activeIndex, setActiveIndex] = useState(0);
	const [reviewed, setReviewed] = useState<Record<string, true>>({});
	const [loaded, setLoaded] = useState(false);
	const stageRef = useRef<HTMLElement>(null);

	useEffect(() => {
		try {
			const stored = window.localStorage.getItem(storageKey);
			if (stored) {
				const state = JSON.parse(stored) as ReadingState;
				if (typeof state.activeKey === "string") {
					const storedIndex = sections.findIndex((section) => section.key === state.activeKey);
					if (storedIndex >= 0) setActiveIndex(storedIndex);
				}
				if (state.reviewed && typeof state.reviewed === "object" && !Array.isArray(state.reviewed)) {
					setReviewed(state.reviewed as Record<string, true>);
				}
			}
		} catch {
			// Reading Desk remains usable when personal storage is unavailable.
		}
		setLoaded(true);
	}, [sections, storageKey]);

	useEffect(() => {
		if (!loaded) return;
		try {
			window.localStorage.setItem(storageKey, JSON.stringify({ activeKey: sections[activeIndex]?.key, reviewed }));
		} catch {
			// A failed save does not block reading the canonical document.
		}
	}, [activeIndex, loaded, reviewed, sections, storageKey]);

	const active = sections[activeIndex];
	const rendered = useMemo(
		() => (active ? renderPlan(active.tree) : renderPlan(data.renderTree)),
		[active, data.renderTree],
	);

	function moveTo(index: number) {
		if (index < 0 || index >= sections.length) return;
		setActiveIndex(index);
		window.requestAnimationFrame(() => stageRef.current?.focus());
	}

	if (!active) return <>{renderPlan(data.renderTree)}</>;

	return (
		<section className="mt-8" aria-label="Guided reading desk">
			<div className="surface-inset px-5 py-4">
				<p className="label-eyebrow">Reading Desk</p>
				{data.metadata.audience && <p className="mt-2 text-muted-foreground text-sm">For {data.metadata.audience}</p>}
				{data.metadata.outcomes.length > 0 && (
					<ul className="mt-3 grid gap-2 text-sm sm:grid-cols-2" aria-label="Learning outcomes">
						{data.metadata.outcomes.map((outcome) => (
							<li key={outcome} className="flex gap-2">
								<Check aria-hidden className="mt-0.5 size-4 shrink-0 text-brand-ink" />
								<span>{outcome}</span>
							</li>
						))}
					</ul>
				)}
			</div>

			<div className="mt-6 grid items-start gap-8 lg:grid-cols-[13rem_minmax(0,1fr)]">
				<nav className="surface-inset p-2 lg:sticky lg:top-20" aria-label="Study path">
					<ol className="space-y-1">
						{sections.map((section, index) => {
							const isActive = index === activeIndex;
							return (
								<li key={section.key}>
									<button
										type="button"
										aria-current={isActive ? "step" : undefined}
										onClick={() => moveTo(index)}
										className={cn(
											"flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring",
											isActive
												? "bg-background font-medium text-foreground shadow-sm"
												: "text-muted-foreground hover:text-foreground",
										)}
									>
										<span className="w-5 font-mono text-[10px]">{String(index + 1).padStart(2, "0")}</span>
										<span className="min-w-0 flex-1 truncate">{section.title}</span>
										{reviewed[section.key] && <Check aria-label="Reviewed by me" className="size-3.5 text-brand-ink" />}
									</button>
								</li>
							);
						})}
					</ol>
				</nav>

				<section
					ref={stageRef}
					tabIndex={-1}
					className="min-w-0 outline-none focus-visible:ring-2 focus-visible:ring-ring"
				>
					<div className="mb-5 flex flex-wrap items-center gap-3 border-b border-foreground/[0.08] pb-4">
						<p className="label-eyebrow">
							Section {activeIndex + 1} of {sections.length}
						</p>
						<Button
							type="button"
							variant="outline"
							size="sm"
							className="ml-auto"
							aria-pressed={Boolean(reviewed[active.key])}
							onClick={() =>
								setReviewed((current) => {
									if (current[active.key]) {
										const { [active.key]: _removed, ...rest } = current;
										return rest;
									}
									return { ...current, [active.key]: true };
								})
							}
						>
							{reviewed[active.key] ? "Remove reviewed mark" : "Reviewed by me"}
						</Button>
					</div>
					{rendered}
					<div className="mt-8 flex items-center justify-between border-t border-foreground/[0.08] pt-5">
						<Button
							type="button"
							variant="outline"
							disabled={activeIndex === 0}
							onClick={() => moveTo(activeIndex - 1)}
						>
							<ChevronLeft aria-hidden className="size-4" />
							Previous
						</Button>
						<Button
							type="button"
							variant="outline"
							disabled={activeIndex === sections.length - 1}
							onClick={() => moveTo(activeIndex + 1)}
						>
							Next
							<ChevronRight aria-hidden className="size-4" />
						</Button>
					</div>
				</section>
			</div>
		</section>
	);
}

export { GuidedPlanDocument, guidedSections };
