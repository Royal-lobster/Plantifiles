import { type ClerkMiddlewareOptionsCallback, clerkMiddleware } from "@clerk/tanstack-react-start/server";
import { createCsrfMiddleware, createMiddleware, createStart } from "@tanstack/react-start";
import { getVars } from "#vars";

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

const callbackHeaders = createMiddleware().server(async ({ pathname, next }) => {
	const result = await next();
	if (pathname === "/cli/callback") {
		result.response.headers.set("cache-control", "no-store");
		result.response.headers.set("referrer-policy", "no-referrer");
		result.response.headers.set(
			"content-security-policy",
			"frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
		);
	}
	return result;
});

const csrfMiddleware = createCsrfMiddleware({
	filter: (context) => context.handlerType === "serverFn",
});

export const startInstance = createStart(() => ({
	requestMiddleware: [csrfMiddleware, callbackHeaders, clerkMiddleware(clerkOptions)],
}));
