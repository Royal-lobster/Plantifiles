import { OrganizationSwitcher, Show, SignInButton, UserButton } from "@clerk/tanstack-react-start";
import { Button } from "@plantifiles/ui/components/button";
import { Link, useRouterState } from "@tanstack/react-router";
import { KeyRound, Moon, Sun } from "lucide-react";
import { LogoMark } from "../../../components/brand";
import { useTheme } from "./theme-provider";

/* The chrome carries the same language as the primitives: one soft hairline at
   the viewport edge, everything inside it a pill, and the reclaimed height
   spent on air rather than on rules. */
const HEADER = "sticky top-0 z-40 border-b border-foreground/[0.06] bg-background/70 backdrop-blur-xl";
const HEADER_BAR = "mx-auto flex h-16 w-full max-w-shell items-center gap-3 px-5 sm:px-8";
const MAIN = "mx-auto w-full max-w-shell px-5 py-12 sm:px-8";
const WORDMARK =
	"flex shrink-0 items-center gap-2.5 rounded-full font-semibold text-base tracking-tight outline-none focus-visible:ring-3 focus-visible:ring-ring/30";

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

function AppShell({ children }: { children: React.ReactNode }) {
	const pathname = useRouterState({ select: (state) => state.location.pathname });

	if (pathname === "/cli") return children;

	return (
		<div className="min-h-screen">
			<header className={HEADER}>
				<div className={HEADER_BAR}>
					<Link to="/" className={WORDMARK} aria-label="Plantifiles home">
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
									organizationSwitcherTrigger: "min-w-0 max-w-44 rounded-full sm:max-w-64",
									organizationPreviewMainIdentifier: "truncate",
									organizationSwitcherPopoverCard: { width: "20rem" },
								},
							}}
						/>
					</Show>

					<div className="ml-auto flex shrink-0 items-center gap-2">
						<Show when="signed-in">
							<Button variant="ghost" size="sm" asChild>
								<Link to="/settings/tokens" aria-label="Agent tokens">
									<KeyRound className="size-4" />
									<span className="hidden sm:inline">Agent tokens</span>
								</Link>
							</Button>
							<UserButton
								appearance={{
									elements: {
										userButtonPopoverCard: { width: "20rem" },
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
			<main className={MAIN}>{children}</main>
		</div>
	);
}

export { AppShell };
