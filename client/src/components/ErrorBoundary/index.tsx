import { Component, type ErrorInfo, type ReactNode } from "react";
import { TEXT } from "@/constant";
import styles from "./index.module.less";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
}

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("ErrorBoundary", error, info.componentStack);
  }

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    return (
      <div className={styles.crash} role="alert">
        <h1>{TEXT.app.crashTitle}</h1>
        <p>{TEXT.app.crashHint}</p>
        <button type="button" onClick={() => window.location.reload()}>
          {TEXT.app.reload}
        </button>
      </div>
    );
  }
}
