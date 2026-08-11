import { Button } from "@plantifiles/ui/components/button";
import { createFileRoute } from "@tanstack/react-router";
import { createAuthClient } from "better-auth/react";
import { Github } from "lucide-react";
import { getLoginOptions } from "#/lib/app-data";

const authClient = createAuthClient();

export const Route = createFileRoute("/login")({
	loader: () => getLoginOptions(),
	component: LoginPage,
});

function LoginPage() {
	const { localDev } = Route.useLoaderData();
	return (
		<main className="grid min-h-screen place-items-center bg-background px-6">
			<section className="w-full max-w-sm space-y-6">
				<div className="space-y-3 text-center">
					<span className="mx-auto flex size-10 items-center justify-center rounded-lg bg-primary font-mono text-primary-foreground text-sm">
						P/
					</span>
					<div>
						<h1 className="font-semibold text-2xl tracking-tight">Sign in to Plantifiles</h1>
						<p className="mt-1 text-muted-foreground text-sm">Review agent plans without breaking the build loop.</p>
					</div>
				</div>
				<div className="space-y-3 rounded-lg border bg-card p-5 shadow-sm">
					<Button
						className="w-full"
						variant="outline"
						onClick={() => void authClient.signIn.social({ provider: "github", callbackURL: "/" })}
					>
						<Github /> Continue with GitHub
					</Button>
					{localDev && (
						<>
							<div className="flex items-center gap-3 text-muted-foreground text-xs">
								<span className="h-px flex-1 bg-border" />
								local development
								<span className="h-px flex-1 bg-border" />
							</div>
							<form method="post" action="/api/dev/sign-in">
								<Button className="w-full" type="submit">
									Sign in as Demo User
								</Button>
							</form>
						</>
					)}
				</div>
			</section>
		</main>
	);
}
