"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function AppNav() {
  const pathname = usePathname();
  const isSearch = pathname === "/";
  const isAdd = pathname === "/add";

  return (
    <nav
      className="relative z-10 border-b border-[var(--border)]"
      style={{ backgroundColor: "var(--bg-card)" }}
    >
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between">
        <Link href="/" className="font-display font-bold text-lg text-[var(--text)]">
          Telesearch
        </Link>
        <div className="flex gap-1">
          <Link
            href="/"
            className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
              isSearch
                ? "bg-[var(--accent-muted)] text-[var(--accent)]"
                : "text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[var(--bg-elevated)]"
            }`}
          >
            ค้นหา
          </Link>
          <Link
            href="/add"
            className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
              isAdd
                ? "bg-[var(--accent-muted)] text-[var(--accent)]"
                : "text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[var(--bg-elevated)]"
            }`}
          >
            เพิ่มข้อมูล
          </Link>
        </div>
      </div>
    </nav>
  );
}
