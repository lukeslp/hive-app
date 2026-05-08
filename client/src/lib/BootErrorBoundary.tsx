import { Component, type ErrorInfo, type ReactNode } from "react";

/**
 * Render-time error boundary. React 19 swallows component errors during
 * commit and unmounts the tree silently — neither window.onerror nor the
 * React Query error handlers see them. This boundary captures the error
 * + componentStack and renders them visibly so a blank screen isn't the
 * only signal that something failed.
 *
 * Mount this OUTSIDE QueryClientProvider so query failures still go
 * through the existing handlers, but render failures land here.
 */

interface State {
    error: Error | null;
    componentStack: string | null;
}

interface Props {
    children: ReactNode;
}

export class BootErrorBoundary extends Component<Props, State> {
    state: State = { error: null, componentStack: null };

    static getDerivedStateFromError(error: Error): Partial<State> {
        return { error };
    }

    componentDidCatch(error: Error, info: ErrorInfo) {
        this.setState({ componentStack: info.componentStack ?? null });
        // Forward to the Capacitor native log too, structured.
        try {
            console.error(
                "[Render Error]",
                JSON.stringify({
                    name: error.name,
                    message: error.message,
                    stack: error.stack?.split("\n").slice(0, 12).join("\n") ?? null,
                    componentStack: (info.componentStack ?? "").split("\n").slice(0, 12).join("\n"),
                })
            );
        } catch {
            // last-resort, don't let a logging failure clobber the visible UI
        }
    }

    render() {
        if (!this.state.error) return this.props.children;

        const { error, componentStack } = this.state;
        return (
            <div
                style={{
                    position: "fixed",
                    inset: 0,
                    zIndex: 99999,
                    background: "#0a0a0a",
                    color: "#fafafa",
                    font: "13px/1.5 ui-monospace, Menlo, monospace",
                    padding: 20,
                    overflow: "auto",
                    whiteSpace: "pre-wrap",
                }}
            >
                <div style={{ fontWeight: 600, marginBottom: 12, color: "#fbbf24" }}>
                    React render error
                </div>
                <div style={{ color: "#fca5a5", marginBottom: 16 }}>
                    {error.name}: {error.message || "(no message)"}
                </div>
                {error.stack ? (
                    <details open style={{ marginBottom: 12 }}>
                        <summary style={{ cursor: "pointer", color: "#a3a3a3" }}>stack</summary>
                        <pre style={{ marginTop: 8 }}>
                            {error.stack.split("\n").slice(0, 20).join("\n")}
                        </pre>
                    </details>
                ) : null}
                {componentStack ? (
                    <details open>
                        <summary style={{ cursor: "pointer", color: "#a3a3a3" }}>component stack</summary>
                        <pre style={{ marginTop: 8 }}>
                            {componentStack.split("\n").slice(0, 12).join("\n")}
                        </pre>
                    </details>
                ) : null}
            </div>
        );
    }
}
