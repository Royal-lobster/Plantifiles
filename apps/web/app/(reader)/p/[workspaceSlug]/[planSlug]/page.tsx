import { notFound } from "next/navigation";
import { getReaderPlan } from "@/lib/reader-data";
import { PlanReader } from "./_components/plan-reader";

export default async function PlanPage({ params }: { params: Promise<{ workspaceSlug: string; planSlug: string }> }) {
  const { workspaceSlug, planSlug } = await params;
  const plan = await getReaderPlan(workspaceSlug, planSlug);
  if (!plan) notFound();
  return <PlanReader plan={plan} />;
}
