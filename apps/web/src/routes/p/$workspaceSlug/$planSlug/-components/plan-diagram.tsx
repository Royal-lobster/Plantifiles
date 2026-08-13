import { Button } from "@plantifiles/ui/components/button";
import { ButtonGroup, ButtonGroupButton, ButtonGroupLabel } from "@plantifiles/ui/components/button-group";
import { Dialog, DialogContent, DialogTitle, DialogTrigger } from "@plantifiles/ui/components/dialog";
import { cn } from "@plantifiles/ui/lib/utils";
import { Check, Copy, Maximize2, Minus, Plus, RotateCcw } from "lucide-react";
import type {
	ReactElement,
	KeyboardEvent as ReactKeyboardEvent,
	ReactNode,
	PointerEvent as ReactPointerEvent,
	WheelEvent as ReactWheelEvent,
} from "react";
import { isValidElement, useEffect, useId, useMemo, useRef, useState } from "react";
import { usePlanRender } from "./plan-render-context";

function reactNodeText(node: ReactNode): string {
	if (typeof node === "string" || typeof node === "number") return String(node);
	if (Array.isArray(node)) return node.map(reactNodeText).join("");
	if (isValidElement(node)) return reactNodeText((node as ReactElement<{ children?: ReactNode }>).props.children);
	return "";
}

/**
 * Mermaid rejects OKLCH, and every token in this theme is OKLCH, so colours are
 * pushed through a one-pixel canvas to come back as rgb().
 */
function mermaidColor(value: string): string {
	const canvas = document.createElement("canvas");
	canvas.width = 1;
	canvas.height = 1;
	const context = canvas.getContext("2d");
	if (!context) return value;
	context.fillStyle = value;
	context.fillRect(0, 0, 1, 1);
	const channels = context.getImageData(0, 0, 1, 1).data;
	const red = channels[0] ?? 0;
	const green = channels[1] ?? 0;
	const blue = channels[2] ?? 0;
	const alpha = channels[3] ?? 255;
	return alpha === 255 ? `rgb(${red}, ${green}, ${blue})` : `rgba(${red}, ${green}, ${blue}, ${alpha / 255})`;
}

function MermaidFigure({ chart, className }: { chart: string; className?: string }) {
	const reactId = useId();
	const id = useMemo(() => `plantifiles-${reactId.replace(/[^a-zA-Z0-9]/g, "")}`, [reactId]);
	const [svg, setSvg] = useState<string>();
	const [error, setError] = useState<string>();
	const [rootClassSignature, setRootClassSignature] = useState<string>();
	const rootRef = useRef<HTMLDivElement>(null);
	useEffect(() => {
		const root = document.documentElement;
		const update = () => setRootClassSignature(root.className);
		update();
		const observer = new MutationObserver(update);
		observer.observe(root, { attributes: true, attributeFilter: ["class"] });
		return () => observer.disconnect();
	}, []);
	useEffect(() => {
		if (rootClassSignature === undefined) return;
		let active = true;
		void (async () => {
			if (import.meta.env.SSR) return;
			try {
				// Mermaid touches window/document at import time and must never reach the
				// Worker's SSR pass, so the specifier stays dynamic on purpose.
				const mermaid = (await import("mermaid")).default;
				const styles = getComputedStyle(document.documentElement);
				const theme = rootClassSignature.split(/\s+/).includes("dark") ? "dark" : "light";
				const token = (name: string) => mermaidColor(styles.getPropertyValue(name).trim());
				const surface = token("--background");
				const ink = token("--foreground");
				const edge = token("--diagram-edge");
				const node = token("--diagram-node");
				const quiet = token("--muted");
				mermaid.initialize({
					startOnLoad: false,
					securityLevel: "strict",
					theme: "base",
					fontFamily: styles.getPropertyValue("--font-sans").trim() || "sans-serif",
					/* The base theme derives every colour it is not given by rotating the
					   primary hue, which turns a green product's edge labels magenta. Give
					   it the whole palette from the tokens instead. */
					themeVariables: {
						background: surface,
						mainBkg: node,
						primaryColor: node,
						primaryTextColor: ink,
						primaryBorderColor: edge,
						secondaryColor: quiet,
						secondaryTextColor: ink,
						secondaryBorderColor: edge,
						tertiaryColor: quiet,
						tertiaryTextColor: ink,
						tertiaryBorderColor: edge,
						lineColor: edge,
						textColor: ink,
						edgeLabelBackground: surface,
						labelBackgroundColor: surface,
						noteBkgColor: quiet,
						noteTextColor: ink,
						noteBorderColor: edge,
						clusterBkg: quiet,
						clusterBorder: edge,
						titleColor: ink,
					},
				});
				const rendered = await mermaid.render(`${id}-${theme}`, chart);
				if (active) {
					setSvg(rendered.svg);
					setError(undefined);
				}
			} catch (caught) {
				if (active) setError(caught instanceof Error ? caught.message : String(caught));
			}
		})();
		return () => {
			active = false;
		};
	}, [chart, id, rootClassSignature]);
	useEffect(() => {
		if (!svg || !rootRef.current) return;
		const parsed = new DOMParser().parseFromString(svg, "image/svg+xml");
		if (parsed.documentElement.localName !== "svg") {
			setError("Mermaid returned invalid SVG.");
			return;
		}
		for (const script of parsed.querySelectorAll("script")) script.remove();
		for (const element of parsed.querySelectorAll("*")) {
			for (const attribute of [...element.attributes]) {
				const name = attribute.name.toLowerCase();
				if (
					name.startsWith("on") ||
					((name === "href" || name === "xlink:href") && /^\s*javascript:/i.test(attribute.value))
				) {
					element.removeAttribute(attribute.name);
				}
			}
		}
		rootRef.current.replaceChildren(document.importNode(parsed.documentElement, true));
	}, [svg]);
	if (error) return <pre className="overflow-x-auto p-4 text-destructive text-xs">{error}</pre>;
	if (!svg) return <pre className="overflow-x-auto p-4 font-mono text-muted-foreground text-xs">{chart}</pre>;
	return <div ref={rootRef} className={cn("flex justify-center", className)} />;
}

