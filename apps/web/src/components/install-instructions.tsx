import { Button } from "@plantifiles/ui/components/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@plantifiles/ui/components/tabs";
import { cn } from "@plantifiles/ui/lib/utils";
import { Bot, Check, ChevronDown, Copy, User } from "lucide-react";
import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useClipboard } from "#/lib/helpers/use-clipboard";

/** The repo the skills CLI resolves `write-plan` from. */
const SKILL_INSTALL = "npx skills add Royal-lobster/Plantifiles -g";

const PUSH_EXAMPLE = "plantifiles push plan.mdx --workspace <workspace-slug>";
const PUSH_EXAMPLE_SHORT = "plantifiles push plan.mdx -w <workspace-slug>";

/**
 * The prompt a person pastes into their coding agent. One block, because the
 * agent reads it in one gulp: install, skill, browser login with the API-key
 * fallback, verify, and the push command that produces the very plans this
 * dashboard is waiting for. The workspace stays a placeholder: whoever copies
 * this substitutes their own.
 */
function agentPrompt(): string {
	return [
		"Set up Plantifiles on this machine:",
		"",
		"1. Install the CLI globally: npm install -g plantifiles",
		`2. Install the write-plan skill globally: ${SKILL_INSTALL}`,
		"3. Run: plantifiles login",
		"   A browser opens. After I sign in, paste the one-time code it shows into the terminal.",
		"   If no browser is available (CI or a headless box), ask me for a user API key from",
		"   https://plantifiles.com/settings/api-keys and export PLANTIFILES_TOKEN plus",
		"   PLANTIFILES_BASE_URL=https://plantifiles.com instead of logging in.",
		"4. Verify with: plantifiles whoami",
		"",
		`Publish plans with: ${PUSH_EXAMPLE}`,
	].join("\n");
}

function CopyButton({ label, text }: { label: string; text: string }) {
	const clipboard = useClipboard();
	return (
		<Button
			size="icon-sm"
			variant="quiet"
			aria-label={clipboard.status === "copied" ? `${label} copied` : `Copy ${label}`}
			onClick={() => void clipboard.copy(text)}
		>
			{clipboard.status === "copied" ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
		</Button>
	);
}

function CopyRow({ label, command }: { label: string; command: string }) {
	return (
		<div className="flex min-w-0 flex-col gap-1.5">
			<div className="label-eyebrow">{label}</div>
			<div className="surface-inset flex items-center gap-3 p-2 pl-4">
				<code className="min-w-0 flex-1 font-mono text-xs/5 break-words whitespace-pre-wrap">{command}</code>
				<CopyButton label={label} text={command} />
			</div>
		</div>
	);
}

/**
 * Setup for both audiences in one panel. Defaults to the Agent tab: the common
 * path is one copy-paste into the agent that shares the terminal, so the prompt
 * ships collapsed behind a copy button and only opens on request.
 */
export function InstallInstructions({ className }: { className?: string }) {
	const [promptOpen, setPromptOpen] = useState(false);

	return (
		<Tabs defaultValue="agent" className={cn("w-full", className)}>
			<TabsList>
				<TabsTrigger value="agent">
					<Bot aria-hidden="true" />
					Agent
				</TabsTrigger>
				<TabsTrigger value="human">
					<User aria-hidden="true" />
					Human
				</TabsTrigger>
			</TabsList>

			<TabsContent value="agent" className="flex flex-col gap-3">
				<p className="text-muted-foreground text-sm leading-6">
					One paste into the coding agent that shares your terminal — it installs the CLI and the plan skill, then signs
					in.
				</p>
				<div className="surface-inset flex items-center gap-3 p-3 pl-4">
					<Bot aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
					<div className="min-w-0 flex-1">
						<div className="font-medium text-sm">Setup prompt</div>
						<div className="text-muted-foreground text-xs">CLI, plan skill, sign-in, verify.</div>
					</div>
					<Button variant="quiet" size="sm" aria-expanded={promptOpen} onClick={() => setPromptOpen((open) => !open)}>
						{promptOpen ? "Hide" : "Show"}
						<ChevronDown aria-hidden="true" className={cn("transition-transform", promptOpen && "rotate-180")} />
					</Button>
					<CopyButton label="agent setup instructions" text={agentPrompt()} />
				</div>
				{promptOpen ? (
					<pre className="surface-inset overflow-x-auto p-4 font-mono text-xs leading-5 whitespace-pre-wrap">
						{agentPrompt()}
					</pre>
				) : null}
			</TabsContent>
			<TabsContent value="human" className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
				<CopyRow label="Install the CLI" command="npm install -g plantifiles" />
				<CopyRow label="Install the write-plan skill" command={SKILL_INSTALL} />
				<CopyRow label="Sign in" command="plantifiles login" />
				<CopyRow label="Publish a plan" command={PUSH_EXAMPLE_SHORT} />
				<p className="text-muted-foreground text-xs leading-5 sm:col-span-2">
					Headless or CI? Create a user API key in <Link to="/settings/api-keys">settings</Link> and export{" "}
					<code className="font-mono">PLANTIFILES_TOKEN</code> and{" "}
					<code className="font-mono">PLANTIFILES_BASE_URL</code> instead of signing in.
				</p>
			</TabsContent>
		</Tabs>
	);
}
