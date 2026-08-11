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
import { cn } from "@plantifiles/ui/lib/utils";
import { Link, useRouter, useRouterState } from "@tanstack/react-router";
import {
	CheckCircle2,
	ChevronsUpDown,
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

function workspaceFromPath(pathname: string): string | undefined {
	const segments = pathname.split("/");
	return segments[1] === "w" || segments[1] === "p" ? segments[2] : undefined;
}

function Sidebar({
	navigation,
	workspaceSlug,
	onNavigate,
}: {
	navigation: NavigationData;
	workspaceSlug: string;
	onNavigate?: () => void;
}) {
	const workspace = navigation.workspaces.find((item) => item.slug === workspaceSlug);
	const links = [
		{ label: "Plans", to: "/w/$slug", icon: FileText },
		{ label: "Decisions", to: "/w/$slug/decisions", icon: Waypoints },
		{ label: "Settings", to: "/w/$slug/settings", icon: Settings },
	] as const;
	return (
		<div className="flex h-full flex-col bg-sidebar text-sidebar-foreground">
			<div className="flex h-14 items-center border-b px-4">
				<Link to="/" className="flex items-center gap-2 font-semibold">
					<span className="flex size-7 items-center justify-center rounded-md bg-primary font-mono text-primary-foreground text-xs">
						P/
					</span>
					Plantifiles
				</Link>
			</div>
			<div className="p-3">
				<DropdownMenu>
					<DropdownMenuTrigger asChild>
						<Button variant="outline" className="w-full justify-between bg-background/60">
							<span className="truncate">{workspace?.name ?? workspaceSlug}</span>
							<ChevronsUpDown />
						</Button>
					</DropdownMenuTrigger>
					<DropdownMenuContent className="w-52" align="start">
						<DropdownMenuLabel>Workspaces</DropdownMenuLabel>
						{navigation.workspaces.map((item) => (
							<DropdownMenuItem key={item.id} asChild>
								<Link to="/w/$slug" params={{ slug: item.slug }} onClick={onNavigate}>
									{item.name}
								</Link>
							</DropdownMenuItem>
						))}
					</DropdownMenuContent>
				</DropdownMenu>
			</div>
			<nav className="space-y-1 px-3" aria-label="Workspace navigation">
				{links.map((item) => (
					<Link
						key={item.label}
						to={item.to}
						params={{ slug: workspaceSlug }}
						onClick={onNavigate}
						className="flex h-9 items-center gap-3 rounded-md px-3 text-muted-foreground text-sm transition-colors hover:bg-muted hover:text-foreground"
						activeProps={{ className: "bg-muted text-foreground" }}
					>
						<item.icon className="size-4" />
						{item.label}
					</Link>
				))}
			</nav>
			<div className="mt-auto border-t p-3 text-muted-foreground text-xs">Agent-native plans, reviewed in place.</div>
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
			<Button
				variant="outline"
				className="hidden w-52 justify-between text-muted-foreground sm:flex"
				onClick={() => setOpen(true)}
			>
				<span className="flex items-center gap-2">
					<Search /> Search plans
				</span>
				<kbd className="rounded border bg-muted px-1.5 font-mono text-[10px]">⌘K</kbd>
			</Button>
			<Dialog open={open} onOpenChange={setOpen}>
				<DialogContent className="overflow-hidden p-0">
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

function UserMenu({ navigation }: { navigation: NavigationData }) {
	const { theme, setTheme } = useTheme();
	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<Button size="icon" variant="ghost" aria-label="Open user menu">
					<UserRound />
				</Button>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="end">
				<DropdownMenuLabel>{navigation.user?.name ?? "Guest"}</DropdownMenuLabel>
				<DropdownMenuSeparator />
				<DropdownMenuItem onSelect={() => setTheme(theme === "dark" ? "light" : "dark")}>
					{theme === "dark" ? <Sun /> : <Moon />} {theme === "dark" ? "Light mode" : "Dark mode"}
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
		<div className="min-h-screen bg-background">
			<aside className="fixed inset-y-0 left-0 z-40 hidden w-60 border-r xl:block">
				<Sidebar navigation={navigation} workspaceSlug={workspaceSlug} />
			</aside>
			<div className="xl:pl-60">
				<header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b bg-background/90 px-4 backdrop-blur md:px-6">
					<Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
						<SheetTrigger asChild>
							<Button variant="ghost" size="icon" className="xl:hidden" aria-label="Open navigation">
								<Menu />
							</Button>
						</SheetTrigger>
						<SheetContent className="p-0">
							<SheetTitle className="sr-only">Navigation</SheetTitle>
							<Sidebar navigation={navigation} workspaceSlug={workspaceSlug} onNavigate={() => setMobileOpen(false)} />
						</SheetContent>
					</Sheet>
					<div className="min-w-0 flex-1 truncate font-mono text-muted-foreground text-xs">
						<span>{workspaceSlug}</span>
						{planTitle && (
							<>
								<span className="px-2 text-border">/</span>
								<span className="text-foreground">{planTitle}</span>
							</>
						)}
					</div>
					<CommandPalette navigation={navigation} workspaceSlug={workspaceSlug} />
					<UserMenu navigation={navigation} />
				</header>
				<main className={cn("mx-auto w-full max-w-5xl px-6 py-8")}>{children}</main>
			</div>
		</div>
	);
}

export { AppShell };
