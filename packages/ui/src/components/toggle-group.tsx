import { cn } from "@plantifiles/ui/lib/utils";
import { ToggleGroup as ToggleGroupPrimitive } from "radix-ui";
import type * as React from "react";

/**
 * Segmented reading controls. Radix owns roving focus and the pressed state;
 * this file only supplies the shared border and the hairlines between items.
 */
function ToggleGroup({ className, ...props }: React.ComponentProps<typeof ToggleGroupPrimitive.Root>) {
	return (
		<ToggleGroupPrimitive.Root
			data-slot="toggle-group"
			className={cn(
				"inline-flex items-stretch overflow-hidden rounded-md border border-border bg-card",
				"[&>*:not(:first-child)]:border-border [&>*:not(:first-child)]:border-l",
				className,
			)}
			{...props}
		/>
	);
}

function ToggleGroupItem({ className, ...props }: React.ComponentProps<typeof ToggleGroupPrimitive.Item>) {
	return (
		<ToggleGroupPrimitive.Item
			data-slot="toggle-group-item"
			className={cn(
				"inline-flex h-8 items-center gap-1.5 whitespace-nowrap px-3 font-medium text-muted-foreground text-xs outline-none transition-colors",
				"hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset",
				"data-[state=on]:bg-primary data-[state=on]:text-primary-foreground",
				"disabled:pointer-events-none disabled:opacity-50",
				"[&_svg]:size-3.5 [&_svg]:shrink-0",
				className,
			)}
			{...props}
		/>
	);
}

export { ToggleGroup, ToggleGroupItem };
