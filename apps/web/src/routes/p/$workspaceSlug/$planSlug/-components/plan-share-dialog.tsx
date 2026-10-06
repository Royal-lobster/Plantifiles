import { Button } from "@plantifiles/ui/components/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@plantifiles/ui/components/dialog";
import { Input } from "@plantifiles/ui/components/input";
import { Label } from "@plantifiles/ui/components/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@plantifiles/ui/components/select";
import { useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Check, Link, Share2 } from "lucide-react";
import { useId, useRef, useState } from "react";
import { useClipboard } from "#/lib/helpers/use-clipboard";
import type { PlanReaderData } from "../-data/plan-reader";
import { updatePlanSharingForPage } from "../-data/plan-sharing";

export function PlanShareDialog({ data }: { data: PlanReaderData }) {
	const router = useRouter();
	const updateSharing = useServerFn(updatePlanSharingForPage);
	const clipboard = useClipboard();
	const [open, setOpen] = useState(false);
	const [url, setUrl] = useState("");
	const [visibility, setVisibility] = useState(data.plan.visibility);
	const [busy, setBusy] = useState(false);
	const [message, setMessage] = useState("");
	const inFlight = useRef(false);
	const accessId = useId();
	const linkId = useId();
	const isPublic = data.plan.visibility === "public";
	const canManage = Boolean(data.viewer?.canManageSharing);
	const hasChanges = visibility !== data.plan.visibility;

	function changeOpen(next: boolean) {
		if (inFlight.current) return;
		setOpen(next);
		if (next) {
			// Preserve historical version paths, while discarding transient query/hash state.
			const link = new URL(window.location.pathname, window.location.origin);
			setUrl(link.toString());
			setVisibility(data.plan.visibility);
			setMessage("");
		}
	}

	async function save() {
		if (inFlight.current || !canManage || !hasChanges || visibility === "private") return;
		inFlight.current = true;
		setBusy(true);
		setMessage("");
		try {
			await updateSharing({ data: { planId: data.plan.id, visibility } });
			try {
				await router.invalidate();
				setMessage(
					visibility === "public"
						? "Anyone with the link can now read this plan."
						: "Public access is off. Only workspace members can read this plan.",
				);
			} catch {
				setMessage("Sharing was saved. Reload the page to see the updated access setting.");
			}
		} catch (error) {
			setMessage(error instanceof Error ? error.message : "Could not update sharing. Please try again.");
		} finally {
			inFlight.current = false;
			setBusy(false);
		}
	}

	return (
		<Dialog open={open} onOpenChange={changeOpen}>
			<DialogTrigger asChild>
				<Button variant="outline" size="sm" aria-label="Share" className="size-8 px-0 sm:w-auto sm:px-3">
					<Share2 />
					<span className="hidden sm:inline">Share</span>
				</Button>
			</DialogTrigger>
			<DialogContent className="sm:max-w-md">
				<DialogHeader>
					<DialogTitle>Share plan</DialogTitle>
					<DialogDescription>Share a link to {data.plan.title}.</DialogDescription>
				</DialogHeader>
				<div className="flex flex-col gap-4">
					<div className="flex flex-col gap-2">
						<Label htmlFor={accessId}>Who can read this plan</Label>
						{canManage ? (
							<Select
								value={visibility}
								disabled={busy}
								onValueChange={(value) => {
									if (value === "workspace" || value === "public") {
										setVisibility(value);
										setMessage("");
									}
								}}
							>
								<SelectTrigger id={accessId} className="w-full">
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									{visibility === "private" && <SelectItem value="private">Restricted</SelectItem>}
									<SelectItem value="workspace">Workspace members</SelectItem>
									<SelectItem value="public">Anyone with the link</SelectItem>
								</SelectContent>
							</Select>
						) : (
							<p id={accessId} className="text-sm">
								{isPublic ? "Anyone with the link" : "Workspace members"}
							</p>
						)}
						<p className="text-muted-foreground text-sm">
							{visibility === "public"
								? "Anyone can read the plan, comments, and all versions without signing in. Only workspace members can comment or review."
								: "Readers must sign in and belong to this workspace. Public access is disabled."}
						</p>
						{!canManage && !isPublic && (
							<p className="text-muted-foreground text-sm">
								Ask the plan author or an organization owner to enable public access.
							</p>
						)}
					</div>
					{hasChanges && canManage && (
						<Button disabled={busy} onClick={() => void save()}>
							{busy ? "Saving…" : "Save sharing"}
						</Button>
					)}
					{message && <output className="text-muted-foreground text-sm">{message}</output>}
					<div className="flex flex-col gap-2">
						<Label htmlFor={linkId}>Plan link</Label>
						<Input id={linkId} value={url} readOnly onFocus={(event) => event.target.select()} />
						<Button variant="outline" disabled={busy || hasChanges} onClick={() => void clipboard.copy(url)}>
							{clipboard.status === "copied" ? <Check /> : <Link />}
							{clipboard.status === "copied" ? "Link copied" : "Copy link"}
						</Button>
						{clipboard.status === "copied" && <output className="sr-only">Link copied to clipboard.</output>}
						{clipboard.status === "error" && (
							<p role="alert" className="text-destructive text-sm">
								Could not copy the link. Select the link above and copy it manually.
							</p>
						)}
					</div>
				</div>
			</DialogContent>
		</Dialog>
	);
}
