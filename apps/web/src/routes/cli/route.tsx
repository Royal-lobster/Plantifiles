import { Button } from "@plantifiles/ui/components/button";
import { Input } from "@plantifiles/ui/components/input";
import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { CheckCircle2, Terminal } from "lucide-react";
import { type SyntheticEvent, useId, useReducer, useRef } from "react";
import { formatUtcTimestamp } from "#/lib/helpers/format-time";
import { guardLoader } from "#/lib/helpers/loader-guard";
import { LogoMark } from "../../components/brand";
import { approveCliLogin, denyCliLogin, getCliApproval } from "./-data/cli-approval";

const cliSearchSchema = (search: Record<string, unknown>) => ({
	code: typeof search.code === "string" ? search.code : undefined,
});

export const Route = createFileRoute("/cli")({
	validateSearch: cliSearchSchema,
	loaderDeps: ({ search }) => ({ code: search.code }),
	loader: ({ deps }) => guardLoader(() => getCliApproval({ data: { code: deps.code } })),
	component: CliApprovalPage,
});

type Outcome = { kind: "approved"; tokenName: string; expiresAt: string } | { kind: "denied" };

type ApprovalState = { code: string; busy: boolean; error: string; outcome: Outcome | null };
type ApprovalAction =
	| { type: "codeChanged"; code: string }
	| { type: "started" }
	| { type: "failed"; message: string }
	| { type: "settled"; outcome: Outcome };

function approvalReducer(state: ApprovalState, action: ApprovalAction): ApprovalState {
	switch (action.type) {
		case "codeChanged":
			return { ...state, code: action.code, error: "" };
		case "started":
			return { ...state, busy: true, error: "" };
		case "failed":
			return { ...state, busy: false, error: action.message };
		case "settled":
			return { ...state, busy: false, outcome: action.outcome };
	}
}

function actionError(error: unknown, fallback: string): string {
	return error instanceof Error && error.message ? error.message : fallback;
}

function CliApprovalPage() {
	const data = Route.useLoaderData();
	const router = useRouter();
	const approve = useServerFn(approveCliLogin);
	const deny = useServerFn(denyCliLogin);
	const [state, dispatch] = useReducer(approvalReducer, {
		code: data.pending?.code ?? "",
		busy: false,
		error: "",
		outcome: null,
	});
	const inFlight = useRef(false);
	const codeId = useId();

	function findCode(event: SyntheticEvent<HTMLFormElement, SubmitEvent>) {
		event.preventDefault();
		void router.navigate({ to: "/cli", search: { code: state.code.trim().toUpperCase() } });
	}

	async function settle(kind: "approve" | "deny") {
		const code = data.pending?.code;
		if (!code || inFlight.current) return;
		inFlight.current = true;
		dispatch({ type: "started" });
		try {
			if (kind === "deny") {
				await deny({ data: { code } });
				dispatch({ type: "settled", outcome: { kind: "denied" } });
			} else {
				const approved = await approve({ data: { code } });
				dispatch({ type: "settled", outcome: { kind: "approved", ...approved } });
			}
		} catch (error) {
			dispatch({ type: "failed", message: actionError(error, "That request could not be completed.") });
		} finally {
			inFlight.current = false;
		}
	}

	return (
		<main className="flex min-h-screen flex-col px-6 py-8 sm:px-10">
			<div className="mx-auto flex w-full max-w-md items-center gap-1.5">
				<LogoMark className="size-8 [&_svg]:size-7" />
				<span className="font-semibold text-base tracking-tight">Plantifiles</span>
			</div>

			<div className="flex flex-1 items-center py-12">
				<div className="mx-auto w-full max-w-md">
					{state.outcome ? (
						<Settled outcome={state.outcome} />
					) : data.pending ? (
						<section>
							<Terminal className="size-6 text-muted-foreground" aria-hidden="true" />
							<h1 className="mt-4 font-display font-medium text-3xl tracking-tight">Approve this terminal?</h1>
							<p className="mt-3 text-muted-foreground leading-7">
								A command line is asking to act as <strong className="text-foreground">{data.user.name}</strong> (
								{data.user.email}). Approve it only if you started <code className="font-mono">plantifiles login</code>{" "}
								yourself.
							</p>

							<dl className="mt-6 space-y-3 rounded-xl border bg-card px-4 py-3 text-sm">
								<div className="flex justify-between gap-4">
									<dt className="text-muted-foreground">Device</dt>
									<dd className="font-medium">{data.pending.tokenName}</dd>
								</div>
								<div className="flex justify-between gap-4">
									<dt className="text-muted-foreground">Code</dt>
									<dd className="font-mono tracking-widest">{data.pending.code}</dd>
								</div>
								<div className="flex justify-between gap-4">
									<dt className="text-muted-foreground">Request expires</dt>
									<dd className="font-mono text-xs">{formatUtcTimestamp(data.pending.expiresAt)}</dd>
								</div>
							</dl>

							{state.error ? (
								<p
									role="alert"
									className="mt-4 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-destructive text-sm"
								>
									{state.error}
								</p>
							) : null}

							<div className="mt-6 flex gap-3">
								<Button type="button" className="flex-1" disabled={state.busy} onClick={() => void settle("approve")}>
									{state.busy ? "Working…" : "Approve"}
								</Button>
								<Button
									type="button"
									variant="outline"
									className="flex-1"
									disabled={state.busy}
									onClick={() => void settle("deny")}
								>
									Deny
								</Button>
							</div>
						</section>
					) : (
						<section>
							<Terminal className="size-6 text-muted-foreground" aria-hidden="true" />
							<h1 className="mt-4 font-display font-medium text-3xl tracking-tight">Connect a terminal</h1>
							<p className="mt-3 text-muted-foreground leading-7">
								Run <code className="font-mono">plantifiles login</code> and enter the code it prints.
							</p>
							<form className="mt-6 space-y-3" onSubmit={findCode}>
								<label htmlFor={codeId} className="font-medium text-sm">
									Device code
								</label>
								<Input
									id={codeId}
									value={state.code}
									autoComplete="off"
									spellCheck={false}
									placeholder="WDJB-MJHT"
									className="font-mono text-lg tracking-widest uppercase"
									onChange={(event) => dispatch({ type: "codeChanged", code: event.target.value })}
								/>
								{data.problem ? (
									<p role="alert" className="text-destructive text-sm">
										{data.problem}
									</p>
								) : null}
								<Button type="submit" className="w-full" disabled={state.code.trim().length === 0}>
									Continue
								</Button>
							</form>
						</section>
					)}
				</div>
			</div>
		</main>
	);
}

function Settled({ outcome }: { outcome: Outcome }) {
	if (outcome.kind === "denied") {
		return (
			<section>
				<h1 className="font-display font-medium text-3xl tracking-tight">Request denied</h1>
				<p className="mt-3 text-muted-foreground leading-7">
					No token was issued. If you did not start that login, nothing further is needed.
				</p>
			</section>
		);
	}
	return (
		<section>
			<CheckCircle2 className="size-6 text-success" aria-hidden="true" />
			<h1 className="mt-4 font-display font-medium text-3xl tracking-tight">Terminal connected</h1>
			<p className="mt-3 text-muted-foreground leading-7">
				<strong className="text-foreground">{outcome.tokenName}</strong> can now publish plans as you until{" "}
				{formatUtcTimestamp(outcome.expiresAt)}. Return to your terminal — it has the credential already.
			</p>
			<p className="mt-3 text-muted-foreground text-sm">Revoke it any time from Settings → Agent tokens.</p>
		</section>
	);
}
