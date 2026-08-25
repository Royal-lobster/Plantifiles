import type { OrganizationJSON, OrganizationMembershipJSON, UserJSON, WebhookEvent } from "@clerk/backend";
import type { Database } from "@plantifiles/db";
import { membership, user, workspace } from "@plantifiles/db/schema";
import { and, eq, isNull, sql } from "drizzle-orm";
import { getDb } from "#/lib/integrations/runtime.server";

export type ClerkUserProjection = {
	id: string;
	firstName: string | null;
	lastName: string | null;
	username: string | null;
	imageUrl: string;
	primaryEmailAddressId: string | null;
	emailAddresses: readonly {
		id: string;
		emailAddress: string;
		verification?: { status: string } | null;
	}[];
};

export type LocalUser = {
	id: string;
	name: string;
	email: string;
	image: string | null;
};

type ProjectedWorkspace = {
	id: string;
	slug: string;
	name: string;
};

export type ProjectedMembership = {
	user: LocalUser;
	workspace: ProjectedWorkspace;
	role: "owner" | "member";
};

export type ClerkOrganizationMembershipProjection = {
	clerkUserId: string;
	clerkOrganizationId: string;
	organizationSlug: string;
	organizationRole: string;
	organizationName?: string;
};

type ClerkOrganizationProjection = {
	clerkOrganizationId: string;
	slug: string;
	name?: string;
};

function normalizeEmail(email: string): string {
	return email.trim().toLowerCase();
}

function normalizeSlug(slug: string): string {
	const normalized = slug.trim().toLowerCase();
	if (!normalized) throw new Error("A Clerk Organization cannot be projected without a slug.");
	return normalized;
}

function projectedUserValues(input: ClerkUserProjection) {
	const primaryEmail = input.emailAddresses.find((address) => address.id === input.primaryEmailAddressId);
	if (!primaryEmail) {
		throw new Error(`Clerk user ${input.id} has no primary email address and cannot be projected.`);
	}
	const email = normalizeEmail(primaryEmail.emailAddress);
	if (!email) throw new Error(`Clerk user ${input.id} has an empty primary email address.`);
	const name =
		[input.firstName, input.lastName]
			.filter((part): part is string => Boolean(part?.trim()))
			.map((part) => part.trim())
			.join(" ") ||
		input.username?.trim() ||
		email.split("@")[0] ||
		"User";
	const values = {
		clerkUserId: input.id,
		name,
		email,
		image: input.imageUrl || null,
		updatedAt: new Date(),
	};
	if (primaryEmail.verification === undefined) return values;
	return {
		...values,
		emailVerified: primaryEmail.verification?.status === "verified",
	};
}

function toLocalUser(row: typeof user.$inferSelect): LocalUser {
	return { id: row.id, name: row.name, email: row.email, image: row.image };
}

async function findUserByClerkId(db: Database, clerkUserId: string) {
	const rows = await db.select().from(user).where(eq(user.clerkUserId, clerkUserId)).limit(1);
	return rows[0] ?? null;
}

/**
 * Link a Clerk user to the existing local author row with the same normalized
 * email before creating a new row. Local IDs never change, so plan history,
 * OAuth sessions, and user-scoped API keys continue to identify one author.
 */
export async function resolveClerkUser(input: ClerkUserProjection, db: Database = getDb()): Promise<LocalUser> {
	const values = projectedUserValues(input);
	const linked = await findUserByClerkId(db, input.id);
	const emailMatches = await db.select().from(user).where(sql`lower(trim(${user.email})) = ${values.email}`).limit(2);
	if (emailMatches.length > 1) {
		throw new Error(`Cannot claim Clerk user ${input.id}: multiple local users match ${values.email}.`);
	}
	const emailMatch = emailMatches[0];
	if (linked && emailMatch && linked.id !== emailMatch.id) {
		throw new Error(`Cannot update Clerk user ${input.id}: ${values.email} belongs to a different local user.`);
	}
	if (linked) {
		const rows = await db.update(user).set(values).where(eq(user.id, linked.id)).returning();
		return toLocalUser(rows[0] ?? { ...linked, ...values });
	}
	if (emailMatch) {
		if (emailMatch.clerkUserId && emailMatch.clerkUserId !== input.id) {
			throw new Error(
				`Cannot claim ${values.email} for Clerk user ${input.id}: it is already linked to ${emailMatch.clerkUserId}.`,
			);
		}
		const claimed = await db
			.update(user)
			.set(values)
			.where(and(eq(user.id, emailMatch.id), isNull(user.clerkUserId)))
			.returning();
		if (claimed[0]) return toLocalUser(claimed[0]);
		return resolveClerkUser(input, db);
	}

	try {
		const rows = await db
			.insert(user)
			.values({ id: crypto.randomUUID(), createdAt: new Date(), ...values })
			.returning();
		const created = rows[0];
		if (!created) throw new Error(`Failed to create a local projection for Clerk user ${input.id}.`);
		return toLocalUser(created);
	} catch (error) {
		const raced = await findUserByClerkId(db, input.id);
		if (!raced) throw error;
		return resolveClerkUser(input, db);
	}
}

