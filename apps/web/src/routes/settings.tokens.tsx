import { Button } from "@plantifiles/ui/components/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@plantifiles/ui/components/dialog";
import { Input } from "@plantifiles/ui/components/input";
import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Check, Copy, KeyRound, Trash2 } from "lucide-react";
import { useState } from "react";
import { formatUtcTimestamp } from "#/lib/format-time";
import { guardLoader } from "#/lib/loader-guard";
import { createTokenForPage, getTokensForPage, revokeTokenForPage } from "#/lib/token-data";

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
	return (
		<section className="space-y-6">
			<header>
				<h1 className="font-medium text-2xl tracking-tight">Agent tokens</h1>
				<p className="mt-1 text-muted-foreground text-sm">
					Tokens authenticate the CLI and MCP server. A plaintext token is shown once.
				</p>
			</header>
			<form
				className="flex max-w-xl gap-2"
				onSubmit={async (event) => {
					event.preventDefault();
					const created = await createToken({ data: { name } });
					setPlaintext(created.token);
					setName("");
					await router.invalidate();
				}}
			>
				<Input
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
			<div className="overflow-hidden rounded-lg border bg-card">
				{tokens.length === 0 ? (
					<div className="p-8 text-center text-muted-foreground text-sm">No API tokens yet.</div>
				) : (
					tokens.map((token) => (
						<div key={token.id} className="flex h-14 items-center gap-3 border-b px-4 last:border-b-0">
							<KeyRound className="size-4 text-muted-foreground" />
							<span className="min-w-0 flex-1">
								<span className="block truncate font-medium text-sm">{token.name}</span>
								<span className="block text-muted-foreground text-xs">
									{token.lastUsedAt ? `Last used ${formatUtcTimestamp(token.lastUsedAt)}` : "Never used"}
								</span>
							</span>
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
						</div>
					))
				)}
			</div>
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
