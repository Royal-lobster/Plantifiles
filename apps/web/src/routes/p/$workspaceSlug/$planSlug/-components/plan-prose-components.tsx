import { Badge } from "@plantifiles/ui/components/badge";
import { Checkbox } from "@plantifiles/ui/components/checkbox";
import { cn } from "@plantifiles/ui/lib/utils";
import { AlertTriangle, ChevronRight, Info, Scale, X } from "lucide-react";
import type { ComponentProps, ReactNode } from "react";
import { usePlanRender } from "./plan-render-context";

type RiskSeverity = "low" | "med" | "high";

function PlanParagraph({ node: _node, className, ...props }: ComponentProps<"p"> & { node?: unknown }) {
	return <p className={cn("text-base text-foreground/90 leading-7", className)} {...props} />;
}

/* A rule above the section, the way a manuscript opens one, rather than an
   underline that makes every heading look like a table header. */
function PlanHeading2({ node: _node, className, ...props }: ComponentProps<"h2"> & { node?: unknown }) {
	return <h2 className={cn("mt-7 border-t pt-6 font-medium text-2xl tracking-tight", className)} {...props} />;
}

function PlanHeading3({ node: _node, className, ...props }: ComponentProps<"h3"> & { node?: unknown }) {
	return <h3 className={cn("mt-6 font-medium text-xl tracking-tight", className)} {...props} />;
}

function PlanList({ node: _node, className, ...props }: ComponentProps<"ul"> & { node?: unknown }) {
	return <ul className={cn("my-4 space-y-2 pl-5", className)} {...props} />;
}

function PlanOrderedList({ node: _node, className, ...props }: ComponentProps<"ol"> & { node?: unknown }) {
	return <ol className={cn("my-4 list-decimal space-y-2 pl-5", className)} {...props} />;
}

function PlanListItem({ node: _node, className, ...props }: ComponentProps<"li"> & { node?: unknown }) {
	return <li className={cn("pl-1 text-sm leading-6 marker:text-muted-foreground", className)} {...props} />;
}

function PlanPre({ node: _node, className, ...props }: ComponentProps<"pre"> & { node?: unknown }) {
	return (
		<pre
			className={cn(
				"my-4 overflow-x-auto rounded-lg border p-4 font-mono text-sm leading-6 [&>code]:block [&>code]:rounded-none [&>code]:bg-transparent [&>code]:p-0 [&>code]:text-[1em]",
				className,
			)}
			{...props}
		/>
	);
}

function PlanCode({ node: _node, className, ...props }: ComponentProps<"code"> & { node?: unknown }) {
	return <code className={cn("rounded bg-muted px-1.5 py-0.5 font-mono text-[0.85em]", className)} {...props} />;
}

function PlanLink({ node: _node, className, children, ...props }: ComponentProps<"a"> & { node?: unknown }) {
	return (
		<a
			className={cn(
				"font-medium text-foreground underline decoration-brand-ink decoration-2 underline-offset-4 hover:text-brand-ink",
				className,
			)}
			{...props}
		>
			{children}
		</a>
	);
}

function PlanInput({ node: _node, checked, ...props }: ComponentProps<"input"> & { node?: unknown }) {
	return <Checkbox checked={Boolean(checked)} disabled aria-label={props["aria-label"] ?? "Checklist item"} />;
}

/* The standfirst. A plan's first paragraph is the only thing most readers
   finish, so it is set at a larger reading size, not as a card. */
function TLDR({ children }: { children?: ReactNode }) {
	return <div className="text-lg text-foreground leading-[1.7] tracking-tight sm:text-xl">{children}</div>;
}

/* A tradeoff is a weighing, so it is drawn as one: options share a beam and the
   recommended arm sits heavier than the alternatives it beat. */
function Tradeoff({ children }: { children?: ReactNode }) {
	return (
		<section>
			<header className="flex items-center gap-2 border-b pb-2">
				<Scale className="size-4 text-brand-ink" />
				<h3 className="label-eyebrow text-foreground">Tradeoff</h3>
			</header>
			<div className="grid gap-x-5 gap-y-4 md:grid-cols-2">{children}</div>
		</section>
	);
}

