import Link from "next/link";

// Placeholder. The real landing page is built in Phase 6.
export default function Home() {
  return (
    <main className="mx-auto max-w-2xl p-8">
      <h1 className="text-3xl font-bold text-blue-700">BedBoard</h1>
      <p className="mt-2 text-slate-700">Know every free bed, right now.</p>
      <p className="mt-6 flex gap-4 text-sm">
        <Link className="text-blue-700 underline" href="/login">
          Log in
        </Link>
        <Link className="text-blue-700 underline" href="/health">
          System health
        </Link>
      </p>
    </main>
  );
}
