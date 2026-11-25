import Link from "next/link";

export default function NotFound() {
  return (
    <main className="mx-auto flex max-w-[1180px] flex-col items-start px-4 py-24 sm:px-6">
      <span className="num text-[11px] text-accent">error[E0404]</span>
      <h1 className="mt-3 text-[28px] font-semibold tracking-[-0.025em]">
        That page is not in scope.
      </h1>
      <p className="mt-2 max-w-[52ch] text-[13.5px] leading-relaxed text-muted">
        The compiler could not resolve this path. Unlike the borrow checker, we cannot suggest a
        fix — but the course index can.
      </p>
      <div className="mt-6 flex flex-wrap gap-3">
        <Link href="/learn" className="btn-link">
          All lessons
        </Link>
        <Link href="/" className="btn-outline">
          Home
        </Link>
      </div>
    </main>
  );
}
