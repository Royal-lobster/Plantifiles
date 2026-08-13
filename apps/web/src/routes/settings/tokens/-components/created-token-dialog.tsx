import { Button } from "@plantifiles/ui/components/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@plantifiles/ui/components/dialog";
import { Check, Copy } from "lucide-react";
import { useReducer } from "react";
import { tokenActionError, TokenFeedback, type TokenFeedbackValue } from "./token-feedback";

type CopyState = { copied: boolean; feedback?: TokenFeedbackValue };

type CopyAction = { type: "copying" } | { type: "copied" } | { type: "failed"; feedback: TokenFeedbackValue };

function copyReducer(_state: CopyState, action: CopyAction): CopyState {
	switch (action.type) {
		case "copying":
			return { copied: false };
		case "copied":
			return { copied: true, feedback: { kind: "success", message: "Token copied to the clipboard." } };
		case "failed":
			return { copied: false, feedback: action.feedback };
	}
}

export function CreatedTokenDialog({
	token,
	onClose,
}: {
	token: { name: string; value: string };
	onClose: () => void;
}) {
	const [copy, dispatch] = useReducer(copyReducer, { copied: false });

	async function copyToken() {
		dispatch({ type: "copying" });
		try {
			await navigator.clipboard.writeText(token.value);
			dispatch({ type: "copied" });
		} catch (error) {
			dispatch({
				type: "failed",
				feedback: { kind: "error", message: tokenActionError(error, "The token could not be copied.") },
			});
		}
	}

	return (
		<Dialog open onOpenChange={(open) => !open && onClose()}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Copy this token now</DialogTitle>
					<DialogDescription>
						Plantifiles stores only its SHA-256 hash. It cannot reveal this value again.
					</DialogDescription>
				</DialogHeader>
				<output className="block text-success text-sm" aria-live="polite">
					{token.name} was created. Copy it before closing this dialog.
				</output>
				<div className="flex items-center gap-2 rounded-md border bg-muted/40 p-2 pl-3">
					<code className="min-w-0 flex-1 break-all font-mono text-xs">{token.value}</code>
					<Button
						size="icon"
						variant="ghost"
						aria-label={copy.copied ? "Token copied" : "Copy token"}
						onClick={() => void copyToken()}
					>
						{copy.copied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
					</Button>
				</div>
				<TokenFeedback feedback={copy.feedback} />
			</DialogContent>
		</Dialog>
	);
}
