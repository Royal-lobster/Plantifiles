import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

function SettingsSection({
	id,
	icon: Icon,
	title,
	description,
	children,
}: {
	id: string;
	icon: LucideIcon;
	title: string;
	description?: string;
	children: ReactNode;
}) {
	return (
		<section id={id} className="scroll-mt-20 space-y-3" aria-labelledby={`${id}-heading`}>
			<div className="flex items-start gap-3">
				<div className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
					<Icon className="size-4" />
				</div>
				<div className="space-y-0.5">
					<h2 id={`${id}-heading`} className="font-medium text-base leading-tight">
						{title}
					</h2>
					{description ? <p className="text-muted-foreground text-sm">{description}</p> : null}
				</div>
			</div>
			<div className="rounded-xl border bg-card">{children}</div>
		</section>
	);
}

function SettingsRow({ label, hint, control }: { label: ReactNode; hint?: ReactNode; control: ReactNode }) {
	return (
		<div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
			<div className="min-w-0 flex-1 space-y-0.5">
				<div className="font-medium text-sm">{label}</div>
				{hint ? <div className="text-muted-foreground text-xs leading-snug">{hint}</div> : null}
			</div>
			<div className="w-full shrink-0 sm:w-auto">{control}</div>
		</div>
	);
}

function SettingsRowDivider() {
	return <div className="border-t" aria-hidden="true" />;
}

export { SettingsRow, SettingsRowDivider, SettingsSection };
