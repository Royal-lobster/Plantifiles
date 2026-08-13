import { cn } from "@plantifiles/ui/lib/utils";
import { cva, type VariantProps } from "class-variance-authority";
import { Slot } from "radix-ui";
import type * as React from "react";

const buttonVariants = cva(
	"inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-md font-medium text-sm outline-none transition-[color,background-color,border-color,box-shadow] focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
	{
		variants: {
			variant: {
				default: "bg-primary text-primary-foreground hover:bg-primary/85 active:bg-primary",
				destructive: "bg-destructive text-background hover:bg-destructive/90",
				outline: "border border-border bg-card hover:border-input hover:bg-accent hover:text-accent-foreground",
				secondary: "bg-secondary text-secondary-foreground hover:bg-secondary/70",
				ghost: "hover:bg-accent hover:text-accent-foreground",
				/* Marginalia and toolbars: present but never competing with prose. */
				quiet: "text-muted-foreground hover:bg-accent hover:text-foreground",
				link: "text-brand-ink underline-offset-4 hover:underline",
			},
			size: {
				default: "h-9 px-4 py-2",
				xs: "h-6 gap-1 rounded-sm px-2 text-xs [&_svg:not([class*='size-'])]:size-3",
				sm: "h-8 px-3 text-xs [&_svg:not([class*='size-'])]:size-3.5",
				lg: "h-10 px-6",
				icon: "size-9",
				"icon-sm": "size-8 [&_svg:not([class*='size-'])]:size-3.5",
				"icon-xs": "size-6 rounded-sm [&_svg:not([class*='size-'])]:size-3",
			},
		},
		defaultVariants: { variant: "default", size: "default" },
	},
);

function Button({
	className,
	variant = "default",
	size = "default",
	asChild = false,
	type = "button",
	...props
}: React.ComponentProps<"button"> &
	VariantProps<typeof buttonVariants> & {
		asChild?: boolean;
	}) {
	const Component = asChild ? Slot.Root : "button";
	return (
		<Component
			type={asChild ? undefined : type}
			data-slot="button"
			data-variant={variant}
			data-size={size}
			className={cn(buttonVariants({ variant, size, className }))}
			{...props}
		/>
	);
}

export { Button, buttonVariants };
