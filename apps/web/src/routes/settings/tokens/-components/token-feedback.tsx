export type TokenFeedbackValue = { kind: "error" | "success"; message: string };

export function tokenActionError(error: unknown, fallback: string): string {
	return error instanceof Error && error.message ? `${fallback} ${error.message}` : fallback;
}

export function TokenFeedback({ feedback }: { feedback: TokenFeedbackValue | undefined }) {
	if (!feedback) return null;
	return (
		<p
			className={feedback.kind === "error" ? "text-destructive text-sm" : "text-success text-sm"}
			role={feedback.kind === "error" ? "alert" : "status"}
			aria-live={feedback.kind === "error" ? "assertive" : "polite"}
		>
			{feedback.message}
		</p>
	);
}
