import { Button, MessageBar, MessageBarBody, MessageBarTitle } from '@fluentui/react-components';
import { Component, type ErrorInfo, type ReactNode } from 'react';

type Props = {
  children: ReactNode;
  onRetry: () => void;
};

type State = { failed: boolean; message: string };

export class RemoteBoundary extends Component<Props, State> {
  override state: State = { failed: false, message: '' };

  static getDerivedStateFromError(error: Error): State {
    return { failed: true, message: error.message };
  }

  override componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Automation remote failed', error, info.componentStack);
  }

  override render() {
    if (!this.state.failed) return this.props.children;
    return (
      <MessageBar intent="error">
        <MessageBarBody>
          <MessageBarTitle>Automation editor unavailable</MessageBarTitle>
          The federated editor failed to load. Sensors, Pause, and All off stay on this host page.
          <div style={{ marginTop: 8 }}>
            <Button
              onClick={() => {
                this.setState({ failed: false, message: '' });
                this.props.onRetry();
              }}
            >
              Retry editor
            </Button>
          </div>
        </MessageBarBody>
      </MessageBar>
    );
  }
}
