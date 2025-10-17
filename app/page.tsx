"use client";

import Link from "next/link";
import type { Route } from "next";

const links: Array<{ href: Route; label: string }> = [
  { href: "/fan", label: "ファン画面へ" },
  { href: "/talent", label: "タレント画面へ" },
  { href: "/sign", label: "サイン作成画面へ" }
];

export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-3xl flex-col items-center justify-center gap-6 px-6 text-center">
      <h1 className="text-3xl font-bold">Online Sign System</h1>
      <p className="text-base text-slate-600">
        ファンとタレントがリアルタイムでつながり、サインを共有するオンライン体験アプリです。
      </p>
      <div className="flex flex-wrap items-center justify-center gap-4">
        {links.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className="rounded-lg border border-slate-200 px-4 py-3 text-sm font-medium text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-slate-50"
          >
            {link.label}
          </Link>
        ))}
      </div>
    </main>
  );
}
