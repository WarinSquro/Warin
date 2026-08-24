import { Component, type ReactNode } from "react";
import { useLocation } from "react-router-dom";

type InnerProps = { resetKey: string; children: ReactNode };
type InnerState = { error: Error | null };

class RouteErrorBoundaryInner extends Component<InnerProps, InnerState> {
  state: InnerState = { error: null };

  static getDerivedStateFromError(error: Error): InnerState {
    return { error };
  }

  componentDidUpdate(prevProps: InnerProps) {
    if (prevProps.resetKey !== this.props.resetKey && this.state.error) {
      this.setState({ error: null });
    }
  }

  render() {
    if (this.state.error) {
      return (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 bg-surface p-8 text-center">
          <div className="text-[15px] font-semibold text-foreground">This page could not be displayed</div>
          <p className="max-w-md text-[13px] text-muted-foreground">
            {this.state.error.message || "An unexpected error occurred."}
          </p>
          <button
            type="button"
            onClick={() => this.setState({ error: null })}
            className="cursor-pointer rounded-md bg-primary px-3 py-1.5 text-[13px] font-medium text-white"
          >
            Try again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

/** Keeps the app shell visible if a screen throws (avoids a full white page). */
export function RouteErrorBoundary({ children }: { children: ReactNode }) {
  const location = useLocation();
  return (
    <RouteErrorBoundaryInner resetKey={location.pathname + location.search}>
      {children}
    </RouteErrorBoundaryInner>
  );
}
