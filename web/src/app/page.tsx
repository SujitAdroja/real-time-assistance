export default function Home() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-3xl flex-col justify-center px-6 py-16">
      <p className="text-sm font-semibold uppercase tracking-[0.2em] text-indigo-700">
        Proof of concept
      </p>
      <h1 className="mt-4 text-4xl font-bold tracking-tight text-slate-950 sm:text-5xl">
        Real-Time Interview Assistant
      </h1>
      <p className="mt-5 max-w-2xl text-lg leading-8 text-slate-600">
        The frontend is ready. In the next milestone, it will connect to the
        backend over WebSocket.
      </p>
      <section className="mt-10 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">Milestone 1</h2>
        <p className="mt-2 text-slate-600">
          Next.js, React, TypeScript, and Tailwind CSS are set up.
        </p>
      </section>
    </main>
  );
}
