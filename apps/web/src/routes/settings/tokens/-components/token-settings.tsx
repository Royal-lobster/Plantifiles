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
					Run <code className="font-mono">plantifiles login</code> to connect a terminal — it approves in the browser
					and no secret is ever pasted. Create a token by hand only where no browser exists, such as CI. Every token
					expires after 90 days.
				</p>
			</header>

			<SettingsSection
				icon={KeyRound}
				title="Tokens"
				description="Credentials issued to command-line tools and agents, however they were created."
			>
				<CreateTokenForm />
				<SettingsRowDivider />
				<TokenList tokens={tokens} />
			</SettingsSection>
		</section>
	);
}
