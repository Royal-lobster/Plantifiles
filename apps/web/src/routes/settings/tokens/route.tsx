import { createFileRoute } from "@tanstack/react-router";
import { guardLoader } from "#/lib/helpers/loader-guard";
import { TokenSettings } from "./-components/token-settings";
import { getTokensForPage } from "./-data/tokens";

export const Route = createFileRoute("/settings/tokens")({
	loader: () => guardLoader(() => getTokensForPage()),
	component: TokenSettings,
	pendingComponent: () => <div className="h-64 animate-pulse rounded-lg bg-muted" />,
});
