import { Button } from "@plantifiles/ui/components/button";
import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { createAuthClient } from "better-auth/react";
import { Github } from "lucide-react";
import { useId, useReducer } from "react";
import { LogoMark } from "../../components/brand";
import { LoopPanel } from "./-components/loop-panel";
import { getLoginOptions, signInAsDemoUser } from "./-data/login-options";

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
		<main className="grid min-h-screen lg:grid-cols-2">
			<div className="flex flex-col px-6 py-8 sm:px-10 lg:px-14">
				<div className="mx-auto flex w-full max-w-sm items-center gap-1.5">
					<LogoMark className="size-8 [&_svg]:size-7" />
					<span className="font-semibold text-base tracking-tight">Plantifiles</span>
				</div>

				<div className="flex flex-1 items-center py-12">
					<div className="mx-auto w-full max-w-sm">
						<h1 className="font-display font-medium text-3xl tracking-tight">Sign in to Plantifiles</h1>
						<p className="mt-3 text-muted-foreground leading-7">
							Your agents publish plans here. You settle the open decisions and approve a version; the next session
							builds from the copy you approved.
						</p>

						<Button
							type="button"
							size="lg"
							className="mt-8 w-full"
							disabled={state.pending !== null}
							aria-describedby={state.error ? errorId : undefined}
							onClick={() => void signInWithGitHub()}
						>
							<Github /> {state.pending === "github" ? "Connecting to GitHub…" : "Continue with GitHub"}
						</Button>
						{/* The OAuth scope really is just user:email, so say so where the
						    decision to click is being made. */}
						<p className="mt-3 text-muted-foreground text-xs leading-5">
							GitHub is the only sign-in for now. Plantifiles reads your name, avatar, and email address — never your
							repositories.
						</p>
						{state.error && (
							<p
								id={errorId}
								role="alert"
								className="mt-4 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-destructive text-sm"
							>
								{state.error}
							</p>
						)}
						{localDev && (
							<>
								<div className="mt-8 flex items-center gap-3">
									<span className="h-px flex-1 bg-border" />
									<span className="label-eyebrow">local development</span>
									<span className="h-px flex-1 bg-border" />
								</div>
								<Button
									className="mt-4 w-full"
									variant="outline"
									type="button"
									disabled={state.pending !== null}
									onClick={() => void signInAsDemo()}
								>
									{state.pending === "demo" ? "Signing in…" : "Sign in as Demo User"}
								</Button>
							</>
						)}
					</div>
				</div>

				<p className="label-eyebrow mx-auto hidden w-full max-w-sm lg:block">Plan review for coding agents</p>
			</div>

			<LoopPanel />
		</main>
	);
}
