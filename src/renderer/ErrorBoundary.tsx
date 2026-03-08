import React from "react";

interface ErrorBoundaryProps {
	children: React.ReactNode;
	fallback?: React.ReactNode;
	onRetry?: () => void;
}

interface ErrorBoundaryState {
	hasError: boolean;
	error: Error | null;
	retryCount: number;
}

/**
 * React error boundary that catches render errors in user components
 * and displays a formatted error message instead of crashing.
 *
 * Retry button increments retryCount which forces React to re-create
 * the child tree from scratch (via key change in ComponentWrapper).
 */
export class ErrorBoundary extends React.Component<
	ErrorBoundaryProps,
	ErrorBoundaryState
> {
	constructor(props: ErrorBoundaryProps) {
		super(props);
		this.state = { hasError: false, error: null, retryCount: 0 };
	}

	static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
		return { hasError: true, error };
	}

	componentDidCatch(error: Error, info: React.ErrorInfo) {
		console.error("[ReactRenderer] Component render error:", error, info);
	}

	handleRetry = () => {
		this.setState(prev => ({
			hasError: false,
			error: null,
			retryCount: prev.retryCount + 1,
		}));
		if (this.props.onRetry) this.props.onRetry();
	};

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
						onClick={this.handleRetry}
					>
						Retry
					</button>
				</div>
			);
		}

		// Key changes on retry, forcing React to re-create children
		return (
			<React.Fragment key={this.state.retryCount}>
				{this.props.children}
			</React.Fragment>
		);
	}
}
