import { Button } from "@plantifiles/ui/components/button";
import {
	Command,
	CommandEmpty,
	CommandGroup,
	CommandInput,
	CommandItem,
	CommandList,
} from "@plantifiles/ui/components/command";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@plantifiles/ui/components/dialog";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@plantifiles/ui/components/dropdown-menu";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@plantifiles/ui/components/sheet";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@plantifiles/ui/components/tooltip";
import { cn } from "@plantifiles/ui/lib/utils";
import { Link, useRouter, useRouterState } from "@tanstack/react-router";
import {
	CheckCircle2,
	ChevronsUpDown,
	Download,
	FileText,
	Menu,
	Moon,
	Search,
	Settings,
	Sun,
	UserRound,
	Waypoints,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { NavigationData } from "#/lib/app-data";
import { useTheme } from "./theme-provider";

const NAV_LINKS = [
	{ label: "Plans", to: "/w/$slug", icon: FileText, exact: true },
	{ label: "Decisions", to: "/w/$slug/decisions", icon: Waypoints, exact: false },
	{ label: "Settings", to: "/w/$slug/settings", icon: Settings, exact: false },
] as const;

function workspaceFromPath(pathname: string): string | undefined {
	const segments = pathname.split("/");
	return segments[1] === "w" || segments[1] === "p" ? segments[2] : undefined;
}

function initials(value: string): string {
	return value
		.split(/[\s-]+/)
		.slice(0, 2)
		.map((part) => part.slice(0, 1).toUpperCase())
		.join("");
}

/**
 * The left rail is a spine, not a labelled nav sidebar: a mark, the workspace,
 * three destinations, and the viewer. Naming every destination in 14 characters
 * of chrome is what makes an app look like a dashboard template, and the width
 * it costs is width the document wants for its margin.
 */
function NavSpine({ navigation, workspaceSlug }: { navigation: NavigationData; workspaceSlug: string }) {
	const workspace = navigation.workspaces.find((item) => item.slug === workspaceSlug);
	return (
		<div className="flex h-full w-14 flex-col items-center gap-1 border-r bg-sidebar py-3 text-sidebar-foreground">
			<Tooltip>
				<TooltipTrigger asChild>
					<Link
						to="/"
						className="flex size-8 items-center justify-center rounded-md bg-primary font-mono font-semibold text-[11px] text-primary-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-sidebar"
					>
						P/
					</Link>
				</TooltipTrigger>
				<TooltipContent side="right">Plantifiles</TooltipContent>
			</Tooltip>

			<div className="my-2 h-px w-6 bg-sidebar-border" />

			<DropdownMenu>
				<Tooltip>
					<TooltipTrigger asChild>
						<DropdownMenuTrigger asChild>
							<button
								type="button"
								className="flex size-8 items-center justify-center rounded-md border border-sidebar-border bg-background font-mono font-medium text-[11px] outline-none transition-colors hover:border-input focus-visible:ring-2 focus-visible:ring-ring"
								aria-label={`Workspace: ${workspace?.name ?? workspaceSlug}`}
							>
								{initials(workspace?.name ?? workspaceSlug)}
							</button>
						</DropdownMenuTrigger>
					</TooltipTrigger>
					<TooltipContent side="right">{workspace?.name ?? workspaceSlug}</TooltipContent>
				</Tooltip>
				<DropdownMenuContent className="w-52" align="start" side="right">
					<DropdownMenuLabel className="label-eyebrow">Workspaces</DropdownMenuLabel>
					{navigation.workspaces.map((item) => (
						<DropdownMenuItem key={item.id} asChild>
							<Link to="/w/$slug" params={{ slug: item.slug }}>
								<ChevronsUpDown className="opacity-40" />
								{item.name}
							</Link>
						</DropdownMenuItem>
					))}
				</DropdownMenuContent>
			</DropdownMenu>

			<nav className="mt-2 flex flex-col items-center gap-1" aria-label="Workspace navigation">
				{NAV_LINKS.map((item) => (
					<Tooltip key={item.label}>
						<TooltipTrigger asChild>
							<Link
								to={item.to}
								params={{ slug: workspaceSlug }}
								activeOptions={{ exact: item.exact }}
								aria-label={item.label}
								className="group relative flex size-9 items-center justify-center rounded-md text-muted-foreground outline-none transition-colors hover:bg-sidebar-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
								activeProps={{ className: "bg-sidebar-accent text-foreground" }}
							>
								{/* The brand tick, not a filled pill: the rail marks position quietly. */}
								<span className="absolute left-0 h-4 w-0.5 rounded-full bg-brand-ink opacity-0 transition-opacity group-data-[status=active]:opacity-100" />
								<item.icon className="size-4" />
							</Link>
						</TooltipTrigger>
						<TooltipContent side="right">{item.label}</TooltipContent>
					</Tooltip>
				))}
			</nav>

			<div className="mt-auto flex flex-col items-center gap-1">
				<ThemeToggle />
				<UserMenu navigation={navigation} />
			</div>
		</div>
	);
}

function MobileNav({
	navigation,
	workspaceSlug,
	onNavigate,
}: {
	navigation: NavigationData;
	workspaceSlug: string;
	onNavigate: () => void;
}) {
	const workspace = navigation.workspaces.find((item) => item.slug === workspaceSlug);
	return (
		<div className="flex h-full flex-col bg-sidebar p-4 text-sidebar-foreground">
			<Link to="/" onClick={onNavigate} className="flex items-center gap-2 font-display font-semibold text-lg">
				<span className="flex size-7 items-center justify-center rounded-md bg-primary font-mono text-[11px] text-primary-foreground">
					P/
				</span>
				Plantifiles
			</Link>
			<p className="label-eyebrow mt-6">{workspace?.name ?? workspaceSlug}</p>
			<nav className="mt-2 space-y-1" aria-label="Workspace navigation">
				{NAV_LINKS.map((item) => (
					<Link
						key={item.label}
						to={item.to}
						params={{ slug: workspaceSlug }}
						activeOptions={{ exact: item.exact }}
						onClick={onNavigate}
						className="flex h-10 items-center gap-3 rounded-md px-3 text-muted-foreground text-sm transition-colors hover:bg-sidebar-accent hover:text-foreground"
						activeProps={{ className: "bg-sidebar-accent text-foreground" }}
					>
						<item.icon className="size-4" />
						{item.label}
					</Link>
				))}
			</nav>
			<p className="mt-auto text-muted-foreground text-xs">Agent-native plans, reviewed in place.</p>
		</div>
	);
}

function CommandPalette({ navigation, workspaceSlug }: { navigation: NavigationData; workspaceSlug: string }) {
	const [open, setOpen] = useState(false);
	const router = useRouter();
	useEffect(() => {
		const handle = (event: KeyboardEvent) => {
			if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
				event.preventDefault();
				setOpen((value) => !value);
			}
		};
		window.addEventListener("keydown", handle);
		return () => window.removeEventListener("keydown", handle);
	}, []);
	const workspace = navigation.workspaces.find((item) => item.slug === workspaceSlug);
	const plans = navigation.plans.filter((item) => item.workspaceId === workspace?.id);
	return (
		<>
			<button
				type="button"
				className="group flex h-8 items-center gap-2 rounded-md px-2 text-muted-foreground text-sm outline-none transition-colors hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
				onClick={() => setOpen(true)}
			>
				<Search className="size-4" />
				<span className="hidden sm:inline">Search</span>
				<kbd className="hidden rounded border bg-muted px-1.5 py-0.5 font-mono text-[10px] sm:inline">⌘K</kbd>
			</button>
			<Dialog open={open} onOpenChange={setOpen}>
				<DialogContent className="overflow-hidden p-0" showClose={false}>
					<DialogHeader className="sr-only">
						<DialogTitle>Command palette</DialogTitle>
						<DialogDescription>Open a plan or decision.</DialogDescription>
					</DialogHeader>
					<Command>
						<CommandInput placeholder="Search plan titles and open decisions…" />
						<CommandList>
							<CommandEmpty>No matching plans or decisions.</CommandEmpty>
							<CommandGroup heading="Plans">
								{plans.map((item) => (
									<CommandItem
										key={item.id}
										value={item.title}
										onSelect={() => {
											setOpen(false);
											void router.navigate({
												to: "/p/$workspaceSlug/$planSlug",
												params: { workspaceSlug, planSlug: item.slug },
											});
										}}
									>
										<FileText /> {item.title}
									</CommandItem>
								))}
							</CommandGroup>
							<CommandGroup heading="Open decisions">
								{navigation.decisions
									.filter((item) => plans.some((plan) => plan.id === item.planId))
									.map((item) => {
										const target = plans.find((plan) => plan.id === item.planId);
										if (!target) return null;
										return (
											<CommandItem
												key={item.id}
												value={`${target.title} ${item.key}`}
												onSelect={() => {
													setOpen(false);
													void router.navigate({
														to: "/p/$workspaceSlug/$planSlug",
														params: { workspaceSlug, planSlug: target.slug },
														hash: item.key,
													});
												}}
											>
												<CheckCircle2 /> {target.title} · {item.key}
											</CommandItem>
										);
									})}
							</CommandGroup>
						</CommandList>
					</Command>
				</DialogContent>
			</Dialog>
		</>
	);
}

