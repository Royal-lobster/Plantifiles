import { Button } from "@plantifiles/ui/components/button";
import { Input } from "@plantifiles/ui/components/input";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useId, useState } from "react";
import { getWorkspaceSettings, updateWorkspaceSettings } from "#/lib/app-data";
import { guardLoader } from "#/lib/loader-guard";

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
	return (
		<section className="space-y-8">
			<header>
				<p className="font-mono text-accent text-xs uppercase tracking-widest">Workspace / Settings</p>
				<h1 className="mt-2 font-semibold text-3xl tracking-tight">{data.workspace.name}</h1>
			</header>
			<form
				className="max-w-xl space-y-4 rounded-lg border bg-card p-5"
				onSubmit={async (event) => {
					event.preventDefault();
					await update({ data: { slug, name, requiredApprovals } });
					setMessage("Saved");
				}}
			>
				<label className="grid gap-1.5 font-medium text-sm" htmlFor={nameId}>
					Workspace name
				</label>
				<Input id={nameId} value={name} onChange={(event) => setName(event.target.value)} />
				<label className="grid gap-1.5 font-medium text-sm" htmlFor={approvalsId}>
					Required approvals
				</label>
				<Input
					id={approvalsId}
					type="number"
					min={1}
					max={20}
					value={requiredApprovals}
					onChange={(event) => setRequiredApprovals(Number(event.target.value))}
				/>
				<div className="flex items-center gap-3">
					<Button type="submit">Save settings</Button>
					{message && <span className="text-success text-sm">{message}</span>}
				</div>
			</form>
			<div className="max-w-xl space-y-4 rounded-lg border bg-card p-5">
				<div>
					<h2 className="font-semibold text-lg">Slack link unfurls</h2>
					<p className="text-muted-foreground text-sm">
						Show live plan status, version, read time, open decisions, and pending approvals when a plan URL is shared.
					</p>
				</div>
				{data.slack ? (
					<p className="text-sm">
						Connected to <span className="font-medium">{data.slack.teamName ?? data.slack.teamId}</span>
					</p>
				) : (
					<p className="text-muted-foreground text-sm">No Slack workspace connected.</p>
				)}
				{data.role === "owner" || data.role === "admin" ? (
					<Button variant={data.slack ? "outline" : "default"} asChild>
						<a href={`/api/slack/install?workspace=${encodeURIComponent(slug)}`}>
							{data.slack ? "Reconnect Slack" : "Connect Slack"}
						</a>
					</Button>
				) : (
					<p className="text-muted-foreground text-xs">An owner or admin can manage this connection.</p>
				)}
			</div>
			<div className="space-y-3">
				<div>
					<h2 className="font-semibold text-lg">Members</h2>
					<p className="text-muted-foreground text-sm">
						Roles determine who can resolve decisions and change lifecycle state.
					</p>
				</div>
				<div className="overflow-hidden rounded-lg border bg-card">
					{data.members.map((member) => (
						<div key={member.id} className="flex h-14 items-center gap-3 border-b px-4 last:border-b-0">
							<span className="flex size-8 items-center justify-center rounded-full bg-accent/15 font-medium text-accent-foreground text-xs">
								{member.name.slice(0, 2).toUpperCase()}
							</span>
							<span className="min-w-0 flex-1">
								<span className="block truncate font-medium text-sm">{member.name}</span>
								<span className="block truncate text-muted-foreground text-xs">{member.email}</span>
							</span>
							<span className="rounded-full bg-muted px-2 py-1 text-muted-foreground text-xs capitalize">
								{member.role}
							</span>
						</div>
					))}
				</div>
			</div>
		</section>
	);
}