const ZOOM_MIN = 0.4;
const ZOOM_MAX = 6;
const ZOOM_STEP = 1.25;

type ZoomView = { scale: number; x: number; y: number };
const ZOOM_RESET: ZoomView = { scale: 1, x: 0, y: 0 };

function DiagramLightbox({
	chart,
	figure,
	lang,
}: {
	chart: string;
	figure: number | undefined;
	lang: "mermaid" | "d2";
}) {
	const [view, setView] = useState<ZoomView>(ZOOM_RESET);
	const [copyStatus, setCopyStatus] = useState<"idle" | "success" | "error">("idle");
	const dragRef = useRef<{ pointer: number; x: number; y: number } | null>(null);
	const copyAttemptRef = useRef(0);
	const copyTimerRef = useRef<number | undefined>(undefined);

	function zoomBy(factor: number) {
		setView((current) => ({
			...current,
			scale: Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, current.scale * factor)),
		}));
	}

	function onPointerDown(event: ReactPointerEvent<HTMLButtonElement>) {
		dragRef.current = { pointer: event.pointerId, x: event.clientX - view.x, y: event.clientY - view.y };
		event.currentTarget.setPointerCapture(event.pointerId);
	}

	function onPointerMove(event: ReactPointerEvent<HTMLButtonElement>) {
		const drag = dragRef.current;
		if (!drag || drag.pointer !== event.pointerId) return;
		setView((current) => ({ ...current, x: event.clientX - drag.x, y: event.clientY - drag.y }));
	}

	function onPointerUp(event: ReactPointerEvent<HTMLButtonElement>) {
		if (dragRef.current?.pointer === event.pointerId) dragRef.current = null;
	}

	function onWheel(event: ReactWheelEvent<HTMLButtonElement>) {
		event.preventDefault();
		zoomBy(event.deltaY < 0 ? ZOOM_STEP : 1 / ZOOM_STEP);
	}

	function onKeyDown(event: ReactKeyboardEvent<HTMLButtonElement>) {
		const pan = 60;
		if (event.key === "+" || event.key === "=") zoomBy(ZOOM_STEP);
		else if (event.key === "-") zoomBy(1 / ZOOM_STEP);
		else if (event.key === "0") setView(ZOOM_RESET);
		else if (event.key === "ArrowLeft") setView((current) => ({ ...current, x: current.x + pan }));
		else if (event.key === "ArrowRight") setView((current) => ({ ...current, x: current.x - pan }));
		else if (event.key === "ArrowUp") setView((current) => ({ ...current, y: current.y + pan }));
		else if (event.key === "ArrowDown") setView((current) => ({ ...current, y: current.y - pan }));
		else return;
		event.preventDefault();
	}

	async function copySource() {
		const attempt = ++copyAttemptRef.current;
		let resetDelay = 1500;
		window.clearTimeout(copyTimerRef.current);
		copyTimerRef.current = undefined;
		setCopyStatus("idle");
		try {
			await navigator.clipboard.writeText(chart);
			if (attempt !== copyAttemptRef.current) return;
			setCopyStatus("success");
		} catch {
			if (attempt !== copyAttemptRef.current) return;
			setCopyStatus("error");
			resetDelay = 3000;
		}
		copyTimerRef.current = window.setTimeout(() => {
			setCopyStatus("idle");
			copyTimerRef.current = undefined;
		}, resetDelay);
	}

	useEffect(
		() => () => {
			copyAttemptRef.current += 1;
			window.clearTimeout(copyTimerRef.current);
		},
		[],
	);

	return (
		<DialogContent
			className="flex h-[88vh] w-[calc(100%-2rem)] max-w-[min(96vw,80rem)] flex-col gap-0 p-0"
			onOpenAutoFocus={() => {
				setView(ZOOM_RESET);
				copyAttemptRef.current += 1;
				window.clearTimeout(copyTimerRef.current);
				copyTimerRef.current = undefined;
				setCopyStatus("idle");
			}}
		>
			<div className="flex flex-wrap items-center gap-3 border-b px-4 py-2.5 pr-12">
				<DialogTitle className="label-eyebrow text-foreground">
					{figure === undefined ? "Diagram" : `Fig. ${figure}`}
				</DialogTitle>
				<ButtonGroup aria-label="Zoom" className="ml-auto">
					<ButtonGroupButton onClick={() => zoomBy(1 / ZOOM_STEP)} aria-label="Zoom out">
						<Minus />
					</ButtonGroupButton>
					<ButtonGroupLabel>{Math.round(view.scale * 100)}%</ButtonGroupLabel>
					<ButtonGroupButton onClick={() => zoomBy(ZOOM_STEP)} aria-label="Zoom in">
						<Plus />
					</ButtonGroupButton>
					<ButtonGroupButton onClick={() => setView(ZOOM_RESET)} aria-label="Reset view">
						<RotateCcw />
					</ButtonGroupButton>
				</ButtonGroup>
				<Button variant="outline" size="sm" onClick={() => void copySource()}>
					{copyStatus === "success" ? <Check /> : <Copy />}
					{copyStatus === "success" ? "Copied" : copyStatus === "error" ? "Copy failed" : "Copy source"}
				</Button>
				<output
					className="sr-only"
					role={copyStatus === "error" ? "alert" : "status"}
					aria-live={copyStatus === "error" ? "assertive" : "polite"}
				>
					{copyStatus === "success"
						? "Diagram source copied."
						: copyStatus === "error"
							? "Diagram source could not be copied."
							: ""}
				</output>
			</div>
			<div className="relative flex-1 overflow-hidden bg-muted/20">
				<div
					className="flex h-full w-full items-center justify-center"
					style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})` }}
				>
					{lang === "mermaid" ? (
						<MermaidFigure chart={chart} className="[&_svg]:h-auto [&_svg]:w-[68rem] [&_svg]:max-w-none" />
					) : (
						<pre className="p-6 font-mono text-sm">{chart}</pre>
					)}
				</div>
				<button
					type="button"
					aria-label="Drag to pan, scroll to zoom, arrow keys to move, plus and minus to zoom"
					className="absolute inset-0 cursor-grab touch-none outline-none active:cursor-grabbing focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
					onPointerDown={onPointerDown}
					onPointerMove={onPointerMove}
					onPointerUp={onPointerUp}
					onPointerCancel={onPointerUp}
					onWheel={onWheel}
					onKeyDown={onKeyDown}
				/>
			</div>
			<p className="border-t px-4 py-2 font-mono text-[10px] text-muted-foreground">
				scroll to zoom · drag to pan · esc to close
			</p>
		</DialogContent>
	);
}

function Diagram({ lang, blockKey, children }: { lang: "mermaid" | "d2"; blockKey?: string; children?: ReactNode }) {
	const { figureNumbers } = usePlanRender();
	const chart = reactNodeText(children).trim();
	const figure = blockKey ? figureNumbers[blockKey] : undefined;
	return (
		<figure className="group/diagram">
			<Dialog>
				<div className="relative overflow-hidden rounded-lg border bg-card p-6 transition-colors hover:border-brand-ink/40 focus-within:border-brand-ink/40">
					{lang === "mermaid" ? (
						<MermaidFigure chart={chart} />
					) : (
						<pre className="overflow-x-auto font-mono text-sm">{chart}</pre>
					)}
					<DialogTrigger asChild>
						<button
							type="button"
							aria-label={figure === undefined ? "Enlarge diagram" : `Enlarge figure ${figure}`}
							className="absolute inset-0 cursor-zoom-in rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
						>
							<span className="sr-only">{figure === undefined ? "Enlarge diagram" : `Enlarge figure ${figure}`}</span>
						</button>
					</DialogTrigger>
					<span className="pointer-events-none absolute top-2.5 right-2.5 flex items-center gap-1 rounded-md border bg-background/90 px-2 py-1 font-mono text-[10px] text-muted-foreground opacity-0 transition-opacity group-hover/diagram:opacity-100 group-focus-within/diagram:opacity-100">
						<Maximize2 className="size-3" /> zoom
					</span>
				</div>
				<DiagramLightbox chart={chart} figure={figure} lang={lang} />
			</Dialog>
			<figcaption className="mt-2 flex flex-wrap items-baseline gap-x-4">
				{figure !== undefined && <span className="label-eyebrow">Fig. {figure}</span>}
				<details className="min-w-0 flex-1">
					<summary className="cursor-pointer font-mono text-[11px] text-muted-foreground hover:text-foreground">
						View source
					</summary>
					<div className="[&_pre]:my-2 [&_pre]:text-xs">{children}</div>
				</details>
			</figcaption>
		</figure>
	);
}

export { Diagram };
