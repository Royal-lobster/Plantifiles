import { Button } from "@plantifiles/ui/components/button";
import { Input } from "@plantifiles/ui/components/input";
import { useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { KeyRound } from "lucide-react";
import { type SyntheticEvent, useId, useRef, useState } from "react";
import { SettingsRow } from "../../../../components/settings-section";
import { createApiKey } from "../-data/api-keys";
import { ApiKeyFeedback, type ApiKeyFeedbackValue, apiKeyActionError } from "./api-key-feedback";
import { CreatedApiKeyDialog } from "./created-api-key-dialog";

const CREATE_API_KEY_HINT = "Give each pipeline or headless agent its own key so access can be revoked independently.";

type CreatedApiKey = { name: string; secret: string };

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
	const [name, setName] = useState("");
	const [creating, setCreating] = useState(false);
	const [createdApiKey, setCreatedApiKey] = useState<CreatedApiKey>();
	const [feedback, setFeedback] = useState<ApiKeyFeedbackValue>();
	const inFlight = useRef(false);
	const inputId = useId();

	async function submit(event: SyntheticEvent<HTMLFormElement, SubmitEvent>) {
		event.preventDefault();
		if (inFlight.current) return;
		inFlight.current = true;
		setCreating(true);
		setFeedback(undefined);

		try {
			const result = await create({ data: { name } });
			const apiKey = { name: result.name, secret: result.secret };
			setName("");
			setCreatedApiKey(apiKey);
			setFeedback({ kind: "success", message: `${apiKey.name} was created.` });
			try {
				await router.invalidate();
			} catch (error) {
				setFeedback({
					kind: "error",
					message: apiKeyActionError(error, `${apiKey.name} was created, but the key list could not be refreshed.`),
				});
			}
		} catch (error) {
			setFeedback({
				kind: "error",
				message: apiKeyActionError(error, "The API key could not be created."),
			});
		} finally {
			setCreating(false);
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
					<form className="flex w-full flex-wrap justify-end gap-3 sm:w-auto" aria-busy={creating} onSubmit={submit}>
						<Input
							id={inputId}
							aria-label="Create an API key"
							className="min-w-0 flex-1"
							value={name}
							onChange={(event) => {
								setName(event.target.value);
								setFeedback(undefined);
							}}
							placeholder="Deploy workflow"
							maxLength={80}
							disabled={creating}
							required
						/>
						<Button type="submit" disabled={creating}>
							<KeyRound aria-hidden="true" /> {creating ? "Creating…" : "Create API key"}
						</Button>
					</form>
				}
			/>
			{feedback ? (
				<div className="px-5 pb-4 text-right">
					<ApiKeyFeedback feedback={feedback} />
				</div>
			) : null}
			{createdApiKey ? (
				<CreatedApiKeyDialog
					key={createdApiKey.secret}
					apiKey={createdApiKey}
					onClose={() => setCreatedApiKey(undefined)}
				/>
			) : null}
		</>
	);
}
