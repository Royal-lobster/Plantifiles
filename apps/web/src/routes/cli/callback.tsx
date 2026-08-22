import { Button } from "@plantifiles/ui/components/button";
import { createFileRoute } from "@tanstack/react-router";
import { Check, CheckCircle2, Copy, TriangleAlert } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useClipboard } from "#/lib/helpers/use-clipboard";
import { LogoMark } from "../../components/brand";

const callbackSearch = (search: Record<string, unknown>) => ({
	code: typeof search.code === "string" ? search.code : undefined,
	state: typeof search.state === "string" ? search.state : undefined,
	error:
		typeof search.error_description === "string"
			? search.error_description
			: typeof search.error === "string"
				? search.error
				: undefined,
});

export const Route = createFileRoute("/cli/callback")({
	validateSearch: callbackSearch,
	component: CliCallbackPage,
});

function CliCallbackPage() {
	const search = Route.useSearch();
	/* Snapshotted on first render because the effect below strips the query from
	   the address bar, which re-runs `useSearch` with an empty response. */
	const [{ code, state, error }] = useState(search);
	const clipboard = useClipboard();
	const authorizationCode = useMemo(
		() => (code && state ? new URLSearchParams({ code, state }).toString() : ""),
		[code, state],
	);

	useEffect(() => {
		window.history.replaceState(null, "", "/cli/callback");
	}, []);

	return (
		<main className="flex min-h-screen flex-col px-6 py-8 sm:px-10">
			<div className="mx-auto flex w-full max-w-md items-center gap-1.5">
				<LogoMark className="size-8 [&_svg]:size-7" />
				<span className="font-semibold text-base tracking-tight">Plantifiles</span>
			</div>

			<div className="flex flex-1 items-center py-12">
				<div className="mx-auto w-full max-w-md">
					{authorizationCode && !error ? (
						<section>
							<CheckCircle2 className="size-6 text-success" aria-hidden="true" />
							<p className="label-eyebrow mt-6">CLI authorized</p>
							<h1 className="mt-2 font-display font-medium text-3xl tracking-tight">Return to your terminal</h1>
							<p className="mt-4 text-muted-foreground leading-7">
								Paste this one-time authorization code into the waiting Plantifiles CLI. It only completes the login
								that opened this page, and it cannot be reused.
							</p>

							<div className="surface-inset mt-8 flex items-center gap-2 p-2 pl-4">
								<code className="min-w-0 flex-1 break-all font-mono text-xs" data-testid="cli-authorization-code">
									{authorizationCode}
								</code>
								<Button
									size="icon"
									variant="ghost"
									aria-label={clipboard.status === "copied" ? "Authorization code copied" : "Copy authorization code"}
									onClick={() => void clipboard.copy(authorizationCode)}
								>
									{clipboard.status === "copied" ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
								</Button>
							</div>

							{clipboard.status === "error" ? (
								<p role="alert" className="mt-4 text-destructive text-sm">
									The code could not be copied. Select it above and copy it manually.
								</p>
							) : null}
						</section>
					) : (
						<section>
							<TriangleAlert className="size-6 text-destructive" aria-hidden="true" />
							<p className="label-eyebrow mt-6">Authorization failed</p>
							<h1 className="mt-2 font-display font-medium text-3xl tracking-tight">The CLI was not connected</h1>
							<p className="mt-4 text-muted-foreground leading-7">
								{error ?? "Clerk did not return a complete authorization response."} Run{" "}
								<code className="font-mono">plantifiles login</code> again.
							</p>
						</section>
					)}
				</div>
			</div>
		</main>
	);
}
