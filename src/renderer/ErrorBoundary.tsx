import React from "react";

interface ErrorBoundaryProps {
	children: React.ReactNode;
	fallback?: React.ReactNode;
}

interface ErrorBoundaryState {
	hasError: boolean;
	error: Error | null;
}

/**
 * React error boundary that catches render errors in user components
 * and displays a formatted error message instead of crashing.
 */
export class ErrorBoundary extends React.Component<
	ErrorBoundaryProps,
	ErrorBoundaryState
> {
	constructor(props: ErrorBoundaryProps) {
		super(props);
		this.state = { hasError: false, error: null };
	}

	static getDerivedStateFromError(error: Error): ErrorBoundaryState {
		return { hasError: true, error };
	}

	componentDidCatch(error: Error, info: React.ErrorInfo) {
		console.error("[ReactRenderer] Component render error:", error, info);
	}

	render() {
		if (this.state.hasError) {
			if (this.props.fallback) return this.props.fallback;

			return (
				<div className="react-renderer-error">
					<div className="react-renderer-error-title">
						Component Error
					</div>
					<pre className="react-renderer-error-message">
						{this.state.error?.message || "Unknown error"}
					</pre>
					<button
						className="react-renderer-error-retry"
						onClick={() =>
							this.setState({ hasError: false, error: null })
						}
					>
						Retry
					</button>
				</div>
			);
		}

		return this.props.children;
	}
}
