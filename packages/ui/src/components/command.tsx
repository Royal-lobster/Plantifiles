import { cn } from "@plantifiles/ui/lib/utils";
import { Command as CommandPrimitive } from "cmdk";
import { Search } from "lucide-react";
import type * as React from "react";

function Command({ className, ...props }: React.ComponentProps<typeof CommandPrimitive>) {
	return (
		<CommandPrimitive
			className={cn("flex h-full w-full flex-col overflow-hidden rounded-md bg-background text-foreground", className)}
			{...props}
		/>
	);
}

function CommandInput({ className, ...props }: React.ComponentProps<typeof CommandPrimitive.Input>) {
	return (
		<div className="flex h-11 items-center gap-2 border-b px-3">
			<Search className="size-4 text-muted-foreground" />
			<CommandPrimitive.Input
				className={cn("h-10 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground", className)}
				{...props}
			/>
		</div>
	);
}

function CommandList({ className, ...props }: React.ComponentProps<typeof CommandPrimitive.List>) {
	return <CommandPrimitive.List className={cn("max-h-80 overflow-y-auto p-1", className)} {...props} />;
}

function CommandEmpty(props: React.ComponentProps<typeof CommandPrimitive.Empty>) {
	return <CommandPrimitive.Empty className="py-8 text-center text-muted-foreground text-sm" {...props} />;
}

function CommandGroup({ className, ...props }: React.ComponentProps<typeof CommandPrimitive.Group>) {
	return (
		<CommandPrimitive.Group
			className={cn(
				"p-1 text-foreground [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-muted-foreground [&_[cmdk-group-heading]]:text-xs",
				className,
			)}
			{...props}
		/>
	);
}

function CommandItem({ className, ...props }: React.ComponentProps<typeof CommandPrimitive.Item>) {
	return (
		<CommandPrimitive.Item
			className={cn(
				"flex cursor-default select-none items-center gap-2 rounded-sm px-2 py-2 text-sm outline-none data-[selected=true]:bg-muted",
				className,
			)}
			{...props}
		/>
	);
}

export { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList };
