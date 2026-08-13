import { Button } from "@plantifiles/ui/components/button";
import { Input } from "@plantifiles/ui/components/input";
import { useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { KeyRound } from "lucide-react";
import { type SyntheticEvent, useId, useReducer, useRef } from "react";
import { SettingsRow } from "../../../../components/settings-section";
import { createTokenForPage } from "../-data/tokens";
import { CreatedTokenDialog } from "./created-token-dialog";
import { tokenActionError, TokenFeedback, type TokenFeedbackValue } from "./token-feedback";

type CreatedToken = { name: string; value: string };
type CreateState = {
	name: string;
	creating: boolean;
	created: CreatedToken | undefined;
	feedback: TokenFeedbackValue | undefined;
};

type CreateAction =
	| { type: "nameChanged"; name: string }
	| { type: "started" }
	| { type: "created"; token: CreatedToken }
	| { type: "failed"; feedback: TokenFeedbackValue }
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
				created: action.token,
				feedback: { kind: "success", message: `${action.token.name} was created.` },
			};
		case "failed":
			return { ...state, creating: false, feedback: action.feedback };
		case "closed":
			return { ...state, created: undefined };
	}
}

export function CreateTokenForm() {
	const createToken = useServerFn(createTokenForPage);
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
			const created = await createToken({ data: { name: state.name } });
			const token = { name: created.name, value: created.token };
			dispatch({ type: "created", token });
			try {
				await router.invalidate();
			} catch (error) {
				dispatch({
					type: "failed",
					feedback: {
						kind: "error",
						message: tokenActionError(error, `${created.name} was created, but the token list could not be refreshed.`),
					},
				});
			}
		} catch (error) {
			dispatch({
				type: "failed",
				feedback: { kind: "error", message: tokenActionError(error, "The token could not be created.") },
			});
		} finally {
			inFlight.current = false;
		}
	}

	return (
		<>
			<SettingsRow
				label="Create a token"
				labelFor={inputId}
				hint="Give each device or agent its own token so access can be revoked independently."
				control={
					<form
						className="flex w-full flex-wrap justify-end gap-2 sm:w-auto"
						aria-busy={state.creating}
						onSubmit={submit}
					>
						<Input
							id={inputId}
							aria-label="Create a token"
							className="min-w-0 flex-1"
							value={state.name}
							onChange={(event) => dispatch({ type: "nameChanged", name: event.target.value })}
							placeholder="Claude Code on work laptop"
							maxLength={80}
							disabled={state.creating}
							required
						/>
						<Button type="submit" disabled={state.creating}>
							<KeyRound aria-hidden="true" /> {state.creating ? "Creating…" : "Create token"}
						</Button>
					</form>
				}
			/>
			{state.feedback ? (
				<div className="px-4 pb-3 text-right">
					<TokenFeedback feedback={state.feedback} />
				</div>
			) : null}
			{state.created ? (
				<CreatedTokenDialog
					key={state.created.value}
					token={state.created}
					onClose={() => dispatch({ type: "closed" })}
				/>
			) : null}
		</>
	);
}
