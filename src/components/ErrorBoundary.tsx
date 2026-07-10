import React, { ErrorInfo, ReactNode } from "react";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends React.Component<Props, State> {
  props: Props;
  state: State;

  constructor(props: Props) {
    super(props);
    this.props = props;
    this.state = {
      hasError: false,
      error: null
    };
  }

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Uncaught rendering error caught by boundary:", error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }
      return (
        <div className="p-6 bg-slate-900 border border-rose-500/30 rounded-2xl text-center text-slate-200 my-4 max-w-lg mx-auto shadow-xl">
          <h2 className="text-sm font-bold text-rose-400 flex items-center justify-center gap-2 mb-2">
            ⚠️ Rendering Error Caught
          </h2>
          <p className="text-xs text-slate-400 leading-normal mb-4">
            An unexpected error occurred while rendering this interface. This might be due to a dynamic API or third-party component limitation.
          </p>
          <pre className="bg-slate-950 border border-slate-800 p-3 rounded-lg text-[10px] text-rose-300 font-mono text-left overflow-x-auto max-h-48 whitespace-pre-wrap">
            {this.state.error?.message || String(this.state.error)}
          </pre>
          <button
            onClick={() => window.location.reload()}
            className="mt-4 bg-blue-600 hover:bg-blue-500 text-white rounded-lg px-3.5 py-1.5 text-xs font-bold transition cursor-pointer"
          >
            Reload Application
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

