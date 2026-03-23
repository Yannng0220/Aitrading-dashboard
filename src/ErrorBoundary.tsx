import React from 'react';

type ErrorBoundaryState = {
  hasError: boolean;
  message: string;
};

export default class ErrorBoundary extends React.Component<
  React.PropsWithChildren,
  ErrorBoundaryState
> {
  state: ErrorBoundaryState = {
    hasError: false,
    message: '',
  };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return {
      hasError: true,
      message: error?.message || 'Unknown application error',
    };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('Application render error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-[#0a0a0a] px-6 py-16 text-white">
          <div className="mx-auto max-w-3xl rounded-2xl border border-rose-500/20 bg-[#111] p-6 shadow-2xl">
            <p className="mb-3 text-xs font-bold uppercase tracking-[0.3em] text-rose-400">
              Frontend Error
            </p>
            <h1 className="mb-3 text-2xl font-bold">Yang-RotBot Trading 無法完成載入</h1>
            <p className="mb-4 text-sm text-white/70">
              前端執行時發生錯誤，所以主畫面被中止。這通常不是部署失敗，而是瀏覽器執行某段程式時拋出例外。
            </p>
            <div className="rounded-xl border border-white/10 bg-black/40 p-4 font-mono text-sm text-amber-200">
              {this.state.message}
            </div>
            <p className="mt-4 text-xs text-white/40">
              重新整理後如果仍出現這個畫面，把這段錯誤訊息截圖給我，我就能直接對症修正。
            </p>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
