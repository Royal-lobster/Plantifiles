import type { PlanStatus } from "@plantifiles/api-contract";
import { Archive, CheckCircle2, Eye, type LucideIcon, PencilLine } from "lucide-react";
import { StateLabel } from "./state-label";

/**
 * One vocabulary for plan status, shared by the reader's chip and the
 * dashboard's status filter. Green is the product, so review states carry
 * brand ink and only genuinely good outcomes claim --success.
 */
const PLAN_STATUS_PRESENTATION: Record<PlanStatus, { icon: LucideIcon; ink: string }> = {
	draft: { icon: PencilLine, ink: "text-muted-foreground" },
	in_review: { icon: Eye, ink: "text-brand-ink" },
	approved: { icon: CheckCircle2, ink: "text-success" },
	archived: { icon: Archive, ink: "text-muted-foreground/70" },
};

function StatusChip({ status, className }: { status: PlanStatus; className?: string }) {
	const { icon, ink } = PLAN_STATUS_PRESENTATION[status];
	return (
		<StateLabel icon={icon} ink={ink} className={className}>
			{status.replace("_", " ")}
		</StateLabel>
	);
}

export { StatusChip };
