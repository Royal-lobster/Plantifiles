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
	return destination.kind === "sign-in" ? <RedirectToSignIn /> : <OrganizationCreationRedirect />;
}
