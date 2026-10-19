import React from 'react';

export default class AppErrorBoundary extends React.Component<React.PropsWithChildren, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch() { console.error('Application view could not be rendered.'); }
  render() {
    if (!this.state.failed) return this.props.children;
    return <main dir="rtl" className="min-h-[100dvh] flex items-center justify-center p-6 bg-gray-50">
      <div role="alert" className="max-w-md bg-white border rounded-3xl p-8 text-center space-y-4">
        <h1 className="text-xl font-bold text-gray-900">نمایش صفحه با مشکل روبه‌رو شد</h1>
        <p className="text-gray-600 leading-7">اتصال اینترنت را بررسی کنید و صفحه را دوباره بارگذاری کنید.</p>
        <button onClick={() => window.location.reload()} className="rounded-xl bg-vira-primary text-white py-3 px-6 font-bold">بارگذاری دوباره</button>
      </div>
    </main>;
  }
}
