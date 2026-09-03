"use client";

export default function DashboardError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <div className="surface-card mx-auto max-w-xl p-8 text-center"><p className="eyebrow">Finance Studio</p><h2 className="section-title mt-2">This view could not be loaded.</h2><p className="section-copy mt-2">Your records were not changed. Try loading the view again.</p><button type="button" className="primary-button mt-6" onClick={reset}>Try again</button></div>;
}
