import { Button } from "@plantifiles/ui/components/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@plantifiles/ui/components/dropdown-menu";
import { Check, FileDown, History, MoreHorizontal } from "lucide-react";
import { useClipboard } from "#/lib/helpers/use-clipboard";

export function PlanActionsMenu() {
	const clipboard = useClipboard();

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
				<DropdownMenuContent align="end" className="w-52">
					<DropdownMenuLabel className="label-eyebrow">This plan</DropdownMenuLabel>
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
				</DropdownMenuContent>
			</DropdownMenu>
			{clipboard.status === "error" ? (
				<p className="max-w-xs text-right text-destructive text-sm" role="alert">
					Could not copy the Markdown URL.
				</p>
			) : null}
		</div>
	);
}
