import { OrganizationSwitcher, Show, SignInButton, UserButton } from "@clerk/tanstack-react-start";
import { Button } from "@plantifiles/ui/components/button";
import { Link, useRouterState } from "@tanstack/react-router";
import { KeyRound, Moon, Sun } from "lucide-react";
import { LogoMark } from "../../../components/brand";
import { useTheme } from "./theme-provider";

function ThemeToggle() {
	const { theme, setTheme } = useTheme();
	const dark = theme === "dark";
	return (
		<Button
			variant="ghost"
			size="icon"
			aria-label={dark ? "Use light theme" : "Use dark theme"}
			onClick={() => setTheme(dark ? "sprout" : "dark")}
		>
			{dark ? <Sun className="size-4" /> : <Moon className="size-4" />}
		</Button>
	);
}

function LocalDevShell({ children }: { children: React.ReactNode }) {
	return (
		<div className="min-h-screen">
			<header className="sticky top-0 z-40 border-b bg-background/85 backdrop-blur">
				<div className="mx-auto flex h-14 w-full max-w-shell items-center gap-2 px-4 sm:px-6">
					<Link
						to="/"
						className="flex shrink-0 items-center gap-1.5 font-semibold text-base tracking-tight"
						aria-label="Plantifiles home"
					>
						<LogoMark />
						<span className="hidden sm:inline">Plantifiles</span>
					</Link>
					<span className="truncate text-muted-foreground text-sm">Demo</span>
					<div className="ml-auto flex shrink-0 items-center gap-1">
						<Button variant="ghost" size="sm" asChild>
							<Link to="/settings/api-keys" aria-label="API keys">
								<KeyRound className="size-4" />
								<span className="hidden sm:inline">API keys</span>
							</Link>
						</Button>
						<ThemeToggle />
					</div>
				</div>
			</header>
			<main className="mx-auto w-full max-w-shell px-4 py-8 sm:px-6">{children}</main>
		</div>
	);
}

function AppShell({ children, localDev = false }: { children: React.ReactNode; localDev?: boolean }) {
	const pathname = useRouterState({ select: (state) => state.location.pathname });

	if (pathname === "/cli/callback") return children;
	if (localDev) return <LocalDevShell>{children}</LocalDevShell>;

	return (
		<div className="min-h-screen">
			<header className="sticky top-0 z-40 border-b bg-background/85 backdrop-blur">
				<div className="mx-auto flex h-14 w-full max-w-shell items-center gap-2 px-4 sm:px-6">
					<Link
						to="/"
						className="flex shrink-0 items-center gap-1.5 font-semibold text-base tracking-tight"
						aria-label="Plantifiles home"
					>
						<LogoMark />
						<span className="hidden sm:inline">Plantifiles</span>
					</Link>

					<Show when="signed-in">
						<OrganizationSwitcher
							hidePersonal
							organizationProfileMode="modal"
							createOrganizationMode="modal"
							afterCreateOrganizationUrl="/w/:slug"
							afterSelectOrganizationUrl="/w/:slug"
							appearance={{
								elements: {
									rootBox: "min-w-0",
									organizationSwitcherTrigger: {
										minWidth: 0,
										maxWidth: "min(16rem, 45vw)",
										height: "2rem",
										minHeight: "2rem",
										maxHeight: "2rem",
										padding: "0 0.75rem",
									},
									organizationPreviewMainIdentifier: "truncate",
									organizationSwitcherPopoverCard: { width: "20rem" },
									organizationSwitcherPopoverActionButton: {
										minHeight: "2.25rem",
										padding: "0.5rem 0.75rem",
									},
								},
							}}
							organizationProfileProps={{
								appearance: {
									elements: {
										card: { gridTemplateColumns: "11rem minmax(0, 1fr)" },
									},
								},
							}}
						/>
					</Show>

					<div className="ml-auto flex shrink-0 items-center gap-1">
						<Show when="signed-in">
							<Button variant="ghost" size="sm" asChild>
								<Link to="/settings/api-keys" aria-label="API keys">
									<KeyRound className="size-4" />
									<span className="hidden sm:inline">API keys</span>
								</Link>
							</Button>
							<UserButton
								appearance={{
									elements: {
										userButtonPopoverCard: { width: "20rem" },
										userPreview: { padding: "0.75rem 1rem" },
										userButtonPopoverActionButton: {
											minHeight: "2.25rem",
											padding: "0.5rem 0.75rem",
										},
									},
								}}
							/>
						</Show>
						<Show when="signed-out">
							<SignInButton mode="redirect">
								<Button size="sm">Sign in</Button>
							</SignInButton>
						</Show>
						<ThemeToggle />
					</div>
				</div>
			</header>
			<main className="mx-auto w-full max-w-shell px-4 py-8 sm:px-6">{children}</main>
		</div>
	);
}

export { AppShell };
