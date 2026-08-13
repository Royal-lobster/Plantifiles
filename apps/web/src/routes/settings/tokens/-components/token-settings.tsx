import { getRouteApi } from "@tanstack/react-router";
import { KeyRound } from "lucide-react";
import { SettingsRowDivider, SettingsSection } from "../../../../components/settings-section";
import { CreateTokenForm } from "./create-token-form";
import { TokenList } from "./token-list";

const route = getRouteApi("/settings/tokens");

export function TokenSettings() {
	const tokens = route.useLoaderData();

	return (
		<section className="space-y-8">
			<header>
				<h1 className="font-medium text-2xl tracking-tight">Agent tokens</h1>
				<p className="mt-1 text-muted-foreground text-sm">
					Tokens authenticate the CLI and MCP server. A plaintext token is shown once.
				</p>
			</header>

			<SettingsSection
				icon={KeyRound}
				title="Tokens"
				description="Create and revoke credentials for agents and command-line tools."
			>
				<CreateTokenForm />
				<SettingsRowDivider />
				<TokenList tokens={tokens} />
			</SettingsSection>
		</section>
	);
}
