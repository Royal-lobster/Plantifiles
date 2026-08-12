import { Button } from "@plantifiles/ui/components/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuRadioGroup,
	DropdownMenuRadioItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@plantifiles/ui/components/dropdown-menu";
import { TooltipProvider } from "@plantifiles/ui/components/tooltip";
import { cn } from "@plantifiles/ui/lib/utils";
import { Link, useRouterState } from "@tanstack/react-router";
import { Check, ChevronsUpDown, Palette, Slash } from "lucide-react";
import type { NavigationData } from "#/lib/app-data";
import { type Theme, useTheme } from "./theme-provider";

const NAV_LINKS = [
	{ label: "Plans", to: "/w/$slug", exact: true },
	{ label: "Decisions", to: "/w/$slug/decisions", exact: false },
	{ label: "Settings", to: "/w/$slug/settings", exact: false },
] as const;

const THEME_LABELS: Record<Theme, string> = {
	cream: "Cream",
	paper: "Paper",
	solarized: "Solarized",
	light: "Light",
	dark: "Dark",
	nord: "Nord",
	dracula: "Dracula",
	groove: "Gruvbox",
};

function workspaceFromPath(pathname: string): string | undefined {
	const segments = pathname.split("/");
	return segments[1] === "w" ? segments[2] : undefined;
}

function initials(value: string): string {
	return (
		value
			.split(/\s+/)
			.map((part) => part[0])
			.filter(Boolean)
			.slice(0, 2)
			.join("")
			.toUpperCase() || "?"
	);
}

function WorkspaceSwitcher({ navigation, workspaceSlug }: { navigation: NavigationData; workspaceSlug: string }) {
	const active = navigation.workspaces.find((item) => item.slug === workspaceSlug) ?? navigation.workspaces[0];
	if (!active) return null;
	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<Button variant="ghost" size="sm" className="gap-1.5 px-2 font-medium">
					{active.name}
					<ChevronsUpDown className="size-3.5 text-muted-foreground" />
				</Button>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="start" className="w-52">
				<DropdownMenuLabel className="label-eyebrow">Workspaces</DropdownMenuLabel>
				{navigation.workspaces.map((item) => (
					<DropdownMenuItem key={item.id} asChild>
						<Link to="/w/$slug" params={{ slug: item.slug }} className="justify-between">
							{item.name}
							{item.slug === active.slug && <Check className="size-3.5" />}
						</Link>
					</DropdownMenuItem>
				))}
			</DropdownMenuContent>
		</DropdownMenu>
	);
}

function ThemePicker() {
	const { theme, setTheme, themes } = useTheme();
	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<Button variant="ghost" size="icon" aria-label="Change theme">
					<Palette className="size-4" />
				</Button>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="end" className="w-40">
				<DropdownMenuLabel className="label-eyebrow">Theme</DropdownMenuLabel>
				<DropdownMenuRadioGroup value={theme} onValueChange={(value) => setTheme(value as Theme)}>
					{themes.map((name) => (
						<DropdownMenuRadioItem key={name} value={name}>
							{THEME_LABELS[name]}
						</DropdownMenuRadioItem>
					))}
				</DropdownMenuRadioGroup>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}

function UserMenu({ navigation }: { navigation: NavigationData }) {
	if (!navigation.user) {
		return (
			<Button variant="ghost" size="sm" asChild>
				<Link to="/login">Sign in</Link>
			</Button>
		);
	}
	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<Button
					variant="ghost"
					size="icon"
					className="rounded-full bg-muted font-medium text-[0.6875rem]"
					aria-label="Account"
				>
					{initials(navigation.user.name)}
				</Button>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="end" className="w-56">
				<DropdownMenuLabel className="font-normal">
					<span className="block font-medium">{navigation.user.name}</span>
					<span className="block text-muted-foreground text-xs">{navigation.user.email}</span>
				</DropdownMenuLabel>
				<DropdownMenuSeparator />
				<DropdownMenuItem asChild>
					<Link to="/settings/tokens">Agent tokens</Link>
				</DropdownMenuItem>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}

/**
 * Two-row chrome, the shape Vercel's dashboard uses: identity and account on the
 * top row, section tabs on a second row that owns the bottom border. The tabs
 * stay put while the page under them changes, so navigation never reflows.
 */
function AppShell({ navigation, children }: { navigation: NavigationData; children: React.ReactNode }) {
	const pathname = useRouterState({ select: (state) => state.location.pathname });
	const workspaceSlug = workspaceFromPath(pathname) ?? navigation.workspaces[0]?.slug;
	const chromeless = pathname === "/login";

	if (chromeless) return <main className="min-h-screen">{children}</main>;

	return (
		<TooltipProvider delayDuration={200}>
			<div className="min-h-screen">
				<header className="sticky top-0 z-40 border-b bg-background/85 backdrop-blur">
					<div className="mx-auto flex h-14 w-full max-w-shell items-center gap-1 px-4 sm:px-6">
						<Link to="/" className="flex items-center gap-2 font-medium tracking-tight">
							<span className="grid size-6 place-items-center rounded-md bg-primary font-mono text-[0.625rem] text-primary-foreground">
								P
							</span>
							<span className="hidden sm:inline">Plantifiles</span>
						</Link>
						{workspaceSlug && (
							<>
								<Slash className="size-3.5 -rotate-12 text-border" />
								<WorkspaceSwitcher navigation={navigation} workspaceSlug={workspaceSlug} />
							</>
						)}
						<div className="ml-auto flex items-center gap-1">
							<ThemePicker />
							<UserMenu navigation={navigation} />
						</div>
					</div>

					{workspaceSlug && (
						<nav className="mx-auto w-full max-w-shell px-4 sm:px-6" aria-label="Sections">
							<ul className="-mb-px flex gap-1 overflow-x-auto">
								{NAV_LINKS.map((item) => (
									<li key={item.label}>
										<Link
											to={item.to}
											params={{ slug: workspaceSlug }}
											activeOptions={{ exact: item.exact }}
											className="group block px-1 py-1.5"
										>
											{({ isActive }) => (
												<span
													className={cn(
														"block rounded-md px-2.5 py-1 text-muted-foreground text-sm transition-colors group-hover:bg-muted group-hover:text-foreground",
														isActive && "text-foreground",
													)}
												>
													{item.label}
													<span
														className={cn(
															"mt-1.5 -mb-[calc(0.375rem+1px)] block h-px",
															isActive ? "bg-foreground" : "bg-transparent",
														)}
													/>
												</span>
											)}
										</Link>
									</li>
								))}
							</ul>
						</nav>
					)}
				</header>
				<main className="mx-auto w-full max-w-shell px-4 py-8 sm:px-6">{children}</main>
			</div>
		</TooltipProvider>
	);
}

export { AppShell };
