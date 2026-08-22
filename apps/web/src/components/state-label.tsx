import { cn } from "@plantifiles/ui/lib/utils";
import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

/**
 * A state the reader observes, drawn as coloured ink and an icon rather than a
 * filled pill. Beside a real control — the version `Select`, with the same
 * height, radius and fill — a pill read as a second button.
 */
function StateLabel({
	icon: Icon,
	ink,
	className,
	children,
}: {
	icon: LucideIcon;
	ink: string;
	className?: string | undefined;
	children: ReactNode;
}) {
	return (
		<span
			className={cn(
				"inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap font-mono text-[11px] uppercase tracking-[0.12em]",
				ink,
				className,
			)}
		>
			<Icon className="size-3.5" aria-hidden="true" />
			{children}
		</span>
	);
}

export { StateLabel };
