import "@fontsource-variable/geist";
import "@fontsource-variable/geist-mono";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createRootRoute, HeadContent, Link, Scripts } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { useState } from "react";
import { getNavigationData } from "#/lib/app-data";
import appCss from "../styles.css?url";
import { AppShell } from "./-components/app-shell";
import { ThemeProvider } from "./-components/theme-provider";

export const Route = createRootRoute({
	loader: () => getNavigationData(),
	head: () => ({
		meta: [
			{ charSet: "utf-8" },
			{ name: "viewport", content: "width=device-width, initial-scale=1" },
			{ title: "Plantifiles" },
			{ name: "description", content: "Agent-native plans, reviewed in place." },
		],
		links: [{ rel: "stylesheet", href: appCss }],
	}),
	shellComponent: RootDocument,
	notFoundComponent: NotFound,
});

function RootDocument({ children }: { children: ReactNode }) {
	const navigation = Route.useLoaderData();
	const [queryClient] = useState(() => new QueryClient({ defaultOptions: { queries: { staleTime: 30_000 } } }));
	return (
		<html lang="en" suppressHydrationWarning>
			<head>
				{/* Resolve the theme before first paint. Without this the server sends
				    no palette class, the page paints in the default tokens, and
				    hydration then repaints. Must stay in step with THEME_CLASSES. */}
				<script
					// biome-ignore lint/security/noDangerouslySetInnerHtml: must run before paint, so it cannot be a module
					dangerouslySetInnerHTML={{
						__html:
							"try{var m={cream:['theme-cream'],paper:['theme-paper'],solarized:['theme-solarized']," +
							"light:[],dark:['dark'],nord:['theme-nord','dark'],dracula:['theme-dracula','dark']," +
							"groove:['theme-groove','dark']};" +
							"var t=localStorage.getItem('plantifiles-theme');if(!m[t])t='cream';" +
							"var c=m[t],r=document.documentElement;" +
							"if(c.length)r.classList.add.apply(r.classList,c);" +
							"r.style.colorScheme=c.indexOf('dark')>-1?'dark':'light';}catch(e){}",
					}}
				/>
				<HeadContent />
			</head>
			<body>
				<QueryClientProvider client={queryClient}>
					<ThemeProvider>
						<AppShell navigation={navigation}>{children}</AppShell>
					</ThemeProvider>
				</QueryClientProvider>
				<Scripts />
			</body>
		</html>
	);
}

function NotFound() {
	return (
		<div className="mx-auto max-w-[68ch] py-16">
			<p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">404</p>
			<h1 className="mt-2 text-2xl font-semibold">Nothing here</h1>
			<p className="mt-3 leading-7 text-muted-foreground">
				This plan either does not exist, or it is not visible to you.
			</p>
			<Link to="/" className="mt-6 inline-block text-sm underline underline-offset-4">
				Back to your workspace
			</Link>
		</div>
	);
}
