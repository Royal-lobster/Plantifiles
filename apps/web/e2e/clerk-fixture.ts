import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { ClerkClient } from "@clerk/backend";
import { createClerkClient } from "@clerk/backend";
import { clerkSetup } from "@clerk/testing/playwright";
import { getVars } from "#vars";

/**
 * The reviewer the suite signs in as, and the Organization that becomes its
 * workspace. `+clerk_test` keeps the address inside Clerk's development
 * fixtures, so no mail is ever delivered.
 */
const E2E_EMAIL = "plantifiles.e2e+clerk_test@example.com";
const E2E_ORGANIZATION_NAME = "Plantifiles E2E";

/** Channel between global setup and the spec, which run in separate modules. */
const WORKSPACE_SLUG_ENV = "PLANTIFILES_E2E_WORKSPACE_SLUG";

/**
 * Idempotently provision the reviewer and the Organization, then hand Clerk's
 * testing helpers the credentials they read from the environment. Playwright
 * calls this as `globalSetup`.
 *
 * The Worker reads secrets from `.dev.vars`; the test process is a plain Node
 * process, so it decrypts the same bundle with the same master key rather than
 * introducing a second place where Clerk credentials are configured.
 */
export default async function setupClerkFixture(): Promise<void> {
	/* The suite publishes plans, mints API tokens and approves versions, and the
	   fixture writes to a shared Clerk instance. Both are safe against a local
	   Worker and nothing else, so the target is asserted before either happens. */
	const target = new URL(process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000");
	if (target.hostname !== "localhost" && target.hostname !== "127.0.0.1") {
		throw new Error(`Refusing to run the destructive plan loop against ${target.origin}.`);
	}

	let varsKey = process.env.VARS_KEY;
	if (!varsKey) {
		try {
			const devVars = await readFile(resolve(process.cwd(), ".dev.vars"), "utf8");
			varsKey = devVars.match(/^VARS_KEY=(.+)$/m)?.[1]?.trim();
		} catch {
			varsKey = undefined;
		}
	}
	if (!varsKey) {
		throw new Error(
			"No vars master key. Set VARS_KEY, or create apps/web/.dev.vars as the local setup instructions describe.",
		);
	}

	const vars = await getVars({ VARS_KEY: varsKey, VARS_ENV: "dev" }, "dev");
	const publishableKey = vars.CLERK_PUBLISHABLE_KEY;
	const secretKey = vars.CLERK_SECRET_KEY.unwrap();
	process.env.CLERK_PUBLISHABLE_KEY = publishableKey;
	process.env.CLERK_SECRET_KEY = secretKey;

	const clerk = createClerkClient({ publishableKey, secretKey });
	const userId = await ensureUser(clerk);
	process.env[WORKSPACE_SLUG_ENV] = await ensureOrganization(clerk, userId);
	await clerkSetup({ publishableKey, secretKey });
}

/**
 * Delete what setup created. The development Clerk instance also backs the
 * public hosted dev Worker, and a `+clerk_test` address accepts the universal
 * development verification code, so leaving the reviewer behind would leave a
 * standing Organization admin anyone reading this file could sign in as.
 */
export async function teardownClerkFixture(): Promise<void> {
	const publishableKey = process.env.CLERK_PUBLISHABLE_KEY;
	const secretKey = process.env.CLERK_SECRET_KEY;
	if (!publishableKey || !secretKey) return;
	const clerk = createClerkClient({ publishableKey, secretKey });

	const organizations = await clerk.organizations.getOrganizationList({ query: E2E_ORGANIZATION_NAME, limit: 20 });
	for (const organization of organizations.data.filter((entry) => entry.name === E2E_ORGANIZATION_NAME)) {
		await clerk.organizations.deleteOrganization(organization.id);
	}
	const users = await clerk.users.getUserList({ emailAddress: [E2E_EMAIL], limit: 10 });
	for (const user of users.data) {
		await clerk.users.deleteUser(user.id);
	}
}

/** Read the slug global setup discovered, from inside a spec module. */
export function e2eWorkspaceSlug(): string {
	const slug = process.env[WORKSPACE_SLUG_ENV];
	if (!slug) throw new Error(`${WORKSPACE_SLUG_ENV} is unset; the Playwright global setup did not run.`);
	return slug;
}

async function ensureUser(clerk: ClerkClient): Promise<string> {
	const existing = await clerk.users.getUserList({ emailAddress: [E2E_EMAIL], limit: 1 });
	const found = existing.data[0];
	if (found) return found.id;
	const created = await clerk.users.createUser({
		emailAddress: [E2E_EMAIL],
		firstName: "Plan",
		lastName: "Reviewer",
		skipPasswordRequirement: true,
	});
	return created.id;
}

/**
 * Returns the Organization slug, which Clerk owns: this instance has
 * Organization slugs disabled, so it appends a numeric suffix to the name and
 * rejects any slug the caller asks for. The workspace URL therefore has to be
 * discovered rather than assumed.
 */
async function ensureOrganization(clerk: ClerkClient, userId: string): Promise<string> {
	const organizations = await clerk.organizations.getOrganizationList({ query: E2E_ORGANIZATION_NAME, limit: 20 });
	const existing = organizations.data.find((organization) => organization.name === E2E_ORGANIZATION_NAME);
	if (!existing) {
		const created = await clerk.organizations.createOrganization({
			name: E2E_ORGANIZATION_NAME,
			createdBy: userId,
		});
		if (!created.slug) throw new Error("Clerk created the E2E Organization without a slug.");
		return created.slug;
	}
	if (!existing.slug) throw new Error(`Clerk Organization ${existing.id} has no slug.`);
	const members = await clerk.organizations.getOrganizationMembershipList({
		organizationId: existing.id,
		limit: 100,
	});
	/* The creator is already an admin; a reused Organization may predate this user.
	   Owner rights are load-bearing: the suite submits for review and approves. */
	if (!members.data.some((member) => member.publicUserData?.userId === userId)) {
		await clerk.organizations.createOrganizationMembership({
			organizationId: existing.id,
			userId,
			role: "org:admin",
		});
	}
	return existing.slug;
}

export { E2E_EMAIL };
