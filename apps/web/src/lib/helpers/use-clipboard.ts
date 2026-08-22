import { useCallback, useEffect, useRef, useState } from "react";

type ClipboardStatus = "idle" | "copied" | "error";

function useClipboard() {
	const [status, setStatus] = useState<ClipboardStatus>("idle");
	const attemptRef = useRef(0);
	const resetTimerRef = useRef<number | undefined>(undefined);

	useEffect(
		() => () => {
			attemptRef.current += 1;
			window.clearTimeout(resetTimerRef.current);
		},
		[],
	);

	const copy = useCallback(async (text: string) => {
		const attempt = ++attemptRef.current;
		window.clearTimeout(resetTimerRef.current);
		setStatus("idle");
		try {
			await navigator.clipboard.writeText(text);
			if (attempt !== attemptRef.current) return false;
			setStatus("copied");
			resetTimerRef.current = window.setTimeout(() => setStatus("idle"), 1500);
			return true;
		} catch {
			if (attempt !== attemptRef.current) return false;
			setStatus("error");
			resetTimerRef.current = window.setTimeout(() => setStatus("idle"), 3000);
			return false;
		}
	}, []);

	return { copy, status } as const;
}

export { useClipboard };
