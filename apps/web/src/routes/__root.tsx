import "@fontsource-variable/inter";
import "@fontsource-variable/jetbrains-mono";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createRootRoute, HeadContent, Scripts } from "@tanstack/react-router";
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
});

function RootDocument({ children }: { children: ReactNode }) {
	const navigation = Route.useLoaderData();
	const [queryClient] = useState(() => new QueryClient({ defaultOptions: { queries: { staleTime: 30_000 } } }));
	return (
		<html lang="en" suppressHydrationWarning>
			<head>
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
