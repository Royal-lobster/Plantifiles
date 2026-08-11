import { cn } from "@plantifiles/ui/lib/utils";
import { X } from "lucide-react";
import { Dialog as SheetPrimitive } from "radix-ui";
import type * as React from "react";

const Sheet = SheetPrimitive.Root;
const SheetTrigger = SheetPrimitive.Trigger;
const SheetClose = SheetPrimitive.Close;

function SheetContent({
	className,
	children,
	side = "left",
	...props
}: React.ComponentProps<typeof SheetPrimitive.Content> & { side?: "left" | "right" }) {
	return (
		<SheetPrimitive.Portal>
			<SheetPrimitive.Overlay className="fixed inset-0 z-50 bg-black/50" />
			<SheetPrimitive.Content
				className={cn(
					"fixed inset-y-0 z-50 w-72 border bg-background p-6 shadow-xl outline-none",
					side === "left" ? "left-0 border-r" : "right-0 border-l",
					className,
				)}
				{...props}
			>
				{children}
				<SheetPrimitive.Close className="absolute top-4 right-4 rounded-sm text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring">
					<X className="size-4" />
					<span className="sr-only">Close</span>
				</SheetPrimitive.Close>
			</SheetPrimitive.Content>
		</SheetPrimitive.Portal>
	);
}

function SheetTitle({ className, ...props }: React.ComponentProps<typeof SheetPrimitive.Title>) {
	return <SheetPrimitive.Title className={cn("font-semibold", className)} {...props} />;
}

export { Sheet, SheetClose, SheetContent, SheetTitle, SheetTrigger };
