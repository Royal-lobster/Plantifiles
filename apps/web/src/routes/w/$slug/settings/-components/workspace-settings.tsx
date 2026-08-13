import { Badge } from "@plantifiles/ui/components/badge";
import { Button } from "@plantifiles/ui/components/button";
import { Input } from "@plantifiles/ui/components/input";
import { getRouteApi, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Building2, ShieldCheck, Users } from "lucide-react";
import { Fragment, useId, useRef, useState } from "react";
import { updateWorkspaceSettings } from "../-data/workspace-settings";
import { Avatar } from "../../../../../components/brand";
import { SettingsRow, SettingsRowDivider, SettingsSection } from "../../../../../components/settings-section";

const route = getRouteApi("/w/$slug/settings");

type SaveFeedback = { kind: "error" | "success"; message: string };

function saveError(error: unknown) {
	return error instanceof Error && error.message
		? `Settings could not be saved. ${error.message}`
		: "Settings could not be saved.";
}

export function WorkspaceSettings() {
	const data = route.useLoaderData();
	const { slug } = route.useParams();
	const update = useServerFn(updateWorkspaceSettings);
	const router = useRouter();
	const [name, setName] = useState(data.workspace.name);
	const [requiredApprovals, setRequiredApprovals] = useState(data.workspace.requiredApprovals);
	const [feedback, setFeedback] = useState<SaveFeedback>();
	const [saving, setSaving] = useState(false);
	const saveInFlight = useRef(false);
	const nameId = useId();
	const approvalsId = useId();
	const canSave = data.role === "owner";

	return (
		<section className="space-y-8">
			<header>
				<h1 className="font-medium text-2xl tracking-tight">Settings</h1>
				<p className="mt-1 text-muted-foreground text-sm">Workspace identity, review policy, and access.</p>
			</header>

			<form
				className="space-y-6"
				aria-busy={saving}
				onSubmit={async (event) => {
					event.preventDefault();
					if (!canSave || saveInFlight.current) return;
					saveInFlight.current = true;
					setSaving(true);
					setFeedback(undefined);
					try {
						const saved = await update({ data: { slug, name, requiredApprovals } });
						setName(saved.name);
						setRequiredApprovals(saved.requiredApprovals);
						try {
							await router.invalidate();
						} catch {
							setFeedback({
								kind: "error",
								message: "Settings saved, but navigation could not be refreshed. Reload to see the change.",
							});
							return;
						}
						setFeedback({ kind: "success", message: "Settings saved." });
					} catch (error) {
						setFeedback({ kind: "error", message: saveError(error) });
					} finally {
						saveInFlight.current = false;
						setSaving(false);
					}
				}}
			>
				<SettingsSection
					icon={Building2}
					title="Workspace"
					description="The identity shared by every plan in this workspace."
				>
					<SettingsRow
						label="Name"
						labelFor={nameId}
						hint="Shown in navigation and workspace context."
						control={
							<Input
								id={nameId}
								aria-label="Name"
								value={name}
								disabled={!canSave || saving}
								required
								onChange={(event) => {
									setName(event.target.value);
									setFeedback(undefined);
								}}
							/>
						}
					/>
					<SettingsRowDivider />
					<SettingsRow
						label="Slug"
						hint="Read-only because it appears in every plan URL."
						control={
							<code className="rounded-md bg-muted px-2.5 py-1.5 font-mono text-muted-foreground text-xs">
								/{data.workspace.slug}
							</code>
						}
					/>
				</SettingsSection>

				<SettingsSection icon={ShieldCheck} title="Review" description="The approval gate for plans in this workspace.">
					<SettingsRow
						label="Required approvals"
						labelFor={approvalsId}
						hint="A plan cannot reach the approved status until its current version has this many approvals."
						control={
							<Input
								id={approvalsId}
								aria-label="Required approvals"
								type="number"
								min={1}
								max={20}
								value={requiredApprovals}
								disabled={!canSave || saving}
								onChange={(event) => {
									setRequiredApprovals(Number(event.target.value));
									setFeedback(undefined);
								}}
							/>
						}
					/>
				</SettingsSection>

				<div className="flex flex-wrap items-center justify-end gap-3 border-t pt-4">
					{canSave ? (
						<>
							{feedback ? (
								<p
									className={feedback.kind === "error" ? "text-destructive text-sm" : "text-success text-sm"}
									role={feedback.kind === "error" ? "alert" : "status"}
									aria-live={feedback.kind === "error" ? "assertive" : "polite"}
								>
									{feedback.message}
								</p>
							) : null}
							<Button type="submit" disabled={saving}>
								{saving ? "Saving…" : "Save settings"}
							</Button>
						</>
					) : (
						<p className="text-muted-foreground text-sm">Only workspace owners can change these settings.</p>
					)}
				</div>
			</form>

			<SettingsSection
				icon={Users}
				title="Members"
				description="People who can read, review, and manage plans in this workspace."
			>
				{data.members.length === 0 ? (
					<div className="px-4 py-8 text-center">
						<Users className="mx-auto size-6 text-muted-foreground" aria-hidden="true" />
						<p className="mt-2 font-medium text-sm">No workspace members</p>
						<p className="mt-1 text-muted-foreground text-xs">Members will appear here when they join.</p>
					</div>
				) : (
					data.members.map((member, index) => (
						<Fragment key={member.id}>
							{index > 0 ? <SettingsRowDivider /> : null}
							<SettingsRow
								label={
									<span className="flex min-w-0 items-center gap-3">
										<Avatar seed={member.id} name={member.name} image={member.image} className="size-8" />
										<span className="min-w-0">
											<span className="block truncate">{member.name}</span>
											<span className="block truncate font-normal text-muted-foreground text-xs">{member.email}</span>
										</span>
									</span>
								}
								control={<Badge variant="secondary">{member.role}</Badge>}
							/>
						</Fragment>
					))
				)}
			</SettingsSection>
		</section>
	);
}
