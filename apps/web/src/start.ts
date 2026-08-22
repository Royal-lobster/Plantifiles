import { getVars } from "#vars";
import { type ClerkMiddlewareOptionsCallback, clerkMiddleware } from "@clerk/tanstack-react-start/server";
import { createStart } from "@tanstack/react-start";

const clerkOptions: ClerkMiddlewareOptionsCallback = async () => {
	const vars = await getVars(process.env);
	return {
		publishableKey: vars.CLERK_PUBLISHABLE_KEY,
		secretKey: vars.CLERK_SECRET_KEY.unwrap(),
		organizationSyncOptions: {
			organizationPatterns: ["/w/:slug", "/p/:slug/(.*)"],
		},
		signInFallbackRedirectUrl: "/",
		signUpFallbackRedirectUrl: "/",
	};
};

export const startInstance = createStart(() => ({
	requestMiddleware: [clerkMiddleware(clerkOptions)],
}));
