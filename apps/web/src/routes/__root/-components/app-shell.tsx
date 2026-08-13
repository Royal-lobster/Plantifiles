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
import {
	Check,
	ChevronsUpDown,
	FileText,
	Maximize2,
	Minimize2,
	Palette,
	Settings2,
	Slash,
	Waypoints,
} from "lucide-react";
import { Avatar, LogoMark } from "../../../components/brand";
import type { NavigationData } from "../-data/navigation";
import { READER_FONTS, SIZE_STEPS, useReaderPreferences, WIDTH_STEPS } from "./reader-preferences";
import { assertTheme, THEME_CYCLE_ARIA_KEYSHORTCUTS, THEME_CYCLE_SHORTCUT_LABEL, THEMES } from "./theme-config";
import { useTheme } from "./theme-provider";

const NAV_LINKS = [
	{ label: "Plans", to: "/w/$slug", exact: true, icon: FileText },
	{ label: "Decisions", to: "/w/$slug/decisions", exact: false, icon: Waypoints },
	{ label: "Settings", to: "/w/$slug/settings", exact: false, icon: Settings2 },
] as const;

function workspaceSlugFromPath(pathname: string): string | undefined {
	const [, route, slug] = pathname.split("/");
	return route === "w" || route === "p" ? slug : undefined;
}

type Workspace = NavigationData["workspaces"][number];

function WorkspaceSwitcher({ navigation, workspace }: { navigation: NavigationData; workspace: Workspace }) {
	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<Button
					variant="ghost"
					size="sm"
					className="min-w-0 max-w-36 gap-1.5 px-2 font-medium sm:max-w-56"
					title={workspace.name}
				>
					<span className="truncate">{workspace.name}</span>
					<ChevronsUpDown className="size-3.5 shrink-0 text-muted-foreground" />
				</Button>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="start" className="w-52">
				<DropdownMenuLabel className="label-eyebrow">Workspaces</DropdownMenuLabel>
				{navigation.workspaces.map((item) => (
					<DropdownMenuItem key={item.id} asChild>
						<Link
							to="/w/$slug"
							params={{ slug: item.slug }}
							className="min-w-0 justify-between gap-2"
							aria-current={item.id === workspace.id ? "page" : undefined}
						>
							<span className="truncate">{item.name}</span>
							{item.id === workspace.id && <Check className="size-3.5 shrink-0" />}
						</Link>
					</DropdownMenuItem>
				))}
			</DropdownMenuContent>
		</DropdownMenu>
	);
}

function ThemePreview({ previewClasses }: { previewClasses: string }) {
	return (
		<span
			aria-hidden="true"
			className={`${previewClasses} relative h-11 overflow-hidden rounded-md border border-border bg-background shadow-sm`}
		>
			<span className="absolute inset-x-0 top-0 flex h-3 items-center gap-1 border-border border-b bg-muted px-1.5">
				<span className="size-1 rounded-full bg-primary" />
				<span className="h-1 w-4 rounded-full bg-foreground/20" />
			</span>
			<span className="absolute top-5 left-2 h-1 w-9 rounded-full bg-foreground/70" />
			<span className="absolute top-7 left-2 h-1 w-6 rounded-full bg-foreground/20" />
			<span className="absolute right-2 bottom-2 size-3 rounded-sm bg-primary" />
		</span>
	);
}

function ThemePicker() {
	const { theme, setTheme } = useTheme();
	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<Button
					variant="ghost"
					size="icon"
					aria-label={`Change theme. ${THEME_CYCLE_SHORTCUT_LABEL} cycles themes`}
					aria-keyshortcuts={THEME_CYCLE_ARIA_KEYSHORTCUTS}
				>
					<Palette className="size-4" />
				</Button>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="end" className="w-72 p-2">
				<DropdownMenuLabel className="flex items-center gap-2 px-1 pt-1 pb-2">
					<span className="flex size-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
						<Palette className="size-4" />
					</span>
					<span>
						<span className="block font-medium text-sm">Choose a theme</span>
						<span className="block font-normal text-muted-foreground text-xs">
							Cycle with {THEME_CYCLE_SHORTCUT_LABEL}
						</span>
					</span>
				</DropdownMenuLabel>
				<DropdownMenuRadioGroup
					value={theme}
					onValueChange={(value) => {
						assertTheme(value);
						setTheme(value);
					}}
					className="grid grid-cols-2 gap-1.5"
				>
					{THEMES.map(({ label, name, previewClasses }) => (
						<DropdownMenuRadioItem
							key={name}
							value={name}
							className="group h-auto flex-col items-stretch gap-2 rounded-lg border border-transparent p-2 text-xs transition-colors focus:border-border focus:bg-muted data-[state=checked]:border-primary/40 data-[state=checked]:bg-primary/5 data-[state=checked]:shadow-sm [&_[data-slot=dropdown-menu-radio-item-indicator]]:right-2.5 [&_[data-slot=dropdown-menu-radio-item-indicator]]:bottom-2.5 [&_[data-slot=dropdown-menu-radio-item-indicator]]:left-auto"
						>
							<ThemePreview previewClasses={previewClasses} />
							<span className="px-0.5 pr-5 font-medium">{label}</span>
						</DropdownMenuRadioItem>
					))}
				</DropdownMenuRadioGroup>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}

