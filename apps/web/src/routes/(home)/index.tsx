import { RedirectToSignIn, useClerk } from "@clerk/tanstack-react-start";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { useEffect } from "react";
import { getLandingDestination } from "./-data/landing";

export const Route = createFileRoute("/(home)/")({
	loader: async () => {
		const destination = await getLandingDestination();
		if (destination.kind === "workspace") {
			throw redirect({
				to: "/w/$slug",
				params: { slug: destination.slug },
			});
		}
		return destination;
	},
	component: HomeRedirect,
});

function OrganizationCreationRedirect() {
	const clerk = useClerk();
	useEffect(() => {
		void clerk.redirectToCreateOrganization();
	}, [clerk]);
	return null;
}

function HomeRedirect() {
	const destination = Route.useLoaderData();
	if (import.meta.env.DEV) {
		return (
			<section className="mx-auto max-w-xl py-16">
				<h1 className="font-medium text-2xl tracking-tight">Local demo</h1>
				<p className="mt-3 text-muted-foreground">
					Set the seeded <code className="font-mono">pf_dev_user=user_demo</code> cookie, then reload.
				</p>
			</section>
		);
	}
	return destination.kind === "sign-in" ? <RedirectToSignIn /> : <OrganizationCreationRedirect />;
}