function ThemeToggle() {
	const { theme, setTheme } = useTheme();
	const next = theme === "dark" ? "light" : "dark";
	return (
		<Tooltip>
			<TooltipTrigger asChild>
				<Button variant="quiet" size="icon-sm" aria-label={`Switch to ${next} mode`} onClick={() => setTheme(next)}>
					{theme === "dark" ? <Sun /> : <Moon />}
				</Button>
			</TooltipTrigger>
			<TooltipContent side="right">{next === "dark" ? "Dark mode" : "Light mode"}</TooltipContent>
		</Tooltip>
	);
}

function UserMenu({ navigation }: { navigation: NavigationData }) {
	return (
		<DropdownMenu>
			<Tooltip>
				<TooltipTrigger asChild>
					<DropdownMenuTrigger asChild>
						<Button size="icon-sm" variant="quiet" aria-label="Open user menu">
							<UserRound />
						</Button>
					</DropdownMenuTrigger>
				</TooltipTrigger>
				<TooltipContent side="right">{navigation.user?.name ?? "Guest"}</TooltipContent>
			</Tooltip>
			<DropdownMenuContent align="end" side="right">
				<DropdownMenuLabel>{navigation.user?.name ?? "Guest"}</DropdownMenuLabel>
				<DropdownMenuSeparator />
				<DropdownMenuItem asChild>
					<a href="/skills/write-plan/SKILL.md" download>
						<Download /> Write-plan skill
					</a>
				</DropdownMenuItem>
				{navigation.user && (
					<DropdownMenuItem asChild>
						<Link to="/settings/tokens">API tokens</Link>
					</DropdownMenuItem>
				)}
			</DropdownMenuContent>
		</DropdownMenu>
	);
}

