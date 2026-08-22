import { createFileRoute } from "@tanstack/react-router";
import { guardLoader } from "#/lib/helpers/loader-guard";
import { ApiKeySettings } from "./-components/api-key-settings";
import { listApiKeys } from "./-data/api-keys";

export const Route = createFileRoute("/settings/api-keys")({
	loader: () => guardLoader(() => listApiKeys()),
	component: ApiKeySettings,
	pendingComponent: () => <div className="h-64 animate-pulse rounded-2xl bg-muted" />,
});
