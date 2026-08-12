import { Button } from "@plantifiles/ui/components/button";
import { Input } from "@plantifiles/ui/components/input";
import { createFileRoute, redirect, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useId, useState } from "react";
import { createWorkspace, getNavigationData } from "#/lib/app-data";

export const Route = createFileRoute("/")({
	loader: async () => {
		const navigation = await getNavigationData();
		if (!navigation.user) throw redirect({ to: "/login" });
		const first = navigation.workspaces[0];
		if (first) throw redirect({ to: "/w/$slug", params: { slug: first.slug } });
		return navigation;
	},
	component: Onboarding,
});

function Onboarding() {
	const create = useServerFn(createWorkspace);
	const router = useRouter();
	const [name, setName] = useState("");
	const [slug, setSlug] = useState("");
	const [error, setError] = useState<string>();
	const nameId = useId();
	const slugId = useId();
	return (
		<section className="mx-auto max-w-md space-y-6 py-16">
			<div className="space-y-2">
				<p className="label-eyebrow">First workspace</p>
				<h1 className="font-display font-medium text-3xl tracking-tight">Where does planning happen?</h1>
				<p className="text-muted-foreground">Create the workspace your agents will publish into.</p>
			</div>
			<form
				className="space-y-4 rounded-lg border bg-card p-5"
				onSubmit={async (event) => {
					event.preventDefault();
					try {
						const result = await create({ data: { name, slug } });
						await router.navigate({ to: "/w/$slug", params: { slug: result.slug } });
					} catch (caught) {
						setError(caught instanceof Error ? caught.message : "Could not create workspace.");
					}
				}}
			>
				<label className="grid gap-1.5 font-medium text-sm" htmlFor={nameId}>
					Name
				</label>
				<Input id={nameId} value={name} onChange={(event) => setName(event.target.value)} required />
				<label className="grid gap-1.5 font-medium text-sm" htmlFor={slugId}>
					Slug
				</label>
				<Input
					id={slugId}
					value={slug}
					onChange={(event) => setSlug(event.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-"))}
					required
				/>
				{error && <p className="text-destructive text-sm">{error}</p>}
				<Button type="submit" className="w-full">
					Create workspace
				</Button>
			</form>
		</section>
	);
}
