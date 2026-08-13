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
import { useEffect, useReducer, useRef } from "react";

type CopyState = { status: "idle" | "copied" | "error"; error: string };
type CopyAction = { type: "started" } | { type: "copied" } | { type: "failed"; error: string } | { type: "reset" };

function copyReducer(_state: CopyState, action: CopyAction): CopyState {
	switch (action.type) {
		case "started":
		case "reset":
			return { status: "idle", error: "" };
		case "copied":
			return { status: "copied", error: "" };
		case "failed":
			return { status: "error", error: action.error };
	}
}

export function PlanActionsMenu() {
	const [copy, dispatch] = useReducer(copyReducer, { status: "idle", error: "" });
	const attempt = useRef(0);
	const resetTimer = useRef<number | undefined>(undefined);

	useEffect(
		() => () => {
			attempt.current += 1;
			window.clearTimeout(resetTimer.current);
		},
		[],
	);

	async function copyMarkdownUrl() {
		const currentAttempt = ++attempt.current;
		window.clearTimeout(resetTimer.current);
		dispatch({ type: "started" });
		try {
			const url = new URL(window.location.href);
			url.search = "";
			url.searchParams.set("format", "md");
			url.hash = "";
			await navigator.clipboard.writeText(url.toString());
			if (currentAttempt !== attempt.current) return;
			dispatch({ type: "copied" });
			resetTimer.current = window.setTimeout(() => dispatch({ type: "reset" }), 1500);
		} catch (error) {
			if (currentAttempt !== attempt.current) return;
			dispatch({
				type: "failed",
				error: error instanceof Error ? error.message : "Clipboard access failed.",
			});
		}
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
						{copy.status === "copied" ? <Check /> : <FileDown />}
						{copy.status === "copied" ? "Copied Markdown URL" : "Copy Markdown URL"}
					</DropdownMenuItem>
					<DropdownMenuSeparator />
					<DropdownMenuItem asChild>
						<a href="#version-history">
							<History /> Version history
						</a>
					</DropdownMenuItem>
				</DropdownMenuContent>
			</DropdownMenu>
			{copy.status === "error" ? (
				<p className="max-w-xs text-right text-destructive text-sm" role="alert">
					Could not copy the Markdown URL: {copy.error}
				</p>
			) : null}
		</div>
	);
}
