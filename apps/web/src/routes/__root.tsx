import "@fontsource-variable/geist";
import "@fontsource-variable/geist-mono";
import { ClerkProvider } from "@clerk/tanstack-react-start";
import { Button } from "@plantifiles/ui/components/button";
import {
	createRootRoute,
	type ErrorComponentProps,
	HeadContent,
	Link,
	Scripts,
	useRouter,
} from "@tanstack/react-router";
import type { ComponentProps, ReactNode } from "react";
import { useState } from "react";
import appCss from "../styles.css?url";
import { AppShell } from "./__root/-components/app-shell";
import { THEME_PREPAINT_SCRIPT } from "./__root/-components/theme-config";
import { ThemeProvider } from "./__root/-components/theme-provider";

const CLERK_APPEARANCE = {
	variables: {
		colorPrimary: "var(--brand-ink)",
		colorPrimaryForeground: "var(--background)",
		colorBackground: "var(--popover)",
		colorForeground: "var(--popover-foreground)",
		colorMutedForeground: "var(--muted-foreground)",
		colorInput: "var(--background)",
		colorInputForeground: "var(--foreground)",
		colorBorder: "var(--border)",
		colorRing: "var(--brand-ink)",
		colorDanger: "var(--destructive)",
		fontFamily: "var(--font-sans)",
		fontFamilyButtons: "var(--font-sans)",
		fontFamilyMono: "var(--font-mono)",
		spacing: "1rem",
		borderRadius: "0.375rem",
	},
} satisfies NonNullable<ComponentProps<typeof ClerkProvider>["appearance"]>;

export const Route = createRootRoute({
	head: () => ({
		meta: [
			{ charSet: "utf-8" },
			{ name: "viewport", content: "width=device-width, initial-scale=1" },
			{ title: "Plantifiles" },
			{ name: "description", content: "Agent-native plans, reviewed in place." },
		],
		links: [
			{ rel: "stylesheet", href: appCss },
			{ rel: "icon", type: "image/svg+xml", href: "/favicon.svg" },
		],
	}),
	shellComponent: RootDocument,
	errorComponent: AppError,
	notFoundComponent: NotFound,
});

function RootDocument({ children }: { children: ReactNode }) {
	return (
		<html lang="en" suppressHydrationWarning>
			<head>
				<script
					// biome-ignore lint/security/noDangerouslySetInnerHtml: must run before paint, so it cannot be a module
					dangerouslySetInnerHTML={{ __html: THEME_PREPAINT_SCRIPT }}
				/>
				<HeadContent />
			</head>
			<body>
				{import.meta.env.VITE_LOCAL_DEV === "true" ? (
					<ThemeProvider>
						<AppShell localDev>{children}</AppShell>
					</ThemeProvider>
				) : (
					<ClerkProvider appearance={CLERK_APPEARANCE}>
						<ThemeProvider>
							<AppShell>{children}</AppShell>
						</ThemeProvider>
					</ClerkProvider>
				)}
				<Scripts />
			</body>
		</html>
	);
}

function AppError({ reset }: ErrorComponentProps) {
	const router = useRouter();
	const [recovering, setRecovering] = useState(false);

	async function recover() {
		setRecovering(true);
		try {
			await router.invalidate();
			reset();
		} catch {
			setRecovering(false);
		}
	}

	return (
		<div role="alert" className="mx-auto max-w-[68ch] py-16">
			<p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Application error</p>
			<h1 className="mt-2 text-2xl font-semibold">Something went wrong</h1>
			<p className="mt-3 leading-7 text-muted-foreground">
				Plantifiles could not finish loading this page. Try again, or return home to continue elsewhere.
			</p>
			<div className="mt-6 flex flex-wrap gap-3">
				<Button type="button" disabled={recovering} onClick={() => void recover()}>
					{recovering ? "Trying again…" : "Try again"}
				</Button>
				<Button variant="outline" asChild>
					<Link to="/">Go to home</Link>
				</Button>
			</div>
		</div>
	);
}

function NotFound() {
	return (
		<div className="mx-auto max-w-[68ch] py-16">
			<p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">404</p>
			<h1 className="mt-2 text-2xl font-semibold">Nothing here</h1>
			<p className="mt-3 leading-7 text-muted-foreground">
				The page you requested could not be found or may no longer be available.
			</p>
			<Link to="/" className="mt-6 inline-block text-sm underline underline-offset-4">
				Go to home
			</Link>
		</div>
	);
}