function toProjectedWorkspace(row: typeof workspace.$inferSelect): ProjectedWorkspace {
	return { id: row.id, slug: row.slug, name: row.name };
}

async function findWorkspaceByClerkId(db: Database, clerkOrganizationId: string) {
	const rows = await db.select().from(workspace).where(eq(workspace.clerkOrganizationId, clerkOrganizationId)).limit(1);
	return rows[0] ?? null;
}

/**
 * Project a Clerk Organization onto a workspace row, keyed on the immutable
 * Clerk Organization ID. The slug is not immutable: organization slugs are
 * enabled on both instances, so a member may rename one. The linked path
 * therefore overwrites `slug` from Clerk on every authenticated request, and a
 * renamed Organization moves its `/w/:slug` URL with nothing redirecting the
 * old one.
 *
 * The slug lookup exists only to claim a workspace row that predates its Clerk
 * Organization (`clerk_organization_id IS NULL`). A slug already held by a
 * different Organization is refused rather than stolen.
 */
async function resolveClerkOrganization(
	input: ClerkOrganizationProjection,
	db: Database = getDb(),
): Promise<ProjectedWorkspace> {
	const slug = normalizeSlug(input.slug);
	const linked = await findWorkspaceByClerkId(db, input.clerkOrganizationId);
	const slugMatches = await db.select().from(workspace).where(sql`lower(trim(${workspace.slug})) = ${slug}`).limit(2);
	if (slugMatches.length > 1) {
		throw new Error(
			`Cannot claim Clerk Organization ${input.clerkOrganizationId}: multiple workspaces match slug ${slug}.`,
		);
	}
	const slugMatch = slugMatches[0];
	if (linked && slugMatch && linked.id !== slugMatch.id) {
		throw new Error(
			`Cannot update Clerk Organization ${input.clerkOrganizationId}: slug ${slug} belongs to another workspace.`,
		);
	}
	if (linked) {
		const rows = await db
			.update(workspace)
			.set({ slug, name: input.name?.trim() || linked.name })
			.where(eq(workspace.id, linked.id))
			.returning();
		return toProjectedWorkspace(rows[0] ?? { ...linked, slug, name: input.name?.trim() || linked.name });
	}
	if (slugMatch) {
		if (slugMatch.clerkOrganizationId && slugMatch.clerkOrganizationId !== input.clerkOrganizationId) {
			throw new Error(`Cannot claim workspace ${slug}: it is already linked to ${slugMatch.clerkOrganizationId}.`);
		}
		const claimed = await db
			.update(workspace)
			.set({
				clerkOrganizationId: input.clerkOrganizationId,
				name: input.name?.trim() || slugMatch.name,
				slug,
			})
			.where(and(eq(workspace.id, slugMatch.id), isNull(workspace.clerkOrganizationId)))
			.returning();
		if (claimed[0]) return toProjectedWorkspace(claimed[0]);
		return resolveClerkOrganization(input, db);
	}

	try {
		const rows = await db
			.insert(workspace)
			.values({
				id: crypto.randomUUID(),
				clerkOrganizationId: input.clerkOrganizationId,
				slug,
				name: input.name?.trim() || slug,
			})
			.returning();
		const created = rows[0];
		if (!created) {
			throw new Error(`Failed to create a local projection for Clerk Organization ${input.clerkOrganizationId}.`);
		}
		return toProjectedWorkspace(created);
	} catch (error) {
		const raced = await findWorkspaceByClerkId(db, input.clerkOrganizationId);
		if (!raced) throw error;
		return resolveClerkOrganization(input, db);
	}
}

function mapClerkOrganizationRole(role: string): "owner" | "member" {
	if (role === "org:admin") return "owner";
	if (role === "org:member") return "member";
	throw new Error(`Unsupported Clerk Organization role: ${role}.`);
}

async function upsertMembership(
	db: Database,
	localUser: LocalUser,
	localWorkspace: ProjectedWorkspace,
	role: "owner" | "member",
): Promise<ProjectedMembership> {
	await db
		.insert(membership)
		.values({
			id: crypto.randomUUID(),
			userId: localUser.id,
			workspaceId: localWorkspace.id,
			role,
		})
		.onConflictDoUpdate({
			target: [membership.userId, membership.workspaceId],
			set: { role },
		});
	return { user: localUser, workspace: localWorkspace, role };
}

/**
 * Strongly consistent request-path projection for an active Clerk session.
 * Authorization may proceed only after this helper has linked the Organization
 * and upserted the local membership used by the rest of the application.
 */
