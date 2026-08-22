import { Button } from "@plantifiles/ui/components/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@plantifiles/ui/components/dialog";
import { Check, Copy } from "lucide-react";
import { useClipboard } from "#/lib/helpers/use-clipboard";
import { TokenFeedback } from "./token-feedback";

export function CreatedTokenDialog({
	token,
	onClose,
}: {
	token: { name: string; value: string };
	onClose: () => void;
}) {
	const clipboard = useClipboard();

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
				<div className="surface-inset flex items-center gap-2 p-2 pl-4">
					<code className="min-w-0 flex-1 break-all font-mono text-xs">{token.value}</code>
					<Button
						size="icon"
						variant="ghost"
						aria-label={clipboard.status === "copied" ? "Token copied" : "Copy token"}
						onClick={() => void clipboard.copy(token.value)}
					>
						{clipboard.status === "copied" ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
					</Button>
				</div>
				<TokenFeedback
					feedback={
						clipboard.status === "copied"
							? { kind: "success", message: "Token copied to the clipboard." }
							: clipboard.status === "error"
								? { kind: "error", message: "The token could not be copied." }
								: undefined
					}
				/>
			</DialogContent>
		</Dialog>
	);
}
