import type { LintReport } from "@plantifiles/core";
import { Button } from "@plantifiles/ui/components/button";
import { Link, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { AlertTriangle, ArrowLeft, CheckCircle2, Save } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { previewPlanEdit, type SavePlanEditResult, savePlanEdit } from "#/lib/editor-data";
import type { PlanRouteData } from "#/lib/plan-data";
import { renderPlan } from "#/lib/render-plan";
import { PlanRenderProvider } from "./plan-components";
import { SourceEditor } from "./source-editor";

type Conflict = Extract<SavePlanEditResult, { ok: false; type: "conflict" }>;

function PlanEditor({
	data,
	workspaceSlug,
	planSlug,
}: {
	data: PlanRouteData;
	workspaceSlug: string;
	planSlug: string;
}) {
	const router = useRouter();
	const previewEdit = useServerFn(previewPlanEdit);
	const saveEdit = useServerFn(savePlanEdit);
	const [source, setSource] = useState(data.version.source);
	const [report, setReport] = useState<LintReport>(data.version.lintReport);
	const [renderTree, setRenderTree] = useState<PlanRouteData["renderTree"] | null>(data.renderTree);
	const [previewPending, setPreviewPending] = useState(false);
	const [saving, setSaving] = useState(false);
	const [message, setMessage] = useState("");
	const [conflict, setConflict] = useState<Conflict | null>(null);
	const rendered = useMemo(() => (renderTree ? renderPlan(renderTree) : null), [renderTree]);
	const currentBlockKeys = useMemo(
		() => Object.fromEntries(data.blocks.map((block) => [block.key, true])) as Record<string, true>,
		[data.blocks],
	);
	const versionNumberById = useMemo(
		() => Object.fromEntries(data.versions.map((version) => [version.id, version.number])),
		[data.versions],
	);

	useEffect(() => {
		let active = true;
		setPreviewPending(true);
		const timeout = window.setTimeout(() => {
			void previewEdit({ data: { source } })
				.then((result) => {
					if (!active) return;
					setReport(result.report);
					setRenderTree(result.renderTree);
					setMessage("");
				})
				.catch((caught: unknown) => {
					if (active) setMessage(caught instanceof Error ? caught.message : "Could not refresh preview.");
				})
				.finally(() => {
					if (active) setPreviewPending(false);
				});
		}, 400);
		return () => {
			active = false;
			window.clearTimeout(timeout);
		};
	}, [previewEdit, source]);

	async function save() {
		setSaving(true);
		setMessage("");
		setConflict(null);
		try {
			const result = await saveEdit({
				data: { planId: data.plan.id, baseVersion: data.version.number, source },
			});
			if (!result.ok) {
				if (result.type === "conflict") setConflict(result);
				else {
					setReport(result.report);
					setMessage(result.message);
				}
				return;
			}
			await router.invalidate();
			await router.navigate({ to: "/p/$workspaceSlug/$planSlug", params: { workspaceSlug, planSlug } });
		} catch (caught) {
			setMessage(caught instanceof Error ? caught.message : "Could not save plan.");
		} finally {
			setSaving(false);
		}
	}

	return (
		<section className="space-y-5">
			<header className="flex flex-wrap items-center gap-3 border-b pb-5">
				<Button variant="ghost" size="sm" asChild>
					<Link to="/p/$workspaceSlug/$planSlug" params={{ workspaceSlug, planSlug }}>
						<ArrowLeft /> Back to plan
					</Link>
				</Button>
				<div className="min-w-0 flex-1">
					<p className="truncate font-semibold">Edit {data.plan.title}</p>
					<p className="font-mono text-muted-foreground text-xs">Based on v{data.version.number}</p>
				</div>
				<div className="flex items-center gap-2">
					<span className="rounded-full bg-muted px-2 py-1 font-mono text-xs">score {report.score}</span>
					<span className={report.errors ? "text-destructive text-xs" : "text-success text-xs"}>
						{report.errors ? `${report.errors} errors` : `${report.warnings} warnings`}
					</span>
					<Button
						type="button"
						onClick={() => void save()}
						disabled={saving || previewPending || !report.canPublish || source === data.version.source}
					>
						<Save /> {saving ? "Saving…" : "Save version"}
					</Button>
				</div>
			</header>

			{conflict && (
				<div className="flex flex-wrap items-center gap-3 rounded-lg border border-warning/40 bg-warning/10 p-4 text-sm">
					<AlertTriangle className="size-4 text-warning" />
					<span>{conflict.message}</span>
					<a
						className="font-medium text-accent underline underline-offset-4"
						href={`/p/${encodeURIComponent(workspaceSlug)}/${encodeURIComponent(planSlug)}?compareFrom=${data.version.number}`}
					>
						View v{data.version.number} → v{conflict.currentVersion} diff
					</a>
				</div>
			)}
			{message && <p className="text-destructive text-sm">{message}</p>}

			<div className="grid min-h-[42rem] gap-5 lg:grid-cols-2">
				<div className="flex min-w-0 flex-col gap-3">
					<div className="flex items-center justify-between">
						<h2 className="font-medium text-sm">MDX source</h2>
						<span className="text-muted-foreground text-xs">Lint updates after 400 ms</span>
					</div>
					<div className="min-h-0 flex-1">
						<SourceEditor value={source} findings={report.findings} onChange={setSource} />
					</div>
					<section className="max-h-48 space-y-2 overflow-y-auto" aria-label="Lint findings">
						{report.findings.length === 0 ? (
							<p className="flex items-center gap-2 rounded-md border p-3 text-success text-xs">
								<CheckCircle2 className="size-4" /> Ready to save.
							</p>
						) : (
							report.findings.map((finding, index) => (
								<p key={`${finding.rule}-${finding.line}-${index}`} className="rounded-md border p-2 text-xs">
									<span className={finding.severity === "error" ? "text-destructive" : "text-warning"}>
										{finding.severity.toUpperCase()} · line {finding.line} · {finding.rule}
									</span>{" "}
									{finding.message}
								</p>
							))
						)}
					</section>
				</div>
				<div className="min-w-0 space-y-3">
					<div className="flex items-center justify-between">
						<h2 className="font-medium text-sm">Live preview</h2>
						{previewPending && <span className="text-muted-foreground text-xs">Updating…</span>}
					</div>
					<div className="h-[42rem] overflow-y-auto rounded-lg border bg-background p-6">
						{rendered ? (
							<article className="space-y-6">
								<PlanRenderProvider
									skim={false}
									decisions={data.decisions}
									comments={[]}
									currentBlockKeys={currentBlockKeys}
									viewerId={null}
									isCurrentVersion={false}
									versionNumberById={versionNumberById}
									workspaceSlug={workspaceSlug}
									planSlug={planSlug}
								>
									{rendered}
								</PlanRenderProvider>
							</article>
						) : (
							<p className="text-muted-foreground text-sm">Fix lint errors to refresh the preview.</p>
						)}
					</div>
				</div>
			</div>
		</section>
	);
}

export { PlanEditor };
