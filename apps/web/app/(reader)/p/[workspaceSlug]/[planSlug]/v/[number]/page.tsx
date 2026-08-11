import { notFound } from "next/navigation";
import { getReaderPlan } from "@/lib/reader-data";
import { PlanReader } from "../../_components/plan-reader";

export default async function VersionPage({
  params,
}: {
  params: Promise<{ workspaceSlug: string; planSlug: string; number: string }>;
}) {
  const { workspaceSlug, planSlug, number } = await params;
  const versionNumber = Number(number);
  if (!Number.isInteger(versionNumber) || versionNumber < 1) notFound();
  const plan = await getReaderPlan(workspaceSlug, planSlug, versionNumber);
  if (!plan) notFound();
  return <PlanReader plan={plan} />;
}
