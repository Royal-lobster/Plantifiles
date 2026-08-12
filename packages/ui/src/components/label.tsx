"use client";

import { cn } from "@plantifiles/ui/lib/utils";
import { Label as LabelPrimitive } from "radix-ui";
import type * as React from "react";

function Label({ className, ...props }: React.ComponentProps<typeof LabelPrimitive.Root>) {
	return (
		<LabelPrimitive.Root
			data-slot="label"
			className={cn(
				"flex select-none items-center gap-2 font-medium text-sm leading-none group-data-[disabled=true]:pointer-events-none peer-disabled:cursor-not-allowed group-data-[disabled=true]:opacity-50 peer-disabled:opacity-50",
				className,
			)}
			{...props}
		/>
	);
}

export { Label };
