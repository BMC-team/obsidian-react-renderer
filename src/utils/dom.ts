/**
 * Wait for a DOM element to be attached to the document.
 * Uses a one-shot MutationObserver, cancels after timeout.
 */
export function waitForDomAttachment(
	el: HTMLElement,
	callback: () => void,
	timeout = 5000
): () => void {
	if (el.isConnected) {
		callback();
		return () => {};
	}

	let cancelled = false;

	const observer = new MutationObserver(() => {
		if (el.isConnected && !cancelled) {
			observer.disconnect();
			cancelled = true;
			callback();
		}
	});

	observer.observe(document.body, { childList: true, subtree: true });

	const timer = window.setTimeout(() => {
		if (!cancelled) {
			observer.disconnect();
			cancelled = true;
		}
	}, timeout);

	return () => {
		if (!cancelled) {
			observer.disconnect();
			cancelled = true;
			window.clearTimeout(timer);
		}
	};
}
