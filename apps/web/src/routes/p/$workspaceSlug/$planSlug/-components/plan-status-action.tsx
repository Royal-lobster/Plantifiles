import { Button } from "@plantifiles/ui/components/button";
import { cn } from "@plantifiles/ui/lib/utils";
import { useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { ArrowRight } from "lucide-react";
import { useReducer, useRef } from "react";
import type { PlanReaderData } from "../-data/plan-reader";
import { advancePlanStatusForPage, approveCurrentVersionForPage } from "../-data/plan-review";

const NEXT_STATUS_LABEL: Record<"approved" | "draft", string> = {
	draft: "Submit for review",
	approved: "Archive",
};

type StatusState = { busy: boolean; message: string; refreshFailed: boolean };
type StatusAction =
	| { type: "started" }
	| { type: "saved"; message: string }
	| { type: "refreshFailed"; message: string }
	| { type: "failed"; message: string };

function statusReducer(state: StatusState, action: StatusAction): StatusState {
	switch (action.type) {
		case "started":
			return { ...state, busy: true, message: "" };
		case "saved":
			return { busy: false, message: action.message, refreshFailed: false };
		case "refreshFailed":
			return { busy: false, message: action.message, refreshFailed: true };
		case "failed":
			return { ...state, busy: false, message: action.message };
	}
}

export function PlanStatusAction({ data, isCurrentVersion }: { data: PlanReaderData; isCurrentVersion: boolean }) {
	const router = useRouter();
	const approveVersion = useServerFn(approveCurrentVersionForPage);
	const advanceStatus = useServerFn(advancePlanStatusForPage);
	const [state, dispatch] = useReducer(statusReducer, { busy: false, message: "", refreshFailed: false });
	const inFlight = useRef(false);
	const canAdvance = Boolean(
		data.viewer && isCurrentVersion && data.plan.status !== "archived" && !state.refreshFailed,
	);
	const nextLabel =
		data.plan.status === "archived" || data.plan.status === "in_review"
			? undefined
			: NEXT_STATUS_LABEL[data.plan.status];

	async function run() {
		if (inFlight.current) return;
		inFlight.current = true;
		dispatch({ type: "started" });
		try {
			const result =
				data.plan.status === "in_review"
					? await approveVersion({ data: { planId: data.plan.id } })
					: await advanceStatus({ data: { planId: data.plan.id } });
			const message = result.reason ?? `Plan is now ${result.status.replace("_", " ")}.`;
			try {
				await router.invalidate();
				dispatch({ type: "saved", message });
			} catch {
				dispatch({
					type: "refreshFailed",
					message: `${message} The change was saved, but this view could not refresh; reload the page to see the latest data.`,
				});
			}
		} catch (error) {
			dispatch({
				type: "failed",
				message: error instanceof Error ? error.message : "Could not update plan status.",
			});
		} finally {
			inFlight.current = false;
		}
	}

	if (!canAdvance && !state.message) return null;
	return (
		<div className="flex max-w-sm flex-col items-end gap-2">
			{canAdvance ? (
				<Button size="sm" onClick={() => void run()} disabled={state.busy}>
					{data.plan.status === "in_review" ? (state.busy ? "Approving…" : "Approve current version") : nextLabel}
					<ArrowRight />
				</Button>
			) : null}
			{state.message ? (
				<output
					className={cn(
						"text-right text-sm",
						state.message.includes("block") ? "text-warning" : "text-muted-foreground",
					)}
					aria-live="polite"
				>
					{state.message}
				</output>
			) : null}
		</div>
	);
}
