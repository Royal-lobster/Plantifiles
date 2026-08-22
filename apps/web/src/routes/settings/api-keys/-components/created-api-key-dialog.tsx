import { Button } from "@plantifiles/ui/components/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@plantifiles/ui/components/dialog";
import { Check, Copy } from "lucide-react";
import { useClipboard } from "#/lib/helpers/use-clipboard";
import { ApiKeyFeedback } from "./api-key-feedback";

export function CreatedApiKeyDialog({
	apiKey,
	onClose,
}: {
	apiKey: { name: string; secret: string };
	onClose: () => void;
}) {
	const clipboard = useClipboard();

	return (
		<Dialog open onOpenChange={(open) => !open && onClose()}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Copy this API key now</DialogTitle>
					<DialogDescription>
						Clerk reveals the secret only at creation. Store it in the secret manager that will use it.
					</DialogDescription>
				</DialogHeader>
				<output className="block text-success text-sm" aria-live="polite">
					{apiKey.name} was created. Copy it before closing this dialog.
				</output>
				<div className="surface-inset flex items-center gap-2 p-2 pl-4">
					<code className="min-w-0 flex-1 break-all font-mono text-xs" data-testid="created-api-key">
						{apiKey.secret}
					</code>
					<Button
						size="icon"
						variant="ghost"
						aria-label={clipboard.status === "copied" ? "API key copied" : "Copy API key"}
						onClick={() => void clipboard.copy(apiKey.secret)}
					>
						{clipboard.status === "copied" ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
					</Button>
				</div>
				<ApiKeyFeedback
					feedback={
						clipboard.status === "copied"
							? { kind: "success", message: "API key copied to the clipboard." }
							: clipboard.status === "error"
								? { kind: "error", message: "The API key could not be copied." }
								: undefined
					}
				/>
			</DialogContent>
		</Dialog>
	);
}
