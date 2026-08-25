import { Button } from "@plantifiles/ui/components/button";
import { cn } from "@plantifiles/ui/lib/utils";
import { useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { ArrowRight } from "lucide-react";
import { useRef, useState } from "react";
import type { PlanReaderData } from "../-data/plan-reader";
import { advancePlanStatusForPage, approveCurrentVersionForPage } from "../-data/plan-review";

const NEXT_STATUS_LABEL: Record<"approved" | "draft", string> = {
	draft: "Submit for review",
	approved: "Archive",
};

export function PlanStatusAction({ data, isCurrentVersion }: { data: PlanReaderData; isCurrentVersion: boolean }) {
	const router = useRouter();
	const approveVersion = useServerFn(approveCurrentVersionForPage);
	const advanceStatus = useServerFn(advancePlanStatusForPage);
	const [busy, setBusy] = useState(false);
	const [statusMessage, setStatusMessage] = useState("");
	const [refreshFailed, setRefreshFailed] = useState(false);
	const inFlight = useRef(false);
	const canAdvance = Boolean(data.viewer && isCurrentVersion && data.plan.status !== "archived" && !refreshFailed);
	const nextLabel =
		data.plan.status === "archived" || data.plan.status === "in_review"
			? undefined
			: NEXT_STATUS_LABEL[data.plan.status];

	async function run() {
		if (inFlight.current) return;
		inFlight.current = true;
		setBusy(true);
		setStatusMessage("");
		try {
			const result =
				data.plan.status === "in_review"
					? await approveVersion({ data: { planId: data.plan.id } })
					: await advanceStatus({ data: { planId: data.plan.id } });
			const message = result.reason ?? `Plan is now ${result.status.replace("_", " ")}.`;
			try {
				await router.invalidate();
				setBusy(false);
				setStatusMessage(message);
				setRefreshFailed(false);
			} catch {
				setBusy(false);
				setStatusMessage(
					`${message} The change was saved, but this view could not refresh; reload the page to see the latest data.`,
				);
				setRefreshFailed(true);
			}
		} catch (error) {
			setBusy(false);
			setStatusMessage(error instanceof Error ? error.message : "Could not update plan status.");
		} finally {
			inFlight.current = false;
		}
	}

	if (!canAdvance && !statusMessage) return null;
	return (
		<div className="flex max-w-sm flex-col items-end gap-2">
			{canAdvance ? (
				<Button size="sm" onClick={() => void run()} disabled={busy}>
					{data.plan.status === "in_review" ? (busy ? "Approving…" : "Approve current version") : nextLabel}
					<ArrowRight />
				</Button>
			) : null}
			{statusMessage ? (
				<output
					className={cn(
						"text-right text-sm",
						statusMessage.includes("block") ? "text-warning" : "text-muted-foreground",
					)}
					aria-live="polite"
				>
					{statusMessage}
				</output>
			) : null}
		</div>
	);
}
