import { Button } from "@plantifiles/ui/components/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@plantifiles/ui/components/dialog";
import { cn } from "@plantifiles/ui/lib/utils";
import { Expand, Laptop, Monitor, Smartphone, Tablet } from "lucide-react";
import { type ComponentType, useState } from "react";

type PrototypeViewport = "responsive" | "mobile" | "tablet" | "desktop";

type ViewportOption = {
	label: string;
	width: string;
	height: number;
	icon: ComponentType<{ className?: string }>;
};

const VIEWPORTS: Record<PrototypeViewport, ViewportOption> = {
	responsive: { label: "Responsive", width: "100%", height: 640, icon: Laptop },
	mobile: { label: "Mobile", width: "390px", height: 720, icon: Smartphone },
	tablet: { label: "Tablet", width: "768px", height: 800, icon: Tablet },
	desktop: { label: "Desktop", width: "1280px", height: 800, icon: Monitor },
};

function PrototypeFrame({
	title,
	srcDoc,
	viewport,
	fullscreen = false,
}: {
	title: string;
	srcDoc: string;
	viewport: PrototypeViewport;
	fullscreen?: boolean;
}) {
	const option = VIEWPORTS[viewport];
	return (
		<div className={cn("overflow-auto bg-muted/35", fullscreen ? "h-full rounded-lg border" : "max-h-[52rem]")}>
			<iframe
				title={`${title} prototype`}
				srcDoc={srcDoc}
				sandbox=""
				referrerPolicy="no-referrer"
				loading="lazy"
				className="mx-auto block max-w-none bg-white"
				style={{
					width: fullscreen && viewport === "responsive" ? "100%" : option.width,
					height: fullscreen ? "100%" : option.height,
				}}
			/>
		</div>
	);
}

function Prototype({
	title,
	viewport = "responsive",
	srcDoc,
}: {
	title: string;
	viewport?: PrototypeViewport;
	srcDoc: string;
	blockKey?: string;
	node?: unknown;
}) {
	const [selectedViewport, setSelectedViewport] = useState<PrototypeViewport>(viewport);
	return (
		<figure className="overflow-hidden rounded-xl border bg-card shadow-sm">
			<figcaption className="flex flex-wrap items-center gap-3 border-b bg-muted/45 px-3 py-2">
				<div className="min-w-0 flex-1">
					<p className="truncate font-medium text-sm">{title}</p>
					<p className="font-mono text-[10px] text-muted-foreground uppercase tracking-[0.12em]">
						Interactive prototype
					</p>
				</div>
				<fieldset className="flex items-center rounded-md border bg-background p-0.5">
					<legend className="sr-only">Prototype viewport</legend>
					{Object.entries(VIEWPORTS).map(([value, option]) => {
						const Icon = option.icon;
						const active = selectedViewport === value;
						return (
							<Button
								key={value}
								type="button"
								variant={active ? "secondary" : "ghost"}
								size="icon-xs"
								aria-label={`${option.label} viewport`}
								aria-pressed={active}
								title={option.label}
								onClick={() => setSelectedViewport(value as PrototypeViewport)}
							>
								<Icon className="size-3.5" />
							</Button>
						);
					})}
				</fieldset>
				<Dialog>
					<DialogTrigger asChild>
						<Button type="button" variant="ghost" size="icon-xs" aria-label="Enlarge prototype" title="Enlarge">
							<Expand className="size-3.5" />
						</Button>
					</DialogTrigger>
					<DialogContent className="h-[calc(100vh-2rem)] max-w-[calc(100vw-2rem)] grid-rows-[auto_minmax(0,1fr)] p-3">
						<DialogHeader className="pr-10">
							<DialogTitle>{title}</DialogTitle>
							<DialogDescription>{VIEWPORTS[selectedViewport].label} prototype preview</DialogDescription>
						</DialogHeader>
						<PrototypeFrame title={title} srcDoc={srcDoc} viewport={selectedViewport} fullscreen />
					</DialogContent>
				</Dialog>
			</figcaption>
			<PrototypeFrame title={title} srcDoc={srcDoc} viewport={selectedViewport} />
		</figure>
	);
}

export { Prototype };
