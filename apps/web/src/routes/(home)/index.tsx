import { Button } from "@plantifiles/ui/components/button";
import { Input } from "@plantifiles/ui/components/input";
import { InputGroup, InputGroupAddon, InputGroupInput, InputGroupText } from "@plantifiles/ui/components/input-group";
import { Label } from "@plantifiles/ui/components/label";
import { createFileRoute, redirect, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { type SyntheticEvent, useId, useReducer, useRef } from "react";
import { getNavigationData } from "../__root/-data/navigation";
import { createWorkspace } from "./-data/onboarding";

export const Route = createFileRoute("/(home)/")({
	loader: async () => {
		const navigation = await getNavigationData();
		if (!navigation.user) throw redirect({ to: "/login" });
		const first = navigation.workspaces[0];
		if (first) throw redirect({ to: "/w/$slug", params: { slug: first.slug } });
		return navigation;
	},
	component: Onboarding,
});

/** Full slug: what a name turns into, with nothing left dangling. */
function slugFromName(value: string): string {
	return value
		.normalize("NFKD")
		.replace(/[\u0300-\u036f]/g, "")
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "")
		.slice(0, 48);
}

/**
 * Typed slug: same rules, except a trailing dash survives. Trimming it on every
 * keystroke would make "acme-" impossible to extend into "acme-platform".
 */
function slugFromInput(value: string): string {
	return value
		.toLowerCase()
		.replace(/[^a-z0-9-]+/g, "-")
		.replace(/-{2,}/g, "-")
		.replace(/^-+/, "")
		.slice(0, 48);
}

type OnboardingState = { name: string; slug: string; slugEdited: boolean; creating: boolean; error: string };
type OnboardingAction =
	| { type: "nameChanged"; name: string }
	| { type: "slugChanged"; slug: string }
	| { type: "started" }
	| { type: "failed"; message: string };

function onboardingReducer(state: OnboardingState, action: OnboardingAction): OnboardingState {
	switch (action.type) {
		case "nameChanged":
			// The slug follows the name until someone takes it over by hand.
			return {
				...state,
				name: action.name,
				slug: state.slugEdited ? state.slug : slugFromName(action.name),
				error: "",
			};
		case "slugChanged":
			return { ...state, slug: slugFromInput(action.slug), slugEdited: true, error: "" };
		case "started":
			return { ...state, creating: true, error: "" };
		case "failed":
			return { ...state, creating: false, error: action.message };
	}
}

function Onboarding() {
	const create = useServerFn(createWorkspace);
	const router = useRouter();
	const [state, dispatch] = useReducer(onboardingReducer, {
		name: "",
		slug: "",
		slugEdited: false,
		creating: false,
		error: "",
	});
	const inFlight = useRef(false);
	const nameId = useId();
	const slugId = useId();
	const errorId = useId();

	const slug = state.slug.replace(/-+$/, "");
	const canSubmit = state.name.trim().length > 0 && slug.length > 0;

	async function submit(event: SyntheticEvent<HTMLFormElement, SubmitEvent>) {
		event.preventDefault();
		if (inFlight.current || !canSubmit) return;
		inFlight.current = true;
		dispatch({ type: "started" });
		try {
			const result = await create({ data: { name: state.name.trim(), slug } });
			await router.navigate({ to: "/w/$slug", params: { slug: result.slug } });
		} catch (error) {
			dispatch({
				type: "failed",
				message: error instanceof Error ? error.message : "Could not create the workspace. Try again.",
			});
		} finally {
			inFlight.current = false;
		}
	}

	return (
		<section className="mx-auto max-w-xl py-10">
			<p className="label-eyebrow">First workspace</p>
			<h1 className="mt-3 font-display font-medium text-3xl tracking-tight">Where does planning happen?</h1>
			<p className="mt-3 text-muted-foreground leading-7">
				A workspace holds your plans, the people who review them, and the approval gate they have to clear. One is
				usually enough — you can add more later.
			</p>

			<form className="mt-8 space-y-6 rounded-xl border bg-card p-6" aria-busy={state.creating} onSubmit={submit}>
				<div className="space-y-2">
					<Label htmlFor={nameId}>Name</Label>
					<Input
						id={nameId}
						value={state.name}
						onChange={(event) => dispatch({ type: "nameChanged", name: event.target.value })}
						placeholder="Acme Platform"
						maxLength={60}
						autoComplete="off"
						disabled={state.creating}
						required
					/>
					<p className="text-muted-foreground text-xs">Shown in the workspace switcher and on every plan.</p>
				</div>

				<div className="space-y-2">
					<Label htmlFor={slugId}>URL</Label>
					{/* Typing the name fills this in, so the second field is a confirmation
					    rather than a second decision. */}
					<InputGroup>
						<InputGroupAddon>
							<InputGroupText className="font-mono">/w/</InputGroupText>
						</InputGroupAddon>
						<InputGroupInput
							id={slugId}
							value={state.slug}
							onChange={(event) => dispatch({ type: "slugChanged", slug: event.target.value })}
							placeholder="acme-platform"
							className="font-mono"
							autoComplete="off"
							spellCheck={false}
							disabled={state.creating}
							required
						/>
					</InputGroup>
					<p className="text-muted-foreground text-xs">
						Lowercase letters, numbers, and dashes. Agents pass it to <code className="font-mono">--workspace</code>.
					</p>
				</div>

				{state.error && (
					<p
						id={errorId}
						role="alert"
						className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-destructive text-sm"
					>
						{state.error}
					</p>
				)}

				<Button
					type="submit"
					className="w-full"
					disabled={!canSubmit || state.creating}
					aria-describedby={state.error ? errorId : undefined}
				>
					{state.creating ? "Creating…" : "Create workspace"}
				</Button>
			</form>

			<div className="mt-6 rounded-lg border border-dashed bg-muted/30 p-4">
				<p className="label-eyebrow">Then</p>
				<p className="mt-2 text-muted-foreground text-sm leading-6">
					Publishing is the CLI's job. Run this from the agent session that wrote the plan.
				</p>
				<code className="mt-3 block overflow-x-auto whitespace-nowrap rounded-md border bg-background/60 px-3 py-2 font-mono text-xs">
					plantifiles push plan.mdx --workspace {slug || "your-workspace"}
				</code>
			</div>
		</section>
	);
}
