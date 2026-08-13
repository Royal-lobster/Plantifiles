import { cn } from "@plantifiles/ui/lib/utils";

/**
 * A sturdy P monogram with a leaf-shaped counter. The silhouette reads at
 * favicon scale; the leaf appears as the mark grows without adding fine lines.
 */
function Logo({ className }: { className?: string }) {
	return (
		<svg viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false" className={cn("size-4", className)}>
			<path
				d="M7 20V4h6.2C17.4 4 20 6.35 20 10.1c0 3.9-2.75 6.4-7.05 6.4H10V20H7Zm3.1-6.45c.3-3.4 2.4-5.65 6.55-5.8-.28 3.57-2.5 5.8-6.55 5.8Z"
				fill="currentColor"
				fillRule="evenodd"
				clipRule="evenodd"
			/>
		</svg>
	);
}

function LogoMark({ className }: { className?: string }) {
	return (
		<span className={cn("grid size-7 shrink-0 place-items-center text-primary", className)}>
			<Logo className="size-6" />
		</span>
	);
}

/** Deterministic 32-bit hash, so the same person always gets the same avatar. */
function hash(seed: string): number {
	let value = 2166136261;
	for (let index = 0; index < seed.length; index += 1) {
		value ^= seed.charCodeAt(index);
		value = Math.imul(value, 16777619);
	}
	return Math.abs(value);
}

const AVATAR_TRACKS = ["--color-chart-1", "--color-chart-2", "--color-chart-3", "--color-chart-4", "--color-chart-5"];

/**
 * Generated from the user id rather than fetched, so it works offline, costs no
 * request, and follows the active theme: every colour comes from the chart ramp
 * the current palette already defines.
 */
function Avatar({
	seed,
	name,
	image,
	className,
}: {
	seed: string;
	name: string;
	image?: string | null;
	className?: string;
}) {
	const shell = cn("relative size-7 shrink-0 overflow-hidden rounded-full", className);
	if (image) {
		return <img src={image} alt={name} className={cn(shell, "object-cover")} />;
	}

	const value = hash(seed);
	const base = AVATAR_TRACKS[value % AVATAR_TRACKS.length];
	const accent = AVATAR_TRACKS[(value >> 3) % AVATAR_TRACKS.length];
	const cx = 8 + (value % 9);
	const cy = 9 + ((value >> 5) % 8);
	const angle = (value >> 7) % 90;

	return (
		<span className={shell} role="img" aria-label={name}>
			<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" className="size-full">
				<rect width="24" height="24" fill={`var(${base})`} opacity="0.45" />
				<circle cx={cx} cy={cy} r="7" fill={`var(${accent})`} opacity="0.85" />
				<rect
					x="12"
					y="14"
					width="14"
					height="14"
					rx="3"
					fill={`var(${base})`}
					transform={`rotate(${angle} 19 21)`}
					opacity="0.9"
				/>
			</svg>
		</span>
	);
}

export { Avatar, LogoMark };
