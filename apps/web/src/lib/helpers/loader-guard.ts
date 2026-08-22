import { notFound, redirect } from "@tanstack/react-router";

/**
 * Server modules signal failure by throwing a `Response`, which is exactly right
 * for the API route handlers that return it verbatim. Inside a route loader the
 * same throw travels on into the router's dehydration step, where seroval cannot
 * serialize a `Response` and the request dies as a 500 instead of the status the
 * server module asked for.
 *
 * Wrap every loader that calls a `*.server.ts` function so those throws become
 * router-native control flow. A 403 deliberately becomes a 404 rather than a
 * distinct page, so a plan the viewer may not see does not confirm its own
 * existence.
 */
export async function guardLoader<T>(load: () => Promise<T>): Promise<T> {
	try {
		return await load();
	} catch (error) {
		if (!(error instanceof Response)) throw error;
		if (error.status === 401) throw redirect({ to: "/" });
		if (error.status === 403 || error.status === 404) throw notFound();
		throw error;
	}
}
