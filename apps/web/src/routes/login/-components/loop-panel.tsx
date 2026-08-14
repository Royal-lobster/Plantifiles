import { ArrowRight } from "lucide-react";
import { StatusChip } from "../../../components/status-chip";

type Step = { index: string; title: string; body: string; command?: string };

/**
 * The signed-out half of the page. Login is the front door — `/` redirects here
 * for anyone without a session — so this panel spends the empty half of the
 * viewport explaining the loop instead of leaving one card floating in a void.
 * Every command shown is one the CLI actually accepts.
 */
const STEPS: Step[] = [
	{
		index: "01",
		title: "Agents publish",
		body: "A coding agent pushes the plan it just wrote, straight from the repo it was written in.",
		command: "plantifiles push plan.mdx --agent claude-code",
	},
	{
		index: "02",
		title: "Humans review",
		body: "Read it as a document. Comment on any block, settle the open decisions, approve the version.",
	},
	{
		index: "03",
		title: "Agents build",
		body: "The next session pulls the approved Markdown back down and builds from that, not from chat scrollback.",
		command: "plantifiles pull <plan-url> -o plan.mdx",
	},
];

function LoopPanel() {
	return (
		<aside className="relative flex items-center overflow-hidden border-t bg-card/40 lg:border-t-0 lg:border-l">
			{/* A faint wash of the active theme's primary, so the panel reads as a
			    surface rather than a second background. */}
			<div
				aria-hidden="true"
				className="pointer-events-none absolute inset-0 bg-linear-to-b from-primary/6 to-transparent"
			/>
			<div className="relative mx-auto w-full max-w-md px-6 py-14 sm:px-10 lg:px-12 lg:py-16 xl:max-w-lg xl:px-16">
				<p className="label-eyebrow">The loop</p>
				<h2 className="mt-3 font-display font-medium text-2xl leading-snug tracking-tight">
					A plan is the contract between the two halves of the work.
				</h2>
				<ol className="mt-10 space-y-9">
					{STEPS.map((step, position) => (
						<li key={step.index} className="relative pl-12">
							<span
								aria-hidden="true"
								className="absolute top-0 left-0 grid size-8 place-items-center rounded-full bg-primary/15 font-mono text-foreground text-xs ring-1 ring-primary/25"
							>
								{step.index}
							</span>
							{/* The rule joins each step to the next, so three items read as one
							    sequence and the last one visibly closes it. */}
							{position < STEPS.length - 1 && (
								<span aria-hidden="true" className="absolute top-9 -bottom-9 left-4 w-px bg-border" />
							)}
							<h3 className="font-medium text-sm tracking-tight">{step.title}</h3>
							<p className="mt-1.5 text-muted-foreground text-sm leading-6">{step.body}</p>
							{step.command ? (
								<code className="mt-3 block overflow-x-auto whitespace-nowrap rounded-md border bg-muted/40 px-3 py-2 font-mono text-[11px]">
									{step.command}
								</code>
							) : (
								<p className="mt-3 flex items-center gap-1.5">
									<StatusChip status="draft" size="sm" />
									<ArrowRight aria-hidden="true" className="size-3 text-border" />
									<StatusChip status="in_review" size="sm" />
									<ArrowRight aria-hidden="true" className="size-3 text-border" />
									<StatusChip status="approved" size="sm" />
								</p>
							)}
						</li>
					))}
				</ol>
			</div>
		</aside>
	);
}

export { LoopPanel };
