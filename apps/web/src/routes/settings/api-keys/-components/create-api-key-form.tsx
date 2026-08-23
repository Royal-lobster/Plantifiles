import { Button } from "@plantifiles/ui/components/button";
import { Input } from "@plantifiles/ui/components/input";
import { useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { KeyRound } from "lucide-react";
import { type SyntheticEvent, useId, useReducer, useRef } from "react";
import { SettingsRow } from "../../../../components/settings-section";
import { createApiKey } from "../-data/api-keys";
import { ApiKeyFeedback, type ApiKeyFeedbackValue, apiKeyActionError } from "./api-key-feedback";
import { CreatedApiKeyDialog } from "./created-api-key-dialog";

const CREATE_API_KEY_HINT = "Give each pipeline or headless agent its own key so access can be revoked independently.";

type CreatedApiKey = { name: string; secret: string };

type CreateState = {
	name: string;
	creating: boolean;
	created: CreatedApiKey | undefined;
	feedback: ApiKeyFeedbackValue | undefined;
};

type CreateAction =
	| { type: "nameChanged"; name: string }
	| { type: "started" }
	| { type: "created"; apiKey: CreatedApiKey }
	| { type: "failed"; feedback: ApiKeyFeedbackValue }
	| { type: "closed" };

function createReducer(state: CreateState, action: CreateAction): CreateState {
	switch (action.type) {
		case "nameChanged":
			return { ...state, name: action.name, feedback: undefined };
		case "started":
			return { ...state, creating: true, feedback: undefined };
		case "created":
			return {
				name: "",
				creating: false,
				created: action.apiKey,
				feedback: { kind: "success", message: `${action.apiKey.name} was created.` },
			};
		case "failed":
			return { ...state, creating: false, feedback: action.feedback };
		case "closed":
			return { ...state, created: undefined };
	}
}

export function CreateApiKeyFormSkeleton() {
	return (
		<SettingsRow
			label="Create an API key"
			hint={CREATE_API_KEY_HINT}
			control={
				<output className="flex w-full justify-end gap-3 sm:w-auto" aria-label="Loading API key controls">
					<span className="h-9 min-w-0 flex-1 animate-pulse rounded-2xl bg-muted sm:w-40" />
					<span className="h-9 w-32 animate-pulse rounded-2xl bg-muted" />
				</output>
			}
		/>
	);
}

export function CreateApiKeyForm() {
	const create = useServerFn(createApiKey);
	const router = useRouter();
	const [state, dispatch] = useReducer(createReducer, {
		name: "",
		creating: false,
		created: undefined,
		feedback: undefined,
	});
	const inFlight = useRef(false);
	const inputId = useId();

	async function submit(event: SyntheticEvent<HTMLFormElement, SubmitEvent>) {
		event.preventDefault();
		if (inFlight.current) return;
		inFlight.current = true;
		dispatch({ type: "started" });

		try {
			const created = await create({ data: { name: state.name } });
			dispatch({ type: "created", apiKey: { name: created.name, secret: created.secret } });
			try {
				await router.invalidate();
			} catch (error) {
				dispatch({
					type: "failed",
					feedback: {
						kind: "error",
						message: apiKeyActionError(error, `${created.name} was created, but the key list could not be refreshed.`),
					},
				});
			}
		} catch (error) {
			dispatch({
				type: "failed",
				feedback: { kind: "error", message: apiKeyActionError(error, "The API key could not be created.") },
			});
		} finally {
			inFlight.current = false;
		}
	}

	return (
		<>
			<SettingsRow
				label="Create an API key"
				labelFor={inputId}
				hint={CREATE_API_KEY_HINT}
				control={
					<form
						className="flex w-full flex-wrap justify-end gap-3 sm:w-auto"
						aria-busy={state.creating}
						onSubmit={submit}
					>
						<Input
							id={inputId}
							aria-label="Create an API key"
							className="min-w-0 flex-1"
							value={state.name}
							onChange={(event) => dispatch({ type: "nameChanged", name: event.target.value })}
							placeholder="Deploy workflow"
							maxLength={80}
							disabled={state.creating}
							required
						/>
						<Button type="submit" disabled={state.creating}>
							<KeyRound aria-hidden="true" /> {state.creating ? "Creating…" : "Create API key"}
						</Button>
					</form>
				}
			/>
			{state.feedback ? (
				<div className="px-5 pb-4 text-right">
					<ApiKeyFeedback feedback={state.feedback} />
				</div>
			) : null}
			{state.created ? (
				<CreatedApiKeyDialog
					key={state.created.secret}
					apiKey={state.created}
					onClose={() => dispatch({ type: "closed" })}
				/>
			) : null}
		</>
	);
}
