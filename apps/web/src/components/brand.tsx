import { cn } from "@plantifiles/ui/lib/utils";

/**
 * A sturdy P monogram with a leaf-shaped counter. The silhouette reads at
 * favicon scale; the leaf appears as the mark grows without adding fine lines.
 */

function LogoMark({ className }: { className?: string }) {
	return (
		<span className={cn("grid size-7 shrink-0 place-items-center text-primary", className)}>
			<svg viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false" className="size-6">
				<path
					d="M7 20V4h6.2C17.4 4 20 6.35 20 10.1c0 3.9-2.75 6.4-7.05 6.4H10V20H7Zm3.1-6.45c.3-3.4 2.4-5.65 6.55-5.8-.28 3.57-2.5 5.8-6.55 5.8Z"
					fill="currentColor"
					fillRule="evenodd"
					clipRule="evenodd"
				/>
			</svg>
		</span>
	);
}

export { LogoMark };
