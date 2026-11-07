import { Component, type ReactNode } from 'react';

export class FlywayErrorBoundary extends Component<{children:ReactNode},{error:string}> {
  state={error:''};
  static getDerivedStateFromError(error:Error) { return {error:error.message}; }
  render() {
    if (!this.state.error) return this.props.children;
    return <main className="application-recovery" role="alert"><h1>The workspace could not open</h1><p>Your saved data has not been deleted. Reload to retry. If the problem continues, keep the original browser profile so the saved records can be recovered.</p><details><summary>Diagnostic detail</summary><pre>{this.state.error}</pre></details><button type="button" className="button primary" onClick={()=>window.location.reload()}>Reload workspace</button></main>;
  }
}
