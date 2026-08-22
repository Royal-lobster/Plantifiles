import { Button } from "@plantifiles/ui/components/button";
import { createFileRoute } from "@tanstack/react-router";
import { CheckCircle2, Copy, TriangleAlert } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
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
	const [{ code, state, error }] = useState(search);
	const [copied, setCopied] = useState(false);
	const [copyFailed, setCopyFailed] = useState(false);
	const [ready, setReady] = useState(false);
	const authorizationCode = useMemo(
		() => (code && state ? new URLSearchParams({ code, state }).toString() : ""),
		[code, state],
	);

	useEffect(() => {
		window.history.replaceState(null, "", "/cli/callback");
		setReady(true);
	}, []);

	async function copyAuthorizationCode() {
		setCopyFailed(false);
		try {
			await Promise.race([
				navigator.clipboard.writeText(authorizationCode),
				new Promise<never>((_, reject) => {
					window.setTimeout(() => reject(new Error("Clipboard timed out")), 250);
				}),
			]);
			setCopied(true);
			return;
		} catch {
			const textarea = document.createElement("textarea");
			textarea.value = authorizationCode;
			textarea.style.position = "fixed";
			textarea.style.opacity = "0";
			document.body.insertAdjacentElement("beforeend", textarea);
			textarea.select();
			const copiedWithFallback = document.execCommand("copy");
			textarea.parentElement?.removeChild(textarea);
			setCopied(copiedWithFallback);
			setCopyFailed(!copiedWithFallback);
		}
	}

	return (
		<main className="flex min-h-screen flex-col px-6 py-8 sm:px-10">
			<div className="mx-auto flex w-full max-w-xl items-center gap-1.5">
				<LogoMark className="size-8 [&_svg]:size-7" />
				<span className="font-semibold text-base tracking-tight">Plantifiles</span>
			</div>
			<div className="flex flex-1 items-center py-12">
				<section className="mx-auto w-full max-w-xl">
					{authorizationCode && !error ? (
						<>
							<CheckCircle2 className="size-7 text-success" aria-hidden="true" />
							<p className="mt-5 font-mono text-muted-foreground text-xs uppercase tracking-widest">CLI authorized</p>
							<h1 className="mt-2 font-display font-medium text-4xl tracking-tight">Return to your terminal</h1>
							<p className="mt-4 max-w-measure text-muted-foreground leading-7">
								Copy this one-time authorization code and paste it into the waiting Plantifiles CLI.
							</p>
							<div className="mt-7 rounded-xl border bg-card p-4 shadow-sm">
								<code
									className="block max-h-32 overflow-auto break-all font-mono text-sm leading-6"
									data-testid="cli-authorization-code"
								>
									{authorizationCode}
								</code>
								<Button
									className="mt-4 w-full sm:w-auto"
									disabled={!ready}
									onClick={() => void copyAuthorizationCode()}
								>
									<Copy className="size-4" aria-hidden="true" />
									{copied ? "Copied" : "Copy authorization code"}
								</Button>
								{copyFailed ? (
									<p role="alert" className="mt-3 text-destructive text-sm">
										Copy failed. Select the authorization code above and copy it manually.
									</p>
								) : null}
							</div>
							<p className="mt-4 text-muted-foreground text-sm">
								This code can be used only by the login attempt that opened this page.
							</p>
						</>
					) : (
						<>
							<TriangleAlert className="size-7 text-destructive" aria-hidden="true" />
							<p className="mt-5 font-mono text-muted-foreground text-xs uppercase tracking-widest">
								Authorization failed
							</p>
							<h1 className="mt-2 font-display font-medium text-4xl tracking-tight">The CLI was not connected</h1>
							<p className="mt-4 max-w-measure text-muted-foreground leading-7">
								{error ?? "Clerk did not return a complete authorization response. Run `plantifiles login` again."}
							</p>
						</>
					)}
				</section>
			</div>
		</main>
	);
}