function AppShell({ navigation, children }: { navigation: NavigationData; children: React.ReactNode }) {
	const pathname = useRouterState({ select: (state) => state.location.pathname });
	const [mobileOpen, setMobileOpen] = useState(false);
	const workspaceSlug = workspaceFromPath(pathname) ?? navigation.workspaces[0]?.slug ?? "demo";
	const planSlug = pathname.startsWith("/p/") ? pathname.split("/")[3] : undefined;
	const planTitle = useMemo(
		() => navigation.plans.find((item) => item.slug === planSlug)?.title,
		[navigation.plans, planSlug],
	);
	if (pathname === "/login") return <>{children}</>;
	return (
		<TooltipProvider delayDuration={400}>
			<div className="min-h-screen bg-background">
				<aside className="fixed inset-y-0 left-0 z-40 hidden lg:block">
					<NavSpine navigation={navigation} workspaceSlug={workspaceSlug} />
				</aside>
				<div className="lg:pl-14">
					<header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b bg-background/85 px-4 backdrop-blur md:px-8">
						<Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
							<SheetTrigger asChild>
								<Button variant="quiet" size="icon-sm" className="lg:hidden" aria-label="Open navigation">
									<Menu />
								</Button>
							</SheetTrigger>
							<SheetContent className="p-0">
								<SheetTitle className="sr-only">Navigation</SheetTitle>
								<MobileNav
									navigation={navigation}
									workspaceSlug={workspaceSlug}
									onNavigate={() => setMobileOpen(false)}
								/>
							</SheetContent>
						</Sheet>
						<nav aria-label="Breadcrumb" className="min-w-0 flex-1 truncate font-mono text-xs">
							<Link
								to="/w/$slug"
								params={{ slug: workspaceSlug }}
								className="text-muted-foreground hover:text-foreground"
							>
								{workspaceSlug}
							</Link>
							{planTitle && (
								<>
									<span className="px-2 text-border">/</span>
									<span className="text-foreground">{planTitle}</span>
								</>
							)}
						</nav>
						<CommandPalette navigation={navigation} workspaceSlug={workspaceSlug} />
					</header>
					<main className={cn("mx-auto w-full max-w-6xl px-5 py-10 md:px-8")}>{children}</main>
				</div>
			</div>
		</TooltipProvider>
	);
}

export { AppShell };
