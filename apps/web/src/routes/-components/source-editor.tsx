import type { LintFinding } from "@plantifiles/core";
import { useEffect, useRef } from "react";

type EditorInstance = import("codemirror").EditorView;
type Diagnostic = import("@codemirror/lint").Diagnostic;
type SetDiagnostics = (
	state: EditorInstance["state"],
	diagnostics: readonly Diagnostic[],
) => Parameters<EditorInstance["dispatch"]>[0];

function findingsToDiagnostics(view: EditorInstance, findings: LintFinding[]): Diagnostic[] {
	return findings.map((finding) => {
		const lineNumber = Math.max(1, Math.min(finding.line, view.state.doc.lines));
		const line = view.state.doc.line(lineNumber);
		return {
			from: line.from,
			to: line.to,
			severity: finding.severity,
			message: `${finding.rule}: ${finding.message}`,
		};
	});
}

function SourceEditor({
	value,
	findings,
	onChange,
}: {
	value: string;
	findings: LintFinding[];
	onChange: (value: string) => void;
}) {
	const hostRef = useRef<HTMLDivElement>(null);
	const viewRef = useRef<EditorInstance | null>(null);
	const initialValueRef = useRef(value);
	const findingsRef = useRef(findings);
	const onChangeRef = useRef(onChange);
	const setDiagnosticsRef = useRef<SetDiagnostics | null>(null);
	findingsRef.current = findings;
	onChangeRef.current = onChange;

	useEffect(() => {
		let active = true;
		void (async () => {
			const [{ basicSetup, EditorView }, { markdown }, { lintGutter, setDiagnostics }] = await Promise.all([
				import("codemirror"),
				import("@codemirror/lang-markdown"),
				import("@codemirror/lint"),
			]);
			if (!active || !hostRef.current) return;
			const view = new EditorView({
				doc: initialValueRef.current,
				parent: hostRef.current,
				extensions: [
					basicSetup,
					markdown(),
					lintGutter(),
					EditorView.lineWrapping,
					EditorView.contentAttributes.of({ "aria-label": "Plan MDX source" }),
					EditorView.theme({
						"&": { height: "100%", backgroundColor: "var(--card)", color: "var(--foreground)" },
						".cm-scroller": { fontFamily: "var(--font-mono)", fontSize: "13px", lineHeight: "1.6" },
						".cm-gutters": { backgroundColor: "var(--muted)", color: "var(--muted-foreground)", border: "0" },
						".cm-activeLine, .cm-activeLineGutter": {
							backgroundColor: "color-mix(in oklab, var(--accent) 10%, transparent)",
						},
						".cm-content": { padding: "12px 0" },
					}),
					EditorView.updateListener.of((update) => {
						if (update.docChanged) onChangeRef.current(update.state.doc.toString());
					}),
				],
			});
			viewRef.current = view;
			setDiagnosticsRef.current = setDiagnostics as SetDiagnostics;
			view.dispatch(setDiagnostics(view.state, findingsToDiagnostics(view, findingsRef.current)));
		})();
		return () => {
			active = false;
			viewRef.current?.destroy();
			viewRef.current = null;
			setDiagnosticsRef.current = null;
		};
	}, []);

	useEffect(() => {
		const view = viewRef.current;
		if (!view || view.state.doc.toString() === value) return;
		view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: value } });
	}, [value]);

	useEffect(() => {
		const view = viewRef.current;
		const setDiagnostics = setDiagnosticsRef.current;
		if (!view || !setDiagnostics) return;
		view.dispatch(setDiagnostics(view.state, findingsToDiagnostics(view, findings)));
	}, [findings]);

	return <div ref={hostRef} className="h-full min-h-[32rem] overflow-hidden rounded-lg border" />;
}

export { SourceEditor };
