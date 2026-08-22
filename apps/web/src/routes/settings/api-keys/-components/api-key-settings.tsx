import { getRouteApi } from "@tanstack/react-router";
import { KeyRound } from "lucide-react";
import { SettingsRowDivider, SettingsSection } from "../../../../components/settings-section";
import { ApiKeyList } from "./api-key-list";
import { CreateApiKeyForm } from "./create-api-key-form";

const route = getRouteApi("/settings/api-keys");

export function ApiKeySettings() {
	const apiKeys = route.useLoaderData();

	return (
		<section className="space-y-8">
			<header>
				<h1 className="font-medium text-2xl tracking-tight">API keys</h1>
				<p className="mt-1 text-muted-foreground text-sm">
					Run <code className="font-mono">plantifiles login</code> to connect a terminal — Clerk authorizes it in the
					browser and the CLI keeps the session in your keychain. Create a key by hand only where no browser exists,
					such as CI. Every key is scoped to you and expires after 90 days.
				</p>
			</header>

			<SettingsSection
				icon={KeyRound}
				title="Keys"
				description="Credentials issued to pipelines and headless agents that cannot complete a browser sign-in."
			>
				<CreateApiKeyForm />
				<SettingsRowDivider />
				<ApiKeyList apiKeys={apiKeys} />
			</SettingsSection>
		</section>
	);
}
