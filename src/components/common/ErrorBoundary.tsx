import React from 'react';
import { ErrorState } from './ErrorState';

interface Props {
  children: React.ReactNode;
}

interface State {
  hasError: boolean;
  message: string;
}

// 렌더 예외를 잡아 화면 백지 대신 폴백 + 재시도를 제공한다. (#58)
export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { hasError: false, message: '' };

  static getDerivedStateFromError(error: unknown): State {
    return {
      hasError: true,
      message: error instanceof Error ? error.message : '알 수 없는 오류',
    };
  }

  componentDidCatch(error: unknown) {
    console.error('Render error caught by ErrorBoundary', error);
  }

  handleReset = () => {
    this.setState({ hasError: false, message: '' });
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="app-error-boundary">
          <ErrorState message={`화면을 표시하는 중 오류가 발생했습니다: ${this.state.message}`} />
          <button type="button" className="primary" onClick={this.handleReset}>
            다시 시도
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
