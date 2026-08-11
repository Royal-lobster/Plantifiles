export function PlanReader({
  plan,
}: {
  plan: {
    title: string;
    status: string;
    workspace: { name: string };
    version: { number: number; source: string; lintScore: number; lintOverridden: boolean };
  };
}) {
  return (
    <main>
      <nav aria-label="Breadcrumb">{plan.workspace.name} / {plan.title}</nav>
      <header>
        <h1>{plan.title}</h1>
        <p>{plan.status} · v{plan.version.number} · lint {plan.version.lintScore}</p>
        {plan.version.lintOverridden ? <strong>Lint overridden</strong> : null}
      </header>
      <pre>{plan.version.source}</pre>
    </main>
  );
}
