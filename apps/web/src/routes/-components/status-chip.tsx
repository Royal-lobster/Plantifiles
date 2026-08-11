import { cn } from "@plantifiles/ui/lib/utils";
import { cva } from "class-variance-authority";

export type PlanStatus = "draft" | "in_review" | "approved" | "building" | "shipped" | "archived";

const statusVariants = cva(
	"inline-flex h-5 items-center gap-1.5 rounded-full px-2 text-[11px] font-medium uppercase tracking-wide",
	{
		variants: {
			status: {
				draft: "bg-muted text-muted-foreground",
				in_review: "bg-accent/15 text-accent-foreground",
				approved: "bg-success/15 text-success",
				building: "bg-accent/15 text-accent-foreground",
				shipped: "border border-success/50 text-success",
				archived: "bg-muted text-muted-foreground/70",
			},
		},
	},
);

function StatusChip({ status, className }: { status: PlanStatus; className?: string }) {
	return (
		<span className={cn(statusVariants({ status }), className)} data-status={status}>
			{status === "building" && <span className="size-1.5 animate-pulse rounded-full bg-current" />}
			{status.replace("_", " ")}
		</span>
	);
}

export { StatusChip, statusVariants };
