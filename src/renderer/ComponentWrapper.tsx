import React from "react";
import { ErrorBoundary } from "./ErrorBoundary";

interface ComponentWrapperProps {
	component: React.ComponentType<any>;
	props?: Record<string, any>;
}

/**
 * Wraps user components with error boundary protection.
 */
export function ComponentWrapper({
	component: UserComponent,
	props = {},
}: ComponentWrapperProps) {
	return (
		<ErrorBoundary>
			<UserComponent {...props} />
		</ErrorBoundary>
	);
}
