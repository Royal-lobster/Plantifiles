import { Badge } from "@plantifiles/ui/components/badge";
import { cn } from "@plantifiles/ui/lib/utils";
import type { ComponentProps } from "react";
import type { PlanStatus } from "#/lib/app-data";

type BadgeProps = ComponentProps<typeof Badge>;

/* One mapping, consumed by the dashboard and the reader masthead. Green is the
   product, so review states carry brand ink and only genuinely good outcomes
   claim --success. */
const STATUS_VARIANT: Record<PlanStatus, NonNullable<BadgeProps["variant"]>> = {
	draft: "secondary",
	in_review: "brand",
	approved: "success",
	building: "brand",
	shipped: "success-outline",
	archived: "quiet",
};

function StatusChip({
	status,
	size,
	className,
}: {
	status: PlanStatus;
	size?: BadgeProps["size"];
	className?: string;
}) {
	return (
		<Badge
			variant={STATUS_VARIANT[status]}
			size={size}
			className={cn("font-mono tracking-[0.12em]", className)}
			data-status={status}
		>
			{status === "building" && <span className="size-1.5 animate-pulse rounded-full bg-current" />}
			{status.replace("_", " ")}
		</Badge>
	);
}

export { StatusChip, STATUS_VARIANT };
