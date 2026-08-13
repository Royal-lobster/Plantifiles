import { Button } from "@plantifiles/ui/components/button";
import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { createAuthClient } from "better-auth/react";
import { Github } from "lucide-react";
import { useId, useReducer } from "react";
import { getLoginOptions, signInAsDemoUser } from "./-data/login-options";
import { LogoMark } from "../../components/brand";

const authClient = createAuthClient();

export const Route = createFileRoute("/login")({
	loader: () => getLoginOptions(),
	component: LoginPage,
});

type LoginState = { pending: "demo" | "github" | null; error: string };
type LoginAction =
	| { type: "started"; provider: "demo" | "github" }
	| { type: "failed"; message: string }
	| { type: "finished" };

function loginReducer(state: LoginState, action: LoginAction): LoginState {
	switch (action.type) {
		case "started":
			return { pending: action.provider, error: "" };
		case "failed":
			return { pending: null, error: action.message };
		case "finished":
			return { ...state, pending: null };
	}
}

function LoginPage() {
	const { localDev } = Route.useLoaderData();
	const router = useRouter();
	const demoSignIn = useServerFn(signInAsDemoUser);
	const [state, dispatch] = useReducer(loginReducer, { pending: null, error: "" });
	const errorId = useId();

	async function signInWithGitHub() {
		dispatch({ type: "started", provider: "github" });
		try {
			const result = await authClient.signIn.social({ provider: "github", callbackURL: "/" });
			if (result.error) {
				dispatch({ type: "failed", message: result.error.message || "GitHub sign-in failed. Please try again." });
				return;
			}
			dispatch({ type: "finished" });
		} catch {
			dispatch({ type: "failed", message: "GitHub sign-in failed. Please try again." });
		}
	}

	async function signInAsDemo() {
		dispatch({ type: "started", provider: "demo" });
		try {
			const result = await demoSignIn();
			await router.navigate({ to: "/w/$slug", params: { slug: result.workspaceSlug } });
		} catch (error) {
			dispatch({
				type: "failed",
				message: error instanceof Error ? error.message : "Demo sign-in failed. Please try again.",
			});
		}
	}
	return (
		<main className="grid min-h-screen place-items-center bg-background px-6">
			<section className="w-full max-w-sm space-y-6">
				<div className="space-y-3 text-center">
					<LogoMark className="mx-auto size-12 [&_svg]:size-10" />
					<div>
						<h1 className="font-semibold text-2xl tracking-tight">Sign in to Plantifiles</h1>
						<p className="mt-1 text-muted-foreground text-sm">Review agent plans without breaking the build loop.</p>
					</div>
				</div>
				<div className="space-y-3 rounded-lg border bg-card p-5 shadow-sm">
					<Button
						type="button"
						className="w-full"
						variant="outline"
						disabled={state.pending !== null}
						aria-describedby={state.error ? errorId : undefined}
						onClick={() => void signInWithGitHub()}
					>
						<Github /> {state.pending === "github" ? "Connecting to GitHub…" : "Continue with GitHub"}
					</Button>
					{state.error && (
						<p id={errorId} role="alert" className="text-destructive text-sm">
							{state.error}
						</p>
					)}
					{localDev && (
						<>
							<div className="flex items-center gap-3 text-muted-foreground text-xs">
								<span className="h-px flex-1 bg-border" />
								local development
								<span className="h-px flex-1 bg-border" />
							</div>
							<Button
								className="w-full"
								type="button"
								disabled={state.pending !== null}
								onClick={() => void signInAsDemo()}
							>
								{state.pending === "demo" ? "Signing in…" : "Sign in as Demo User"}
							</Button>
						</>
					)}
				</div>
			</section>
		</main>
	);
}
