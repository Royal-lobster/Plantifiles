import { Button } from "@plantifiles/ui/components/button";
import { Input } from "@plantifiles/ui/components/input";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Building2, ShieldCheck, Users } from "lucide-react";
import { Fragment, useId, useState } from "react";
import { getWorkspaceSettings, updateWorkspaceSettings } from "#/lib/app-data";
import { guardLoader } from "#/lib/loader-guard";
import { Avatar } from "./-components/brand";
import { SettingsRow, SettingsRowDivider, SettingsSection } from "./-components/settings-section";

export const Route = createFileRoute("/w/$slug/settings")({
	loader: ({ params }) => guardLoader(() => getWorkspaceSettings({ data: params })),
	component: WorkspaceSettings,
	pendingComponent: () => <div className="h-80 animate-pulse rounded-lg bg-muted" />,
});

function WorkspaceSettings() {
	const data = Route.useLoaderData();
	const { slug } = Route.useParams();
	const update = useServerFn(updateWorkspaceSettings);
	const [name, setName] = useState(data.workspace.name);
	const [requiredApprovals, setRequiredApprovals] = useState(data.workspace.requiredApprovals);
	const [message, setMessage] = useState("");
	const nameId = useId();
	const approvalsId = useId();
	const workspaceSectionId = useId();
	const reviewSectionId = useId();
	const membersSectionId = useId();
	const canSave = data.role === "owner";

	return (
		<section className="space-y-8">
			<header>
				<h1 className="font-medium text-2xl tracking-tight">Settings</h1>
				<p className="mt-1 text-muted-foreground text-sm">Workspace identity, review policy, and access.</p>
			</header>

			<form
				className="space-y-6"
				onSubmit={async (event) => {
					event.preventDefault();
					if (!canSave) return;
					await update({ data: { slug, name, requiredApprovals } });
					setMessage("Saved");
				}}
			>
				<SettingsSection
					id={workspaceSectionId}
					icon={Building2}
					title="Workspace"
					description="The identity shared by every plan in this workspace."
				>
					<SettingsRow
						label="Name"
						hint="Shown in navigation and workspace context."
						control={
							<Input
								id={nameId}
								aria-label="Workspace name"
								value={name}
								disabled={!canSave}
								required
								onChange={(event) => {
									setName(event.target.value);
									setMessage("");
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

				<SettingsSection
					id={reviewSectionId}
					icon={ShieldCheck}
					title="Review"
					description="The approval gate for plans in this workspace."
				>
					<SettingsRow
						label="Required approvals"
						hint="A plan cannot reach the approved status until its current version has this many approvals."
						control={
							<Input
								id={approvalsId}
								aria-label="Required approvals"
								type="number"
								min={1}
								max={20}
								value={requiredApprovals}
								disabled={!canSave}
								onChange={(event) => {
									setRequiredApprovals(Number(event.target.value));
									setMessage("");
								}}
							/>
						}
					/>
				</SettingsSection>

				<div className="flex flex-wrap items-center justify-end gap-3 border-t pt-4">
					{canSave ? (
						<>
							{message ? <span className="text-success text-sm">{message}</span> : null}
							<Button type="submit">Save settings</Button>
						</>
					) : (
						<p className="text-muted-foreground text-sm">Only workspace owners can change these settings.</p>
					)}
				</div>
			</form>

			<SettingsSection
				id={membersSectionId}
				icon={Users}
				title="Members"
				description="People who can read, review, and manage plans in this workspace."
			>
				{data.members.length === 0 ? (
					<div className="px-4 py-8 text-center">
						<Users className="mx-auto size-6 text-muted-foreground" />
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
										<Avatar seed={member.id} name={member.name} className="size-8" />
										<span className="min-w-0">
											<span className="block truncate">{member.name}</span>
											<span className="block truncate font-normal text-muted-foreground text-xs">{member.email}</span>
										</span>
									</span>
								}
								control={
									<span className="inline-flex rounded-full bg-muted px-2 py-1 text-muted-foreground text-xs capitalize">
										{member.role}
									</span>
								}
							/>
						</Fragment>
					))
				)}
			</SettingsSection>
		</section>
	);
}
