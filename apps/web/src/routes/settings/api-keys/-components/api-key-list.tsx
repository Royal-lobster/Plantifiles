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
import { type ApiKeyListItem, revokeApiKey } from "../-data/api-keys";
import { ApiKeyFeedback, type ApiKeyFeedbackValue, apiKeyActionError } from "./api-key-feedback";

type RevokeState = { revokingId: string | undefined; feedback: ApiKeyFeedbackValue | undefined };

type RevokeAction = { type: "started"; id: string } | { type: "finished"; feedback: ApiKeyFeedbackValue };

function revokeReducer(state: RevokeState, action: RevokeAction): RevokeState {
	switch (action.type) {
		case "started":
			return { revokingId: action.id, feedback: undefined };
		case "finished":
			return { ...state, revokingId: undefined, feedback: action.feedback };
	}
}

export function ApiKeyListSkeleton() {
	return (
		<output className="block" aria-label="Loading API keys">
			{[0, 1].map((row) => (
				<Fragment key={row}>
					{row > 0 ? <SettingsRowDivider /> : null}
					<SettingsRow
						label={<div className="h-4 w-32 animate-pulse rounded-xl bg-muted" />}
						hint={<div className="h-3 w-56 max-w-full animate-pulse rounded-xl bg-muted" />}
						control={<div className="size-9 animate-pulse rounded-2xl bg-muted" />}
					/>
				</Fragment>
			))}
		</output>
	);
}

export function ApiKeyList({ apiKeys }: { apiKeys: ApiKeyListItem[] }) {
	const revoke = useServerFn(revokeApiKey);
	const router = useRouter();
	const [state, dispatch] = useReducer(revokeReducer, { revokingId: undefined, feedback: undefined });
	const inFlight = useRef(false);

	async function settle(apiKey: ApiKeyListItem) {
		if (inFlight.current) return;
		inFlight.current = true;
		dispatch({ type: "started", id: apiKey.id });

		let feedback: ApiKeyFeedbackValue;
		try {
			await revoke({ data: { id: apiKey.id } });
			feedback = { kind: "success", message: `${apiKey.name} was revoked.` };
			try {
				await router.invalidate();
			} catch (error) {
				feedback = {
					kind: "error",
					message: apiKeyActionError(error, `${apiKey.name} was revoked, but the key list could not be refreshed.`),
				};
			}
		} catch (error) {
			feedback = { kind: "error", message: apiKeyActionError(error, `${apiKey.name} could not be revoked.`) };
		} finally {
			inFlight.current = false;
		}
		dispatch({ type: "finished", feedback });
	}

	if (apiKeys.length === 0) {
		return (
			<div className="px-5 py-8 text-center">
				<KeyRound className="mx-auto size-6 text-muted-foreground" aria-hidden="true" />
				<p className="mt-2 font-medium text-sm">No API keys yet</p>
				<p className="mt-1 text-muted-foreground text-xs">Create one above to connect a pipeline.</p>
			</div>
		);
	}

	return (
		<>
			{state.feedback ? (
				<div className="border-b border-foreground/[0.06] px-5 py-3 text-right">
					<ApiKeyFeedback feedback={state.feedback} />
				</div>
			) : null}
			{apiKeys.map((apiKey, index) => (
				<Fragment key={apiKey.id}>
					{index > 0 ? <SettingsRowDivider /> : null}
					<SettingsRow
						label={<span className="truncate">{apiKey.name}</span>}
						hint={[
							apiKey.lastUsedAt ? `Last used ${formatUtcTimestamp(new Date(apiKey.lastUsedAt))}` : "Never used",
							apiKey.expiration ? `expires ${formatUtcTimestamp(new Date(apiKey.expiration))}` : "no expiry",
							apiKey.scopes.join(", "),
						].join(" · ")}
						control={
							<AlertDialog>
								<AlertDialogTrigger asChild>
									<Button
										variant="ghost"
										size="icon"
										aria-label={`Revoke ${apiKey.name}`}
										disabled={Boolean(state.revokingId)}
									>
										<Trash2 aria-hidden="true" />
									</Button>
								</AlertDialogTrigger>
								<AlertDialogContent>
									<AlertDialogHeader>
										<AlertDialogTitle>Revoke {apiKey.name}?</AlertDialogTitle>
										<AlertDialogDescription>
											Anything using this key loses access within about a minute, once Clerk's verification cache
											expires. This action cannot be undone.
										</AlertDialogDescription>
									</AlertDialogHeader>
									<AlertDialogFooter>
										<AlertDialogCancel disabled={state.revokingId === apiKey.id}>Keep key</AlertDialogCancel>
										<AlertDialogAction
											className={buttonVariants({ variant: "destructive" })}
											disabled={state.revokingId === apiKey.id}
											onClick={() => void settle(apiKey)}
										>
											Revoke {apiKey.name}
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
