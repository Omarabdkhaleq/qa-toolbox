import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  toolName: string;
  onReset?: () => void;
  children: ReactNode;
}
interface State {
  error: Error | null;
}

export class ToolErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: unknown): State {
    return { error: error instanceof Error ? error : new Error(String(error)) };
  }

  componentDidCatch(error: unknown, info: ErrorInfo): void {
    // Console only — errors are never sent anywhere.
    console.error(`[qa-toolbox] ${this.props.toolName} crashed`, error, info.componentStack);
  }

  private reset = () => {
    this.props.onReset?.();
    this.setState({ error: null });
  };

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    return (
      <div className="crash" role="alert">
        <h2>This tool crashed</h2>
        <p>The rest of qa-toolbox still works. Input in this tool was lost.</p>
        <button type="button" onClick={this.reset}>
          Reload tool
        </button>{' '}
        <button type="button" onClick={() => location.reload()}>
          Reload page
        </button>
        <details>
          <summary>Error details</summary>
          <pre>{error.stack ?? error.message}</pre>
        </details>
      </div>
    );
  }
}
