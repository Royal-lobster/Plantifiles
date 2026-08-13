import { Badge } from "@plantifiles/ui/components/badge";
import { cn } from "@plantifiles/ui/lib/utils";
import type { ComponentProps } from "react";
import type { PlanStatus } from "#/lib/data/plan-types";

type BadgeProps = ComponentProps<typeof Badge>;

/* Green is the product, so review states carry brand ink and only genuinely
   good outcomes claim --success. */
const statusVariant: Record<PlanStatus, NonNullable<BadgeProps["variant"]>> = {
	draft: "secondary",
	in_review: "brand",
	approved: "success",
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
		<Badge variant={statusVariant[status]} size={size} className={cn("font-mono tracking-[0.12em]", className)}>
			{status.replace("_", " ")}
		</Badge>
	);
}

export { StatusChip };
