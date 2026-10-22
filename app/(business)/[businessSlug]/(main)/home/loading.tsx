import { KpiFallback, NeedsAttentionFallback } from "./page";

export default function BusinessDashboardLoading() {
  return (
    <div className="home-page-container home-entrance">
      {/* Assistant + launchpad stream with null fallbacks */}
      <section className="home-entrance-section w-full max-w-5xl mx-auto" />
      <section className="home-entrance-section w-full max-w-5xl mx-auto mt-4" />

      {/* KPI row */}
      <section className="home-entrance-section w-full max-w-5xl mx-auto mt-5">
        <KpiFallback />
      </section>

      {/* Priority queue */}
      <section className="home-entrance-section w-full max-w-5xl mx-auto mt-8 pb-24">
        <NeedsAttentionFallback />
      </section>
    </div>
  );
}
