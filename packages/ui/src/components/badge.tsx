import { cn } from "@plantifiles/ui/lib/utils";
import { cva, type VariantProps } from "class-variance-authority";
import type * as React from "react";

const badgeVariants = cva(
	"inline-flex items-center gap-1 whitespace-nowrap rounded-full font-medium tracking-wide uppercase",
	{
		variants: {
			variant: {
				default: "bg-primary text-primary-foreground",
				brand: "bg-brand-ink/12 text-brand-ink",
				secondary: "bg-muted text-muted-foreground",
				outline: "border border-border text-foreground",
				destructive: "bg-destructive/15 text-destructive",
				success: "bg-success/15 text-success",
				"success-outline": "border border-success/45 text-success",
				warning: "bg-warning/18 text-warning",
				decision: "bg-decision/15 text-decision",
				quiet: "bg-muted text-muted-foreground/70",
			},
			size: {
				default: "h-5 px-2 text-[11px]",
				sm: "h-[1.125rem] px-1.5 font-mono text-[10px]",
			},
		},
		defaultVariants: { variant: "default", size: "default" },
	},
);

function Badge({
	className,
	variant,
	size,
	...props
}: React.ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
	return <span data-slot="badge" className={cn(badgeVariants({ variant, size }), className)} {...props} />;
}

export { Badge, badgeVariants };
