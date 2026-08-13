import { createFileRoute } from "@tanstack/react-router";
import { guardLoader } from "#/lib/helpers/loader-guard";
import { WorkspaceSettings } from "./-components/workspace-settings";
import { getWorkspaceSettings } from "./-data/workspace-settings";

export const Route = createFileRoute("/w/$slug/settings")({
	loader: ({ params }) => guardLoader(() => getWorkspaceSettings({ data: params })),
	component: WorkspaceSettings,
	pendingComponent: () => <div className="h-80 animate-pulse rounded-lg bg-muted" />,
});
