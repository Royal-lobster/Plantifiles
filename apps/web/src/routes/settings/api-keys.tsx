import { Button } from "@plantifiles/ui/components/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@plantifiles/ui/components/dialog";
import { Input } from "@plantifiles/ui/components/input";
import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Copy, KeyRound, Trash2 } from "lucide-react";
import { type SyntheticEvent, useState } from "react";
import { formatUtcTimestamp } from "#/lib/helpers/format-time";
import { guardLoader } from "#/lib/helpers/loader-guard";
import { createApiKey, listApiKeys, revokeApiKey } from "./api-keys/-data/api-keys";

export const Route = createFileRoute("/settings/api-keys")({
	loader: () => guardLoader(() => listApiKeys()),
	component: ApiKeySettings,
});

type CreatedKey = { name: string; secret: string; expiration: number | null };

function ApiKeySettings() {
	const data = Route.useLoaderData();
	const createKey = useServerFn(createApiKey);
	const revokeKey = useServerFn(revokeApiKey);
	const router = useRouter();
	const [name, setName] = useState("");
	const [description, setDescription] = useState("");
	const [created, setCreated] = useState<CreatedKey | null>(null);
	const [busyId, setBusyId] = useState<string | null>(null);
	const [error, setError] = useState("");

	async function create(event: SyntheticEvent<HTMLFormElement, SubmitEvent>) {
		event.preventDefault();
		setError("");
		setBusyId("create");
		try {
			const result = await createKey({ data: { name, ...(description ? { description } : {}) } });
			setCreated(result);
			setName("");
			setDescription("");
			await router.invalidate();
		} catch (caught) {
			setError(caught instanceof Error ? caught.message : "Clerk could not create the API key.");
		} finally {
			setBusyId(null);
		}
	}

	async function revoke(id: string) {
		setError("");
		setBusyId(id);
		try {
			await revokeKey({ data: { id } });
			await router.invalidate();
		} catch (caught) {
			setError(caught instanceof Error ? caught.message : "Clerk could not revoke the API key.");
		} finally {
			setBusyId(null);
		}
	}

	return (
		<section className="mx-auto max-w-3xl">
			<p className="font-mono text-muted-foreground text-xs uppercase tracking-widest">Automation</p>
			<h1 className="mt-2 font-display font-medium text-4xl tracking-tight">API keys</h1>
			<p className="mt-3 max-w-measure text-muted-foreground leading-7">
				Create a user-scoped key for CI, remote agents, or another environment where interactive OAuth is unavailable.
			</p>

			{data.enabled ? (
				<>
					<form
						className="mt-8 grid gap-3 rounded-xl border bg-card p-5 sm:grid-cols-[1fr_1.5fr_auto]"
						onSubmit={create}
					>
						<label className="grid gap-1.5 font-medium text-sm">
							Name
							<Input
								value={name}
								maxLength={80}
								required
								placeholder="Deploy workflow"
								onChange={(event) => setName(event.target.value)}
							/>
						</label>
						<label className="grid gap-1.5 font-medium text-sm">
							Description <span className="font-normal text-muted-foreground">(optional)</span>
							<Input
								value={description}
								maxLength={200}
								placeholder="Publishes approved plans"
								onChange={(event) => setDescription(event.target.value)}
							/>
						</label>
						<Button className="self-end" disabled={busyId !== null}>
							{busyId === "create" ? "Creating…" : "Create key"}
						</Button>
					</form>

					{error ? (
						<p
							role="alert"
							className="mt-4 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-destructive text-sm"
						>
							{error}
						</p>
					) : null}

					<div className="mt-8 space-y-3">
						{data.keys.length ? (
							data.keys.map((key) => (
								<article
									key={key.id}
									className="flex flex-col gap-4 rounded-xl border bg-card p-5 sm:flex-row sm:items-center"
								>
									<KeyRound className="size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
									<div className="min-w-0 flex-1">
										<h2 className="truncate font-medium">{key.name}</h2>
										<p className="mt-1 text-muted-foreground text-sm">
											{key.description || "Read and write Plantifiles plans"}
										</p>
										<p className="mt-2 font-mono text-muted-foreground text-xs">
											Expires {key.expiration ? formatUtcTimestamp(new Date(key.expiration)) : "never"} · Last used{" "}
											{key.lastUsedAt ? formatUtcTimestamp(new Date(key.lastUsedAt)) : "never"}
										</p>
									</div>
									<Button
										type="button"
										variant="outline"
										disabled={busyId !== null}
										onClick={() => void revoke(key.id)}
									>
										<Trash2 className="size-4" aria-hidden="true" />
										{busyId === key.id ? "Revoking…" : "Revoke"}
									</Button>
								</article>
							))
						) : (
							<p className="rounded-xl border border-dashed px-5 py-10 text-center text-muted-foreground">
								No API keys yet.
							</p>
						)}
					</div>
				</>
			) : (
				<p className="mt-8 rounded-xl border border-dashed px-5 py-10 text-center text-muted-foreground">
					API-key management is available in a deployed Clerk environment.
				</p>
			)}

			<Dialog
				open={created !== null}
				onOpenChange={(open) => {
					if (!open) setCreated(null);
				}}
			>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>Copy {created?.name}</DialogTitle>
						<DialogDescription>
							Clerk shows this secret once. Store it in your CI or agent secret manager now.
						</DialogDescription>
					</DialogHeader>
					<code className="max-h-32 overflow-auto break-all rounded-md border bg-muted p-3 font-mono text-sm">
						{created?.secret}
					</code>
					<Button disabled={!created} onClick={() => created && void navigator.clipboard.writeText(created.secret)}>
						<Copy className="size-4" aria-hidden="true" />
						Copy API key
					</Button>
				</DialogContent>
			</Dialog>
		</section>
	);
}
