import { cn } from "@plantifiles/ui/lib/utils";
import { Tabs as TabsPrimitive } from "radix-ui";
import type * as React from "react";

/* The list is the muted trough the dashboard's view pills already use; the
   active trigger lifts out of it with the card fill instead of adding color. */
function Tabs({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.Root>) {
	return <TabsPrimitive.Root data-slot="tabs" className={cn("flex flex-col gap-3", className)} {...props} />;
}

function TabsList({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.List>) {
	return (
		<TabsPrimitive.List
			data-slot="tabs-list"
			className={cn("inline-flex w-fit items-center gap-1 rounded-3xl bg-muted/60 p-1", className)}
			{...props}
		/>
	);
}

function TabsTrigger({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.Trigger>) {
	return (
		<TabsPrimitive.Trigger
			data-slot="tabs-trigger"
			className={cn(
				"inline-flex items-center gap-1.5 rounded-2xl px-3 py-1 font-mono text-xs whitespace-nowrap text-muted-foreground transition-colors outline-none select-none data-[state=active]:bg-card data-[state=active]:text-foreground data-[state=active]:shadow-sm focus-visible:ring-3 focus-visible:ring-ring/30 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-3.5",
				className,
			)}
			{...props}
		/>
	);
}

function TabsContent({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.Content>) {
	return (
		<TabsPrimitive.Content
			data-slot="tabs-content"
			className={cn("outline-none focus-visible:ring-3 focus-visible:ring-ring/30", className)}
			{...props}
		/>
	);
}

export { Tabs, TabsContent, TabsList, TabsTrigger };