function Option({ name, recommended, children }: { name: string; recommended?: boolean; children?: ReactNode }) {
	return (
		<section
			className={cn(
				"border-t-2 px-4 pt-3 pb-4",
				recommended ? "border-brand-ink bg-brand-ink/[0.05]" : "border-border/70 text-muted-foreground",
			)}
		>
			<header className="mb-2 flex items-center gap-2">
				<h4 className={cn("font-medium", recommended ? "text-foreground" : "text-foreground/70")}>{name}</h4>
				{recommended && (
					<Badge variant="brand" size="sm" className="ml-auto">
						Recommended
					</Badge>
				)}
			</header>
			<div className="space-y-2 text-sm leading-6">{children}</div>
		</section>
	);
}

function Rejected({ what, children }: { what: string; children?: ReactNode }) {
	return (
		<details className="group/rejected border-y py-2.5">
			<summary className="flex cursor-pointer list-none items-center gap-2 text-sm text-muted-foreground">
				<ChevronRight className="size-3.5 transition-transform group-open/rejected:rotate-90" />
				<X className="size-3.5 text-destructive/70" />
				<span className="label-eyebrow">Rejected</span>
				<span className="text-foreground/70 line-through decoration-destructive/40">{what}</span>
			</summary>
			<div className="mt-2.5 pl-7 text-sm leading-6">{children}</div>
		</details>
	);
}

/* Phases are a spine: consecutive phase blocks link into one continuous line so
   delivery reads as a sequence rather than as five unrelated bordered boxes. */
function Phase({
	n,
	title,
	blockKey,
	children,
}: {
	n: string;
	title: string;
	blockKey?: string;
	children?: ReactNode;
}) {
	const { phaseContinues } = usePlanRender();
	const continues = Boolean(blockKey && phaseContinues[blockKey]);
	return (
		<section className="relative pl-12">
			<span
				aria-hidden
				className={cn("absolute top-9 left-[0.9375rem] w-px bg-border", continues ? "-bottom-8" : "bottom-1")}
			/>
			<span className="absolute top-0 left-0 flex size-8 items-center justify-center rounded-full border-2 border-phase/40 bg-background font-mono font-semibold text-phase text-xs">
				{n}
			</span>
			<h3 className="pt-1 font-medium text-xl tracking-tight">{title}</h3>
			<div className="mt-3 [&_li]:flex [&_li]:items-start [&_li]:gap-2.5 [&_li]:pl-0 [&_ul]:space-y-2.5 [&_ul]:pl-0">
				{children}
			</div>
		</section>
	);
}

const RISK_LEVEL: Record<RiskSeverity, { bars: number; label: string; wrapper: string; ink: string; fill: string }> = {
	low: {
		bars: 1,
		label: "low",
		wrapper: "border-l-risk-low bg-risk-low/[0.04]",
		ink: "text-risk-low",
		fill: "bg-risk-low",
	},
	med: {
		bars: 2,
		label: "medium",
		wrapper: "border-l-risk-med bg-risk-med/[0.06]",
		ink: "text-risk-med",
		fill: "bg-risk-med",
	},
	high: {
		bars: 3,
		label: "high",
		wrapper: "border-l-risk-high bg-risk-high/[0.07]",
		ink: "text-risk-high",
		fill: "bg-risk-high",
	},
};

/* Severity is drawn, not just named: three rungs, filled to the stated level, so
   a page of risks can be scanned for the one that actually matters. */
function Risk({ severity, children }: { severity: RiskSeverity; children?: ReactNode }) {
	const level = RISK_LEVEL[severity] ?? RISK_LEVEL.med;
	return (
		<section className={cn("rounded-r-lg border border-l-[3px] p-5", level.wrapper)}>
			<header className="mb-2 flex items-center gap-2">
				<AlertTriangle className={cn("size-4", level.ink)} />
				<h3 className="label-eyebrow text-foreground">Risk</h3>
				<span className={cn("font-mono text-[11px] uppercase tracking-[0.14em]", level.ink)}>{level.label}</span>
				<span className="ml-auto flex items-end gap-0.5" aria-hidden>
					{[0, 1, 2].map((rung) => (
						<span
							key={rung}
							className={cn(
								"w-1 rounded-sm",
								rung === 0 ? "h-1.5" : rung === 1 ? "h-2.5" : "h-3.5",
								rung < level.bars ? level.fill : "bg-current opacity-15",
							)}
						/>
					))}
				</span>
			</header>
			<div className="text-base leading-7">{children}</div>
		</section>
	);
}

