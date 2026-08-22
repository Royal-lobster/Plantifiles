import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
	AlertDialogTrigger,
} from "@plantifiles/ui/components/alert-dialog";
import { Button, buttonVariants } from "@plantifiles/ui/components/button";
import { useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { KeyRound, Trash2 } from "lucide-react";
import { Fragment, useReducer, useRef } from "react";
import { formatUtcTimestamp } from "#/lib/helpers/format-time";
import { SettingsRow, SettingsRowDivider } from "../../../../components/settings-section";
import { revokeTokenForPage, type TokenListItem } from "../-data/tokens";
import { tokenActionError, TokenFeedback, type TokenFeedbackValue } from "./token-feedback";

type RevokeState = { revokingId: string | undefined; feedback: TokenFeedbackValue | undefined };

type RevokeAction = { type: "started"; id: string } | { type: "finished"; feedback: TokenFeedbackValue };

function revokeReducer(state: RevokeState, action: RevokeAction): RevokeState {
	switch (action.type) {
		case "started":
			return { revokingId: action.id, feedback: undefined };
		case "finished":
			return { ...state, revokingId: undefined, feedback: action.feedback };
	}
}

export function TokenList({ tokens }: { tokens: TokenListItem[] }) {
	const revokeToken = useServerFn(revokeTokenForPage);
	const router = useRouter();
	const [state, dispatch] = useReducer(revokeReducer, { revokingId: undefined, feedback: undefined });
	const inFlight = useRef(false);

	async function revoke(token: TokenListItem) {
		if (inFlight.current) return;
		inFlight.current = true;
		dispatch({ type: "started", id: token.id });

		let feedback: TokenFeedbackValue;
		try {
			await revokeToken({ data: { id: token.id } });
			feedback = { kind: "success", message: `${token.name} was revoked.` };
			try {
				await router.invalidate();
			} catch (error) {
				feedback = {
					kind: "error",
					message: tokenActionError(error, `${token.name} was revoked, but the token list could not be refreshed.`),
				};
			}
		} catch (error) {
			feedback = { kind: "error", message: tokenActionError(error, `${token.name} could not be revoked.`) };
		} finally {
			inFlight.current = false;
		}
		dispatch({ type: "finished", feedback });
	}

	if (tokens.length === 0) {
		return (
			<div className="px-4 py-8 text-center">
				<KeyRound className="mx-auto size-6 text-muted-foreground" aria-hidden="true" />
				<p className="mt-2 font-medium text-sm">No API tokens yet</p>
				<p className="mt-1 text-muted-foreground text-xs">Create one above to connect an agent.</p>
			</div>
		);
	}

	return (
		<>
			{state.feedback ? (
				<div className="border-b px-4 py-3 text-right">
					<TokenFeedback feedback={state.feedback} />
				</div>
			) : null}
			{tokens.map((token, index) => (
				<Fragment key={token.id}>
					{index > 0 ? <SettingsRowDivider /> : null}
					<SettingsRow
						label={
							<span className="flex min-w-0 items-baseline gap-2">
								<span className="truncate">{token.name}</span>
								{token.prefix ? <code className="font-mono text-muted-foreground text-xs">{token.prefix}…</code> : null}
							</span>
						}
						hint={[
							token.lastUsedAt ? `Last used ${formatUtcTimestamp(token.lastUsedAt)}` : "Never used",
							token.expiresAt ? `expires ${formatUtcTimestamp(token.expiresAt)}` : "no expiry",
						].join(" · ")}
						control={
							<AlertDialog>
								<AlertDialogTrigger asChild>
									<Button
										variant="ghost"
										size="icon"
										aria-label={`Revoke ${token.name}`}
										disabled={Boolean(state.revokingId)}
									>
										<Trash2 aria-hidden="true" />
									</Button>
								</AlertDialogTrigger>
								<AlertDialogContent>
									<AlertDialogHeader>
										<AlertDialogTitle>Revoke {token.name}?</AlertDialogTitle>
										<AlertDialogDescription>
											Any agent using this token will immediately lose access. This action cannot be undone.
										</AlertDialogDescription>
									</AlertDialogHeader>
									<AlertDialogFooter>
										<AlertDialogCancel disabled={state.revokingId === token.id}>Keep token</AlertDialogCancel>
										<AlertDialogAction
											className={buttonVariants({ variant: "destructive" })}
											disabled={state.revokingId === token.id}
											onClick={() => void revoke(token)}
										>
											Revoke {token.name}
										</AlertDialogAction>
									</AlertDialogFooter>
								</AlertDialogContent>
							</AlertDialog>
						}
					/>
				</Fragment>
			))}
		</>
	);
}
