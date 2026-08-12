import { buttonVariants } from "@plantifiles/ui/components/button";
import { cn } from "@plantifiles/ui/lib/utils";
import type { VariantProps } from "class-variance-authority";
import { Toolbar as ToolbarPrimitive } from "radix-ui";
import type * as React from "react";

/**
 * Segmented container for related actions. Radix Toolbar supplies the role and
 * arrow-key roving focus; this file owns the shared border, the internal
 * hairlines, and the outer radius, so several actions read as one control
 * instead of a row of equal-weight buttons.
 */
function ButtonGroup({ className, ...props }: React.ComponentProps<typeof ToolbarPrimitive.Root>) {
	return (
		<ToolbarPrimitive.Root
			data-slot="button-group"
			className={cn(
				"inline-flex items-stretch overflow-hidden rounded-md border border-border bg-card",
				"[&>*:not(:first-child)]:border-border [&>*:not(:first-child)]:border-l",
				className,
			)}
			{...props}
		/>
	);
}

function ButtonGroupButton({
	className,
	variant = "ghost",
	size = "sm",
	...props
}: React.ComponentProps<typeof ToolbarPrimitive.Button> & VariantProps<typeof buttonVariants>) {
	return (
		<ToolbarPrimitive.Button
			data-slot="button-group-button"
			className={cn(
				buttonVariants({ variant, size }),
				"rounded-none focus-visible:ring-inset focus-visible:ring-offset-0",
				className,
			)}
			{...props}
		/>
	);
}

/** Non-interactive readout inside a group, e.g. the zoom level in a lightbox. */
function ButtonGroupLabel({ className, ...props }: React.ComponentProps<"span">) {
	return (
		<span
			data-slot="button-group-label"
			className={cn(
				"flex min-w-14 items-center justify-center border-border border-l bg-muted/40 px-2 font-mono text-muted-foreground text-xs tabular-nums",
				className,
			)}
			{...props}
		/>
	);
}

export { ButtonGroup, ButtonGroupButton, ButtonGroupLabel };
