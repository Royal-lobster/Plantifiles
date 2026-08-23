import { createFileRoute } from "@tanstack/react-router";
import { guardLoader } from "#/lib/helpers/loader-guard";
import { ApiKeySettings, ApiKeySettingsSkeleton } from "./-components/api-key-settings";
import { listApiKeys } from "./-data/api-keys";

export const Route = createFileRoute("/settings/api-keys")({
	loader: () => guardLoader(() => listApiKeys()),
	component: ApiKeySettings,
	pendingComponent: ApiKeySettingsSkeleton,
});
