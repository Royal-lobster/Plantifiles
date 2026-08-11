import { cn } from "@plantifiles/ui/lib/utils";
import { cva, type VariantProps } from "class-variance-authority";
import type * as React from "react";

const badgeVariants = cva(
	"inline-flex h-5 items-center rounded-full px-2 text-[11px] font-medium uppercase tracking-wide",
	{
		variants: {
			variant: {
				default: "bg-primary text-primary-foreground",
				secondary: "bg-muted text-muted-foreground",
				outline: "border border-border text-foreground",
				destructive: "bg-destructive/15 text-destructive",
			},
		},
		defaultVariants: { variant: "default" },
	},
);

function Badge({ className, variant, ...props }: React.ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
	return <span data-slot="badge" className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
