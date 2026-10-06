import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";
import { updatePlanSharing } from "../../../../../lib/data/plan-sharing.server";

export const updatePlanSharingForPage = createServerFn({ method: "POST" })
	.validator(z.object({ planId: z.string().min(1), visibility: z.enum(["workspace", "public"]) }))
	.handler(async ({ data }) => updatePlanSharing(getRequest(), data.planId, data.visibility));
