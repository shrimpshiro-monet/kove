import React from "react";

interface State { error: Error | null; }

export class ErrorBoundary extends React.Component<{ children: React.ReactNode }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error) { return { error }; }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("[ErrorBoundary]", error, info);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="m-6 p-4 border border-red-400/30 rounded bg-red-500/5 text-red-300">
          <div className="font-semibold mb-2">Editor crashed</div>
          <pre className="text-xs whitespace-pre-wrap">{this.state.error.message}</pre>
          <button
            onClick={() => this.setState({ error: null })}
            className="mt-3 px-3 py-1 bg-red-500/20 hover:bg-red-500/30 rounded text-xs"
          >
            Try again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
