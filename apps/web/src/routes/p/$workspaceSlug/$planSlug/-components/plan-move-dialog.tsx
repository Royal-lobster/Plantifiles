import { Button } from "@plantifiles/ui/components/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@plantifiles/ui/components/dialog";
import { Input } from "@plantifiles/ui/components/input";
import { Label } from "@plantifiles/ui/components/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@plantifiles/ui/components/select";
import { useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useId, useReducer, useRef } from "react";
import type { MoveTarget } from "#/lib/data/move-plan.server";
import { slugify } from "#/lib/helpers/plan-slug";
import { listMoveTargetsForPage, movePlanForPage } from "../-data/plan-move";

type MoveState = {
	/** `null` until the organizations load, so the chooser can say so. */
	targets: MoveTarget[] | null;
	destination: string;
	slug: string;
	busy: boolean;
	/** A destination collision the user resolves by editing the slug. */
	conflict: string;
	/** Anything else that went wrong, which retrying the same input will not fix. */
	failure: string;
};

type MoveAction =
	| { type: "loaded"; targets: MoveTarget[] }
	| { type: "loadFailed"; message: string }
	| { type: "destinationPicked"; destination: string }
	| { type: "slugChanged"; slug: string }
	| { type: "started" }
	| { type: "conflicted"; message: string }
	| { type: "failed"; message: string };

function moveReducer(state: MoveState, action: MoveAction): MoveState {
	switch (action.type) {
		case "loaded":
			return { ...state, targets: action.targets };
		case "loadFailed":
			return { ...state, targets: [], failure: action.message };
		case "destinationPicked":
			// Both messages named the previous destination, so neither survives it.
			return { ...state, destination: action.destination, conflict: "", failure: "" };
		case "slugChanged":
			return { ...state, slug: action.slug, conflict: "" };
		case "started":
			return { ...state, busy: true, conflict: "", failure: "" };
		case "conflicted":
			return { ...state, busy: false, conflict: action.message };
		case "failed":
			return { ...state, busy: false, failure: action.message };
	}
}

export function PlanMoveDialog({
	planId,
	planSlug,
	workspaceSlug,
	open,
	onOpenChange,
}: {
	planId: string;
	planSlug: string;
	workspaceSlug: string;
	open: boolean;
	onOpenChange(next: boolean): void;
}) {
	const router = useRouter();
	const loadTargets = useServerFn(listMoveTargetsForPage);
	const submitMove = useServerFn(movePlanForPage);
	const [state, dispatch] = useReducer(moveReducer, {
		targets: null,
		destination: "",
		slug: planSlug,
		busy: false,
		conflict: "",
		failure: "",
	});
	const inFlight = useRef(false);
	const destinationId = useId();
	const slugId = useId();

	// Loaded on open rather than with the page: most plan reads are by people who
	// cannot move the plan, and public reads have no organizations at all.
	useEffect(() => {
		if (!open) return;
		let live = true;
		void loadTargets({ data: { planId } })
			.then((targets) => {
				if (live) dispatch({ type: "loaded", targets });
			})
			.catch((error: unknown) => {
				if (live) {
					dispatch({
						type: "loadFailed",
						message: error instanceof Error ? error.message : "Could not load your organizations.",
					});
				}
			});
		return () => {
			live = false;
		};
	}, [open, planId, loadTargets]);

	const selected = state.targets?.find((item) => item.slug === state.destination);
	// The server slugifies whatever is typed, so the dialog shows the result
	// rather than letting the move land on a URL nobody asked for.
	const normalizedSlug = slugify(state.slug);
	const unresolvedCollision = Boolean(selected?.slugTaken) && normalizedSlug === planSlug;
	const slugIsEmpty = normalizedSlug.length === 0;
	const showSlugField = Boolean(selected) && (Boolean(selected?.slugTaken) || state.conflict.length > 0);
	const canSubmit =
		Boolean(selected) && !unresolvedCollision && !slugIsEmpty && state.conflict.length === 0 && !state.busy;

	async function run() {
		if (inFlight.current || !selected) return;
		inFlight.current = true;
		dispatch({ type: "started" });
		try {
			const result = await submitMove({
				data: {
					planId,
					workspaceSlug: selected.slug,
					...(normalizedSlug === planSlug ? {} : { slug: normalizedSlug }),
				},
			});
			if (!result.moved) {
				dispatch({ type: "conflicted", message: result.conflict });
				return;
			}
			onOpenChange(false);
			await router.navigate({
				to: "/p/$workspaceSlug/$planSlug",
				params: { workspaceSlug: result.moved.workspaceSlug, planSlug: result.moved.slug },
			});
		} catch (error) {
			dispatch({ type: "failed", message: error instanceof Error ? error.message : "Could not move the plan." });
		} finally {
			inFlight.current = false;
		}
	}

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="sm:max-w-md">
				<DialogHeader>
					<DialogTitle>Move plan</DialogTitle>
					<DialogDescription>
						The plan leaves <span className="font-mono">{workspaceSlug}</span> with its full version history, comments,
						and decisions. Approvals on the current version are cleared, because the new organization has not reviewed
						it, and the plan's current URL stops resolving.
					</DialogDescription>
				</DialogHeader>

				<div className="flex flex-col gap-4">
					<div className="flex flex-col gap-2">
						<Label htmlFor={destinationId}>Destination organization</Label>
						{state.targets?.length === 0 && !state.failure ? (
							<p className="text-muted-foreground text-sm">
								You belong to only one organization, so there is nowhere to move this plan.
							</p>
						) : (
							<Select
								value={state.destination}
								disabled={!state.targets || state.targets.length === 0}
								onValueChange={(destination) => dispatch({ type: "destinationPicked", destination })}
							>
								<SelectTrigger id={destinationId} aria-label="Destination organization">
									<SelectValue placeholder={state.targets ? "Choose an organization" : "Loading…"} />
								</SelectTrigger>
								<SelectContent>
									{state.targets?.map((item) => (
										<SelectItem key={item.id} value={item.slug}>
											{item.name}
											{item.slugTaken ? " — slug taken" : ""}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						)}
					</div>

					{showSlugField ? (
						<div className="flex flex-col gap-2">
							<Label htmlFor={slugId}>New plan slug</Label>
							<Input
								id={slugId}
								value={state.slug}
								aria-invalid={unresolvedCollision || slugIsEmpty || state.conflict.length > 0}
								onChange={(event) => dispatch({ type: "slugChanged", slug: event.target.value })}
							/>
							{state.conflict ? (
								<p className="text-destructive text-sm" role="alert">
									{state.conflict}
								</p>
							) : unresolvedCollision ? (
								<p className="text-destructive text-sm">
									{selected?.name} already has a plan at <span className="font-mono">{planSlug}</span>. Pick a different
									slug to move this one.
								</p>
							) : slugIsEmpty ? (
								<p className="text-destructive text-sm">A slug needs at least one letter or number.</p>
							) : null}
						</div>
					) : null}

					{selected && !slugIsEmpty ? (
						<p className="text-muted-foreground text-sm">
							New URL:{" "}
							<span className="font-mono">
								/p/{selected.slug}/{normalizedSlug}
							</span>
						</p>
					) : null}

					{state.failure ? (
						<p className="text-destructive text-sm" role="alert">
							{state.failure}
						</p>
					) : null}
				</div>

				<DialogFooter showCloseButton>
					<Button onClick={() => void run()} disabled={!canSubmit}>
						{state.busy ? "Moving…" : "Move plan"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
