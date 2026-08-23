import { Button } from "@plantifiles/ui/components/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@plantifiles/ui/components/dropdown-menu";
import { ArrowRightLeft, Check, FileDown, History, MoreHorizontal } from "lucide-react";
import { useState } from "react";
import { useClipboard } from "#/lib/helpers/use-clipboard";
import { PlanMoveDialog } from "./plan-move-dialog";

export function PlanActionsMenu({
	planId,
	planSlug,
	workspaceSlug,
	canMove,
}: {
	planId: string;
	planSlug: string;
	workspaceSlug: string;
	canMove: boolean;
}) {
	const clipboard = useClipboard();
	const [moveOpen, setMoveOpen] = useState(false);

	async function copyMarkdownUrl() {
		const url = new URL(window.location.href);
		url.search = "";
		url.searchParams.set("format", "md");
		url.hash = "";
		await clipboard.copy(url.toString());
	}

	return (
		<div className="flex flex-col items-end gap-2">
			<DropdownMenu>
				<DropdownMenuTrigger asChild>
					<Button variant="outline" size="icon-sm" aria-label="More plan actions">
						<MoreHorizontal />
					</Button>
				</DropdownMenuTrigger>
				<DropdownMenuContent align="end" className="w-60">
					<DropdownMenuItem onSelect={() => void copyMarkdownUrl()}>
						{clipboard.status === "copied" ? <Check /> : <FileDown />}
						{clipboard.status === "copied" ? "Copied Markdown URL" : "Copy Markdown URL"}
					</DropdownMenuItem>
					<DropdownMenuSeparator />
					<DropdownMenuItem asChild>
						<a href="#version-history">
							<History /> Version history
						</a>
					</DropdownMenuItem>
					{canMove ? (
						<>
							<DropdownMenuSeparator />
							<DropdownMenuItem onSelect={() => setMoveOpen(true)}>
								<ArrowRightLeft /> Move to another organization
							</DropdownMenuItem>
						</>
					) : null}
				</DropdownMenuContent>
			</DropdownMenu>
			{canMove ? (
				<PlanMoveDialog
					planId={planId}
					planSlug={planSlug}
					workspaceSlug={workspaceSlug}
					open={moveOpen}
					onOpenChange={setMoveOpen}
				/>
			) : null}
			{clipboard.status === "error" ? (
				<p className="max-w-xs text-right text-destructive text-sm" role="alert">
					Could not copy the Markdown URL.
				</p>
			) : null}
		</div>
	);
}