export async function resolveClerkOrganizationMembership(
	input: ClerkOrganizationMembershipProjection,
	db: Database = getDb(),
): Promise<ProjectedMembership> {
	const linkedUser = await findUserByClerkId(db, input.clerkUserId);
	if (!linkedUser) {
		throw new Error(`Clerk user ${input.clerkUserId} must be projected before Organization access.`);
	}
	const localWorkspace = await resolveClerkOrganization(
		{
			clerkOrganizationId: input.clerkOrganizationId,
			slug: input.organizationSlug,
			...(input.organizationName === undefined ? {} : { name: input.organizationName }),
		},
		db,
	);
	return upsertMembership(
		db,
		toLocalUser(linkedUser),
		localWorkspace,
		mapClerkOrganizationRole(input.organizationRole),
	);
}

function fromWebhookUser(data: UserJSON): ClerkUserProjection {
	return {
		id: data.id,
		firstName: data.first_name,
		lastName: data.last_name,
		username: data.username,
		imageUrl: data.image_url,
		primaryEmailAddressId: data.primary_email_address_id,
		emailAddresses: data.email_addresses.map((address) => ({
			id: address.id,
			emailAddress: address.email_address,
			verification: address.verification && { status: address.verification.status },
		})),
	};
}

function fromWebhookOrganization(data: OrganizationJSON): ClerkOrganizationProjection {
	return { clerkOrganizationId: data.id, slug: data.slug, name: data.name };
}

async function projectMembershipEvent(db: Database, data: OrganizationMembershipJSON) {
	let localUser = await findUserByClerkId(db, data.public_user_data.user_id);
	const role = mapClerkOrganizationRole(data.role);
	if (!localUser) {
		if (!data.public_user_data.identifier.includes("@")) {
			throw new Error(
				`Clerk user ${data.public_user_data.user_id} must be projected from a user event before Organization membership.`,
			);
		}
		await resolveClerkUser(
			{
				id: data.public_user_data.user_id,
				firstName: data.public_user_data.first_name,
				lastName: data.public_user_data.last_name,
				username: null,
				imageUrl: data.public_user_data.image_url,
				primaryEmailAddressId: "membership-identifier",
				emailAddresses: [{ id: "membership-identifier", emailAddress: data.public_user_data.identifier }],
			},
			db,
		);
		localUser = await findUserByClerkId(db, data.public_user_data.user_id);
	}
	if (!localUser) throw new Error(`Could not project Clerk user ${data.public_user_data.user_id}.`);
	const localWorkspace = await resolveClerkOrganization(fromWebhookOrganization(data.organization), db);
	await upsertMembership(db, toLocalUser(localUser), localWorkspace, role);
}

async function deleteMembershipProjection(db: Database, data: OrganizationMembershipJSON) {
	const [localUser, localWorkspace] = await Promise.all([
		findUserByClerkId(db, data.public_user_data.user_id),
		findWorkspaceByClerkId(db, data.organization.id),
	]);
	if (!localUser || !localWorkspace) return;
	await db
		.delete(membership)
		.where(and(eq(membership.userId, localUser.id), eq(membership.workspaceId, localWorkspace.id)));
}

/** Apply the supported Clerk webhook events idempotently to the local projection. */
export async function projectClerkWebhookEvent(event: WebhookEvent, db: Database = getDb()): Promise<void> {
	switch (event.type) {
		case "user.created":
		case "user.updated":
			await resolveClerkUser(fromWebhookUser(event.data), db);
			return;
		case "user.deleted": {
			if (!event.data.id) throw new Error("A Clerk user.deleted event is missing its user ID.");
			const localUser = await findUserByClerkId(db, event.data.id);
			if (localUser) {
				await db.delete(membership).where(eq(membership.userId, localUser.id));
				await db.update(user).set({ clerkUserId: null, updatedAt: new Date() }).where(eq(user.id, localUser.id));
			}
			return;
		}
		case "organization.created":
		case "organization.updated":
			await resolveClerkOrganization(fromWebhookOrganization(event.data), db);
			return;
		case "organization.deleted": {
			if (!event.data.id) throw new Error("A Clerk organization.deleted event is missing its Organization ID.");
			const localWorkspace = await findWorkspaceByClerkId(db, event.data.id);
			if (localWorkspace) {
				await db.update(workspace).set({ clerkOrganizationId: null }).where(eq(workspace.id, localWorkspace.id));
				await db.delete(membership).where(eq(membership.workspaceId, localWorkspace.id));
			}
			return;
		}
		case "organizationMembership.created":
		case "organizationMembership.updated":
			await projectMembershipEvent(db, event.data);
			return;
		case "organizationMembership.deleted":
			await deleteMembershipProjection(db, event.data);
			return;
		default:
			return;
	}
}