function CodeSketch({ lang: _lang, file, children }: { lang: string; file?: string; children?: ReactNode }) {
	return (
		<figure className="overflow-hidden rounded-lg border bg-card">
			{file && (
				<figcaption className="flex items-center gap-2 border-b bg-muted/60 px-4 py-2 font-mono text-[11px] text-muted-foreground">
					<span className="size-1.5 rounded-full bg-brand-ink/60" />
					{file}
				</figcaption>
			)}
			<div className="[&_pre]:my-0 [&_pre]:rounded-none [&_pre]:border-0">{children}</div>
		</figure>
	);
}

function LegacyPrototype({ title, children }: { title: string; children?: ReactNode }) {
	return (
		<figure className="overflow-hidden rounded-lg border bg-card">
			<figcaption className="border-b bg-muted/60 px-4 py-2 font-mono text-[11px] text-muted-foreground">
				{title} · archived prototype source
			</figcaption>
			<div className="[&_pre]:my-0 [&_pre]:rounded-none [&_pre]:border-0">{children}</div>
		</figure>
	);
}

function Callout({ kind, children }: { kind: "note" | "warning"; children?: ReactNode }) {
	const warning = kind === "warning";
	const Icon = warning ? AlertTriangle : Info;
	return (
		<aside
			aria-label={warning ? "Warning" : "Note"}
			className={cn(
				"flex gap-3 border-l-2 py-1 pl-4 text-sm leading-6",
				warning ? "border-warning bg-warning/[0.06] py-3 pr-4" : "border-brand-ink/50",
			)}
		>
			<Icon className={cn("mt-1 size-4 shrink-0", warning ? "text-warning" : "text-brand-ink")} />
			<div>{children}</div>
		</aside>
	);
}

function PlanStrong({ node: _node, className, ...props }: ComponentProps<"strong"> & { node?: unknown }) {
	return <strong className={cn("font-semibold text-foreground", className)} {...props} />;
}

function PlanBlockquote({ node: _node, className, ...props }: ComponentProps<"blockquote"> & { node?: unknown }) {
	return <blockquote className={cn("border-l-2 pl-4 text-lg text-muted-foreground italic", className)} {...props} />;
}

/**
 * Tables were unreachable until core learned GFM, so they had never been styled.
 * A comparison is the one task where prose measurably loses, so the table is
 * worth real treatment: a ruled header, breathing room per cell, and its own
 * horizontal scroll so a wide comparison never widens the column.
 */
function PlanTable({ node: _node, className, ...props }: ComponentProps<"table"> & { node?: unknown }) {
	return (
		<div className="-mx-1 my-5 overflow-x-auto rounded-lg border bg-card px-1">
			<table className={cn("w-full border-collapse text-left text-sm", className)} {...props} />
		</div>
	);
}

function PlanThead({ node: _node, className, ...props }: ComponentProps<"thead"> & { node?: unknown }) {
	return <thead className={cn("border-b bg-muted/40", className)} {...props} />;
}

function PlanTh({ node: _node, className, ...props }: ComponentProps<"th"> & { node?: unknown }) {
	return (
		<th
			className={cn(
				"px-3 py-2.5 align-bottom font-mono font-medium text-[0.6875rem] text-muted-foreground uppercase tracking-[0.12em]",
				className,
			)}
			{...props}
		/>
	);
}

function PlanTr({ node: _node, className, ...props }: ComponentProps<"tr"> & { node?: unknown }) {
	return <tr className={cn("border-b last:border-b-0", className)} {...props} />;
}

function PlanTd({ node: _node, className, ...props }: ComponentProps<"td"> & { node?: unknown }) {
	return <td className={cn("px-3 py-2.5 align-top leading-6", className)} {...props} />;
}

export {
	Callout,
	CodeSketch,
	LegacyPrototype,
	Option,
	Phase,
	PlanBlockquote,
	PlanCode,
	PlanHeading2,
	PlanHeading3,
	PlanInput,
	PlanLink,
	PlanList,
	PlanListItem,
	PlanOrderedList,
	PlanParagraph,
	PlanPre,
	PlanStrong,
	PlanTable,
	PlanTd,
	PlanTh,
	PlanThead,
	PlanTr,
	Rejected,
	Risk,
	TLDR,
	Tradeoff,
};
