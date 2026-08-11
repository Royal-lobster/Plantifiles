import { type LintReport, lint } from "@plantifiles/core";
import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";
import { compilePlan } from "./plan-render.server";
import { createPlanVersion } from "./plans.server";

const sourceSchema = z.object({ source: z.string().max(1_000_000) });

export const previewPlanEdit = createServerFn({ method: "POST" })
	.validator(sourceSchema)
	.handler(async ({ data }) => {
		const report = lint(data.source);
		return {
			report,
			renderTree: report.errors === 0 ? await compilePlan(data.source) : null,
		};
	});

export type SavePlanEditResult =
	| { ok: true; version: number; changeSummary: string | null }
	| { ok: false; type: "conflict"; message: string; currentVersion: number }
	| { ok: false; type: "lint"; message: string; report: LintReport };

export const savePlanEdit = createServerFn({ method: "POST" })
	.validator(sourceSchema.extend({ planId: z.string().min(1), baseVersion: z.number().int().positive() }))
	.handler(async ({ data }): Promise<SavePlanEditResult> => {
		try {
			const result = await createPlanVersion(getRequest(), data.planId, {
				source: data.source,
				baseVersion: data.baseVersion,
			});
			return { ok: true, version: result.version, changeSummary: result.changeSummary };
		} catch (caught) {
			if (!(caught instanceof Response)) throw caught;
			if (caught.status === 409) {
				const payload = (await caught.json()) as { message: string; currentVersion: number };
				return { ok: false, type: "conflict", ...payload };
			}
			if (caught.status === 422) {
				const payload = (await caught.json()) as { report: LintReport };
				return { ok: false, type: "lint", message: "Fix lint errors before saving.", report: payload.report };
			}
			throw caught;
		}
	});
