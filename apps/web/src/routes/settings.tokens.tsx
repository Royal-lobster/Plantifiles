import { Button } from "@plantifiles/ui/components/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@plantifiles/ui/components/dialog";
import { Input } from "@plantifiles/ui/components/input";
import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Check, Copy, KeyRound, Trash2 } from "lucide-react";
import { Fragment, useId, useState } from "react";
import { formatUtcTimestamp } from "#/lib/format-time";
import { guardLoader } from "#/lib/loader-guard";
import { createTokenForPage, getTokensForPage, revokeTokenForPage } from "#/lib/token-data";
import { SettingsRow, SettingsRowDivider, SettingsSection } from "./-components/settings-section";

export const Route = createFileRoute("/settings/tokens")({
	loader: () => guardLoader(() => getTokensForPage()),
	component: TokenSettings,
	pendingComponent: () => <div className="h-64 animate-pulse rounded-lg bg-muted" />,
});

function TokenSettings() {
	const tokens = Route.useLoaderData();
	const createToken = useServerFn(createTokenForPage);
	const revokeToken = useServerFn(revokeTokenForPage);
	const router = useRouter();
	const [name, setName] = useState("");
	const [plaintext, setPlaintext] = useState<string>();
	const [copied, setCopied] = useState(false);
	const tokensSectionId = useId();

	return (
		<section className="space-y-8">
			<header>
				<h1 className="font-medium text-2xl tracking-tight">Agent tokens</h1>
				<p className="mt-1 text-muted-foreground text-sm">
					Tokens authenticate the CLI and MCP server. A plaintext token is shown once.
				</p>
			</header>

			<SettingsSection
				id={tokensSectionId}
				icon={KeyRound}
				title="Tokens"
				description="Create and revoke credentials for agents and command-line tools."
			>
				<SettingsRow
					label="Create a token"
					hint="Give each device or agent its own token so access can be revoked independently."
					control={
						<form
							className="flex w-full flex-wrap justify-end gap-2 sm:w-auto"
							onSubmit={async (event) => {
								event.preventDefault();
								const created = await createToken({ data: { name } });
								setPlaintext(created.token);
								setName("");
								await router.invalidate();
							}}
						>
							<Input
								className="min-w-0 flex-1"
								aria-label="Token name"
								value={name}
								onChange={(event) => setName(event.target.value)}
								placeholder="Claude Code on work laptop"
								required
							/>
							<Button type="submit">
								<KeyRound /> Create token
							</Button>
						</form>
					}
				/>
				<SettingsRowDivider />

				{tokens.length === 0 ? (
					<div className="px-4 py-8 text-center">
						<KeyRound className="mx-auto size-6 text-muted-foreground" />
						<p className="mt-2 font-medium text-sm">No API tokens yet</p>
						<p className="mt-1 text-muted-foreground text-xs">Create one above to connect an agent.</p>
					</div>
				) : (
					tokens.map((token, index) => (
						<Fragment key={token.id}>
							{index > 0 ? <SettingsRowDivider /> : null}
							<SettingsRow
								label={token.name}
								hint={token.lastUsedAt ? `Last used ${formatUtcTimestamp(token.lastUsedAt)}` : "Never used"}
								control={
									<Button
										variant="ghost"
										size="icon"
										aria-label={`Revoke ${token.name}`}
										onClick={async () => {
											await revokeToken({ data: { id: token.id } });
											await router.invalidate();
										}}
									>
										<Trash2 />
									</Button>
								}
							/>
						</Fragment>
					))
				)}
			</SettingsSection>

			<Dialog
				open={Boolean(plaintext)}
				onOpenChange={(open) => {
					if (!open) setPlaintext(undefined);
				}}
			>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>Copy this token now</DialogTitle>
						<DialogDescription>
							Plantifiles stores only its SHA-256 hash. It cannot reveal this value again.
						</DialogDescription>
					</DialogHeader>
					<div className="flex items-center gap-2 rounded-md border bg-muted/40 p-2 pl-3">
						<code className="min-w-0 flex-1 break-all font-mono text-xs">{plaintext}</code>
						<Button
							size="icon"
							variant="ghost"
							aria-label="Copy token"
							onClick={async () => {
								if (!plaintext) return;
								await navigator.clipboard.writeText(plaintext);
								setCopied(true);
							}}
						>
							{copied ? <Check /> : <Copy />}
						</Button>
					</div>
				</DialogContent>
			</Dialog>
		</section>
	);
}