function ReadingSettingsPicker() {
	const { font, setFont, sizeStep, setSizeStep, widthStep, setWidthStep } = useReaderPreferences();

	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<Button variant="ghost" size="icon" aria-label="Reading settings">
					<span className="font-semibold text-sm leading-none">Aa</span>
				</Button>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="end" className="w-72 p-2">
				<DropdownMenuLabel className="px-1 pt-1 pb-2">
					<span className="block font-medium text-sm">Reading settings</span>
					<span className="block font-normal text-muted-foreground text-xs">Font, text size, and line width</span>
				</DropdownMenuLabel>
				<div className="grid grid-cols-2 gap-1">
					{READER_FONTS.map((option) => (
						<DropdownMenuItem
							key={option.id}
							onSelect={(event) => {
								event.preventDefault();
								setFont(option.id);
							}}
							className={cn("justify-between px-2.5 py-2", font === option.id && "bg-muted text-foreground")}
							style={{ fontFamily: option.stack }}
						>
							<span className={cn("truncate", font === option.id && "font-semibold")}>{option.label}</span>
							{font === option.id && <Check className="size-3.5 text-primary" />}
						</DropdownMenuItem>
					))}
				</div>
				<DropdownMenuSeparator />
				<ReaderStepper
					label="Text size"
					value={sizeStep}
					max={SIZE_STEPS.length - 1}
					onChange={setSizeStep}
					decrementLabel="Decrease font size"
					incrementLabel="Increase font size"
					decrementIcon={<span className="text-xs">A</span>}
					incrementIcon={<span className="text-base">A</span>}
				/>
				<ReaderStepper
					label="Line width"
					value={widthStep}
					max={WIDTH_STEPS.length - 1}
					onChange={setWidthStep}
					decrementLabel="Narrower content width"
					incrementLabel="Wider content width"
					decrementIcon={<Minimize2 className="size-3.5" />}
					incrementIcon={<Maximize2 className="size-3.5" />}
				/>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}

function ReaderStepper({
	label,
	value,
	max,
	onChange,
	decrementLabel,
	incrementLabel,
	decrementIcon,
	incrementIcon,
}: {
	label: string;
	value: number;
	max: number;
	onChange: (next: number) => void;
	decrementLabel: string;
	incrementLabel: string;
	decrementIcon: React.ReactNode;
	incrementIcon: React.ReactNode;
}) {
	return (
		<div className="px-1 py-1.5">
			<p className="mb-1 px-1 font-medium text-xs">{label}</p>
			<div className="flex items-center gap-2">
				<Button
					variant="ghost"
					size="icon"
					className="size-7 shrink-0"
					disabled={value === 0}
					onClick={() => onChange(value - 1)}
					aria-label={decrementLabel}
				>
					{decrementIcon}
				</Button>
				<div className="flex flex-1 items-center justify-between gap-1">
					{Array.from({ length: max + 1 }, (_, index) => (
						<button
							// biome-ignore lint/suspicious/noArrayIndexKey: fixed-length discrete steps
							key={index}
							type="button"
							onClick={() => onChange(index)}
							aria-label={`${label}, step ${index + 1} of ${max + 1}`}
							aria-current={index === value ? "step" : undefined}
							className="group flex h-4 flex-1 items-center justify-center"
						>
							<span
								className={cn(
									"block h-1 w-full rounded-full transition-colors",
									index <= value ? "bg-foreground/80" : "bg-border group-hover:bg-foreground/30",
								)}
							/>
						</button>
					))}
				</div>
				<Button
					variant="ghost"
					size="icon"
					className="size-7 shrink-0"
					disabled={value === max}
					onClick={() => onChange(value + 1)}
					aria-label={incrementLabel}
				>
					{incrementIcon}
				</Button>
			</div>
		</div>
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
				<Button variant="ghost" size="icon" className="rounded-full p-0 [&_svg]:size-full" aria-label="Open user menu">
					<Avatar
						seed={navigation.user.id}
						name={navigation.user.name}
						image={navigation.user.image}
						className="size-8"
					/>
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
				<DropdownMenuItem asChild>
					<a href="/skills/write-plan/SKILL.md">Write-plan skill</a>
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
	const workspaceSlug = workspaceSlugFromPath(pathname);
	const workspace = navigation.workspaces.find((item) => item.slug === workspaceSlug);
	const readingPlan = pathname.startsWith("/p/");
	const chromeless = pathname === "/login";

	if (chromeless) return children;

	return (
		<TooltipProvider delayDuration={200}>
			<div className="min-h-screen">
				<header className="sticky top-0 z-40 border-b bg-background/85 backdrop-blur">
					<div className="mx-auto flex h-14 w-full max-w-shell items-center gap-1 px-4 sm:px-6">
						<Link
							to="/"
							className="flex shrink-0 items-center gap-1.5 font-semibold text-base tracking-tight"
							aria-label="Plantifiles home"
						>
							<LogoMark />
							<span className="hidden sm:inline">Plantifiles</span>
						</Link>
						{workspace && (
							<>
								<Slash className="size-3.5 shrink-0 -rotate-12 text-border" />
								<WorkspaceSwitcher navigation={navigation} workspace={workspace} />
							</>
						)}
						<div className="ml-auto flex items-center gap-1">
							{readingPlan && <ReadingSettingsPicker />}
							<ThemePicker />
							<UserMenu navigation={navigation} />
						</div>
					</div>

					{workspace && (
						<nav className="mx-auto w-full max-w-shell px-4 sm:px-6" aria-label="Workspace navigation">
							{/* -mb-px lets each tab's 2px rule sit on the header's 1px border
							    instead of floating above it. */}
							<ul className="-mb-px flex gap-5 overflow-x-auto">
								{NAV_LINKS.map((item) => (
									<li key={item.label}>
										<Link
											to={item.to}
											params={{ slug: workspace.slug }}
											activeOptions={{ exact: item.exact }}
											className="flex items-center gap-1.5 border-b-2 border-transparent pt-1 pb-2.5 text-muted-foreground text-sm transition-colors hover:text-foreground [&_svg]:size-3.5"
											activeProps={{ className: "border-foreground text-foreground", "aria-current": "page" }}
										>
											<item.icon />
											{item.label}
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
