"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";

type EntityKind = "channel" | "group" | "bot";

type JobStatus = "idle" | "running" | "done" | "cancelled";
type JobState = {
  status: JobStatus;
  total: number;
  done: number;
  succeeded: number;
  failed: number;
  workerNames: string[];
  workerCount: number;
  startedAt: string | null;
  finishedAt: string | null;
  errors: Array<{ name: string; error: string }>;
};

type Category = { id: string; name: string; slug: string; entityCount?: number };

type Entity = {
  id: string;
  kind: EntityKind;
  name: string;
  username?: string | null;
  link?: string | null;
  description?: string | null;
  memberCount: number;
  lastUpdatedAt: string;
  lastPostAt?: string | null;
  isPublic: boolean;
  activityStatus?: "active" | "inactive" | null;
  categories: Category[];
};

const ACTIVITY_LABELS: Record<string, string> = {
  active: "ยังอัพเดตอยู่",
  inactive: "ไม่อัพเดตแล้ว",
};

const KIND_META: Record<EntityKind, { label: string; shortLabel: string; icon: string; bg: string }> = {
  channel: { label: "ช่องทาง", shortLabel: "ช่อง", icon: "📢", bg: "bg-[var(--accent-muted)] text-[var(--accent)]" },
  group: { label: "กลุ่ม", shortLabel: "กลุ่ม", icon: "👥", bg: "bg-blue-500/15 text-blue-400" },
  bot: { label: "บอท", shortLabel: "บอท", icon: "🤖", bg: "bg-violet-500/15 text-violet-400" },
};

export function SearchPage() {
  const [q, setQ] = useState("");
  const [kinds, setKinds] = useState<EntityKind[]>(["channel", "group", "bot"]);
  const [categoryId, setCategoryId] = useState<string>("");
  const [activityFilter, setActivityFilter] = useState<string>(""); // "" | "active" | "inactive"
  const [categories, setCategories] = useState<Category[]>([]);
  const [results, setResults] = useState<Entity[]>([]);
  const [loading, setLoading] = useState(false);
  const [showAllCategories, setShowAllCategories] = useState(false);
  type ViewMode = "list" | "table";
  const [viewMode, setViewMode] = useState<ViewMode>("list");
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [jobState, setJobState] = useState<JobState | null>(null);
  const prevJobStatusRef = useRef<JobStatus | null>(null);
  const [toast, setToast] = useState<{ msg: string; type: "error" | "info" } | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [patchingEntityId, setPatchingEntityId] = useState<string | null>(null);
  const [categoryDropdownEntityId, setCategoryDropdownEntityId] = useState<string | null>(null);

  type SortKey = "memberCount_desc" | "memberCount_asc" | "lastUpdatedAt_desc" | "lastUpdatedAt_asc" | "activityStatus_asc" | "activityStatus_desc" | "category_asc" | "category_desc";
  const [sortKey, setSortKey] = useState<SortKey>("memberCount_desc");

  const sortedResults = ((): Entity[] => {
    const list = [...results];
    if (list.length === 0) return list;
    const [by, order] = sortKey.split("_") as [string, "asc" | "desc"];
    if (by === "memberCount") {
      return list.sort((a, b) => (order === "desc" ? b.memberCount - a.memberCount : a.memberCount - b.memberCount));
    }
    if (by === "lastUpdatedAt") {
      return list.sort((a, b) => {
        const tA = new Date(a.lastUpdatedAt).getTime();
        const tB = new Date(b.lastUpdatedAt).getTime();
        return order === "desc" ? tB - tA : tA - tB;
      });
    }
    if (by === "activityStatus") {
      const rank = (s: string | null | undefined) => (s === "active" ? 0 : s === "inactive" ? 1 : 2);
      return list.sort((a, b) => {
        const rA = rank(a.activityStatus);
        const rB = rank(b.activityStatus);
        return order === "asc" ? rA - rB : rB - rA;
      });
    }
    if (by === "category") {
      const name = (e: Entity) => e.categories[0]?.name ?? "";
      return list.sort((a, b) => {
        const c = name(a).localeCompare(name(b), "th");
        return order === "asc" ? c : -c;
      });
    }
    return list;
  })();

  const showToast = useCallback((msg: string, type: "error" | "info" = "error") => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setToast({ msg, type });
    toastTimerRef.current = setTimeout(() => setToast(null), 6_000);
  }, []);

  const FEATURED_SLUGS = ["adult-content-18", "gambling-betting"];
  const featuredCategories = [...categories.filter((c) => FEATURED_SLUGS.includes(c.slug))].sort(
    (a, b) => FEATURED_SLUGS.indexOf(a.slug) - FEATURED_SLUGS.indexOf(b.slug)
  );
  const otherCategories = categories.filter((c) => !FEATURED_SLUGS.includes(c.slug));
  const categoriesToShow = showAllCategories
    ? [...featuredCategories, ...otherCategories]
    : [...featuredCategories, ...otherCategories.slice(0, 10)];
  const hasMoreCategories = otherCategories.length > 10;
  const isFeatured = (slug: string) => FEATURED_SLUGS.includes(slug);

  const fetchCategories = useCallback(async () => {
    const res = await fetch("/api/categories");
    const json = await res.json();
    if (res.ok && json.data) setCategories(json.data);
  }, []);

  const search = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (q.trim()) params.set("q", q.trim());
      if (kinds.length > 0) params.set("kind", kinds.join(","));
      if (categoryId) params.set("category", categoryId);
      if (activityFilter) params.set("activity", activityFilter);
      const res = await fetch(`/api/search?${params.toString()}`);
      const json = await res.json();
      if (res.ok && json.data) setResults(json.data);
      else setResults([]);
    } catch {
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, [q, kinds, categoryId, activityFilter]);

  useEffect(() => {
    fetchCategories();
  }, [fetchCategories]);

  useEffect(() => {
    search();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // รีเฟรชผลลัพธ์เมื่อกลับมาที่ tab (เช่น หลังเพิ่มข้อมูลที่หน้า /add)
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") search();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [search]);

  // ดึงสถานะงานครั้งแรกเมื่อโหลดหน้า
  useEffect(() => {
    fetch("/api/update-all")
      .then((r) => r.json())
      .then((data: JobState) => setJobState(data))
      .catch(() => {});
  }, []);

  // polling เมื่อ job กำลังรัน
  useEffect(() => {
    if (jobState?.status !== "running") return;
    const id = setInterval(async () => {
      try {
        const res = await fetch("/api/update-all");
        if (!res.ok) return;
        const data: JobState = await res.json();
        const prev = prevJobStatusRef.current;
        prevJobStatusRef.current = data.status;
        setJobState(data);
        // เมื่อเสร็จ reload ผลลัพธ์
        if (prev === "running" && data.status !== "running") {
          search();
        }
      } catch {}
    }, 1_000);
    return () => clearInterval(id);
  }, [jobState?.status, search]);

  useEffect(() => {
    if (!categoryDropdownEntityId) return;
    const close = (ev: MouseEvent) => {
      const el = ev.target as Element;
      if (el.closest?.("[data-category-dropdown]") || el.closest?.("[data-category-trigger]")) return;
      setCategoryDropdownEntityId(null);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [categoryDropdownEntityId]);

  const toggleKind = (k: EntityKind) => {
    setKinds((prev) =>
      prev.includes(k) ? prev.filter((x) => x !== k) : [...prev, k]
    );
  };

  const selectCategoryAndSearch = (id: string) => {
    setCategoryId(id);
    setLoading(true);
    const params = new URLSearchParams();
    if (q.trim()) params.set("q", q.trim());
    if (kinds.length > 0) params.set("kind", kinds.join(","));
    if (id) params.set("category", id);
    if (activityFilter) params.set("activity", activityFilter);
    fetch(`/api/search?${params.toString()}`)
      .then((res) => res.json())
      .then((json) => {
        if (json.data) setResults(json.data);
        else setResults([]);
      })
      .catch(() => setResults([]))
      .finally(() => setLoading(false));
  };

  const formatDate = (iso: string) => {
    try {
      const d = new Date(iso);
      return d.toLocaleDateString("th-TH", {
        year: "numeric",
        month: "short",
        day: "numeric",
      });
    } catch {
      return iso;
    }
  };

  /** อัปเดตรายละเอียดจาก Telegram แล้วอัปเดตในรายการ */
  const refreshEntity = useCallback(async (e: Entity) => {
    const link = e.link?.trim() || (e.username ? `https://t.me/${e.username}` : "");
    if (!link) return;
    setUpdatingId(e.id);
    try {
      const res = await fetch("/api/telegram/fetch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          link,
          categoryIds: e.categories.map((c) => c.id),
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (res.ok && json.data) {
        const data = json.data as {
          id: string;
          kind: EntityKind;
          name: string;
          username?: string | null;
          link?: string | null;
          description?: string | null;
          memberCount: number;
          lastUpdatedAt: string;
          lastPostAt?: string | null;
          activityStatus?: "active" | "inactive" | null;
          isPublic: boolean;
          categories: Category[];
        };
        setResults((prev) =>
          prev.map((r) => (r.id === e.id ? { ...r, ...data } : r))
        );
      } else {
        const errMsg: string = json.error || json.detail || "อัปเดตไม่สำเร็จ";
        // แปล RATELIMIT error ให้อ่านง่าย
        const rlMatch = errMsg.match(/RATELIMIT:(\d+)/);
        if (rlMatch) {
          const secs = parseInt(rlMatch[1]);
          showToast(`ถูก Telegram rate limit — กรุณารอ ${secs >= 3600 ? `${Math.ceil(secs / 3600)} ชม.` : `${Math.ceil(secs / 60)} นาที`} แล้วลองใหม่`);
        } else {
          showToast(errMsg);
        }
      }
    } catch {
      showToast("เกิดข้อผิดพลาดในการอัปเดต");
    } finally {
      setUpdatingId(null);
    }
  }, []);

  /** เริ่ม background job อัปเดตทุกรายการผ่าน server */
  const refreshAllEntities = useCallback(async () => {
    const res = await fetch("/api/update-all", { method: "POST" });
    const json = await res.json().catch(() => ({}));
    if (res.status === 409) {
      const statusRes = await fetch("/api/update-all");
      if (statusRes.ok) setJobState(await statusRes.json());
      showToast("งานอัปเดตกำลังทำงานอยู่แล้ว ดูสถานะได้ที่ panel ล่างขวา", "info");
      return;
    }
    if (res.ok && json.state) {
      prevJobStatusRef.current = "running";
      setJobState(json.state as JobState);
    }
  }, []);

  /** ยกเลิก background job */
  const cancelUpdateJob = useCallback(async () => {
    await fetch("/api/update-all", { method: "DELETE" });
  }, []);

  const downloadCsv = () => {
    if (sortedResults.length === 0) return;
    const rows = [
      ["username", "name", "kind", "memberCount", "categories", "activityStatus", "lastPostAt", "lastUpdatedAt", "description", "link"],
      ...sortedResults.map((e) => [
        e.username ?? "",
        e.name,
        e.kind,
        String(e.memberCount),
        e.categories.map((c) => c.name).join("; "),
        e.activityStatus ?? "",
        e.lastPostAt ? e.lastPostAt.slice(0, 10) : "",
        e.lastUpdatedAt.slice(0, 10),
        (e.description ?? "").replace(/\n/g, " "),
        e.link ?? (e.username ? `https://t.me/${e.username}` : ""),
      ]),
    ];
    const csv = rows.map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `telesearch_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  /** แก้ไขสถานะ หมวดหมู่ หรือตั้ง "ดึงข้อมูลเมื่อ" เป็นวันนี้ */
  const patchEntity = useCallback(
    async (
      entityId: string,
      payload: {
        activityStatus?: "active" | "inactive" | null;
        categoryIds?: string[];
        updateFetchedAt?: boolean;
      }
    ) => {
      setPatchingEntityId(entityId);
      try {
        const res = await fetch(`/api/entity/${entityId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const json = await res.json().catch(() => ({}));
        if (res.ok && json.data) {
          const data = json.data as Entity & { lastUpdatedAt?: string };
          setResults((prev) =>
            prev.map((r) =>
              r.id === entityId
                ? { ...r, ...data, lastUpdatedAt: data.lastUpdatedAt ?? r.lastUpdatedAt }
                : r
            )
          );
        } else {
          alert(json.error || "บันทึกไม่สำเร็จ");
        }
      } catch {
        alert("เกิดข้อผิดพลาด");
      } finally {
        setPatchingEntityId(null);
      }
    },
    []
  );

  return (
    <div className="min-h-screen bg-mesh grain relative overflow-x-hidden">
      <div className="relative z-10 w-full max-w-[min(100vw,96rem)] mx-auto px-3 sm:px-4">

        {/* ═══ HERO ═══ */}
        <section className="pt-10 sm:pt-14 pb-8 text-center">
          <h1 className="font-display text-3xl sm:text-4xl font-bold tracking-tight text-[var(--text)] leading-tight">
            ค้นหา Channel, Group<br className="hidden sm:block" /> และ Bot บน Telegram
          </h1>
          <p className="mt-3 text-[var(--text-muted)] text-sm sm:text-base max-w-lg mx-auto">
            รวมช่อง กลุ่ม และบอทไทย — ค้นหาตามชื่อ หมวดหมู่ หรือสถานะการอัปเดต
          </p>

          {/* Large search bar */}
          <div className="relative max-w-2xl mx-auto mt-7">
            <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none">
              <svg className="w-5 h-5 text-[var(--text-dim)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </div>
            <input
              id="search-kw"
              type="search"
              placeholder="ค้นหาช่อง กลุ่ม บอท..."
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && search()}
              className="w-full rounded-full border border-[var(--border)] bg-[var(--bg-elevated)] pl-12 pr-4 py-3.5 text-[var(--text)] placeholder-[var(--text-dim)] focus:border-[var(--border-focus)] focus:outline-none focus:ring-2 focus:ring-[var(--border-focus)]/20 text-base transition-all"
            />
          </div>

          {/* Filter row */}
          <div className="flex flex-wrap justify-center items-center gap-2 mt-4">
            {(["channel", "group", "bot"] as EntityKind[]).map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => toggleKind(k)}
                className={`rounded-full px-4 py-1.5 text-sm font-medium transition-all border ${
                  kinds.includes(k)
                    ? "bg-[var(--accent-muted)] border-[var(--accent)]/50 text-[var(--accent)]"
                    : "border-[var(--border)] text-[var(--text-muted)] hover:border-[var(--border-focus)]/50 hover:text-[var(--text)]"
                }`}
              >
                {KIND_META[k].icon} {KIND_META[k].shortLabel}
              </button>
            ))}
            <div className="w-px h-5 bg-[var(--border)]" />
            <select
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
              className="rounded-full border border-[var(--border)] bg-[var(--bg-elevated)] px-4 py-1.5 text-[var(--text)] text-sm focus:border-[var(--border-focus)] focus:outline-none"
            >
              <option value="">ทุกหมวดหมู่</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
            <select
              value={activityFilter}
              onChange={(e) => setActivityFilter(e.target.value)}
              className="rounded-full border border-[var(--border)] bg-[var(--bg-elevated)] px-4 py-1.5 text-[var(--text)] text-sm focus:border-[var(--border-focus)] focus:outline-none"
            >
              <option value="">ทุกสถานะ</option>
              <option value="active">ยังอัพเดตอยู่</option>
              <option value="inactive">ไม่อัพเดตแล้ว</option>
            </select>
            <button
              type="button"
              onClick={search}
              disabled={loading}
              className="rounded-full px-6 py-1.5 font-medium text-[var(--bg)] disabled:opacity-50 shrink-0 text-sm transition-all hover:opacity-90"
              style={{ backgroundColor: "var(--accent)" }}
            >
              {loading ? "ค้นหา..." : "ค้นหา →"}
            </button>
          </div>
        </section>

        {/* ═══ STATS BAR ═══ */}
        {results.length > 0 && !loading && (
          <div className="flex flex-wrap justify-center gap-3 mb-8">
            {(["channel", "group", "bot"] as EntityKind[]).map((k) => {
              const count = results.filter((e) => e.kind === k).length;
              if (count === 0) return null;
              return (
                <div key={k} className="flex items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--bg-card)] px-5 py-2 text-sm">
                  <span>{KIND_META[k].icon}</span>
                  <span className="font-semibold text-[var(--accent)]">{count.toLocaleString()}</span>
                  <span className="text-[var(--text-muted)]">{KIND_META[k].shortLabel}</span>
                </div>
              );
            })}
          </div>
        )}

        {/* ═══ CATEGORY PILLS ═══ */}
        <section className="mb-8">
          <div className="flex gap-2 overflow-x-auto pb-2" style={{ scrollbarWidth: "none" }}>
            <button
              type="button"
              onClick={() => { setCategoryId(""); search(); }}
              className={`shrink-0 rounded-full border px-4 py-1.5 text-sm font-medium transition-all ${
                !categoryId
                  ? "border-[var(--accent)]/50 bg-[var(--accent-muted)] text-[var(--accent)]"
                  : "border-[var(--border)] text-[var(--text-muted)] hover:border-[var(--border-focus)]/50 hover:text-[var(--text)]"
              }`}
            >
              ทั้งหมด
            </button>
            {[...featuredCategories, ...otherCategories].map((c) => {
              const active = categoryId === c.id;
              const featured = isFeatured(c.slug);
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => selectCategoryAndSearch(c.id)}
                  className={`shrink-0 rounded-full border px-4 py-1.5 text-sm font-medium transition-all ${
                    active
                      ? "border-[var(--accent)]/50 bg-[var(--accent-muted)] text-[var(--accent)]"
                      : featured
                      ? "border-amber-500/30 bg-amber-500/10 text-amber-400 hover:border-amber-500/60"
                      : "border-[var(--border)] text-[var(--text-muted)] hover:border-[var(--border-focus)]/50 hover:text-[var(--text)]"
                  }`}
                >
                  {featured && <span className="mr-1">{c.slug === "adult-content-18" ? "🔞" : "🎲"}</span>}
                  {c.name}
                  {typeof c.entityCount === "number" && (
                    <span className="ml-1 text-xs opacity-60">({c.entityCount})</span>
                  )}
                </button>
              );
            })}
          </div>
        </section>

        {/* ═══ RESULTS ═══ */}
        <section className="pb-16">
          {/* Results header */}
          <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
            <div className="flex items-center gap-3">
              <h2 className="font-display font-semibold text-[var(--text)]">ผลลัพธ์</h2>
              <span className="rounded-full bg-[var(--bg-elevated)] border border-[var(--border)] px-2.5 py-0.5 text-xs text-[var(--text-muted)]">
                {results.length} รายการ
              </span>
            </div>
            {results.length > 0 && (
              <div className="flex flex-wrap items-center gap-2">
                <select
                  value={sortKey}
                  onChange={(e) => setSortKey(e.target.value as SortKey)}
                  className="rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-1.5 text-xs text-[var(--text)] focus:border-[var(--border-focus)] focus:outline-none"
                >
                  <option value="memberCount_desc">สมาชิก (มาก→น้อย)</option>
                  <option value="memberCount_asc">สมาชิก (น้อย→มาก)</option>
                  <option value="lastUpdatedAt_desc">ดึงข้อมูล (ใหม่→เก่า)</option>
                  <option value="lastUpdatedAt_asc">ดึงข้อมูล (เก่า→ใหม่)</option>
                  <option value="activityStatus_asc">สถานะ (อัพเดตก่อน)</option>
                  <option value="activityStatus_desc">สถานะ (ไม่อัพเดตก่อน)</option>
                  <option value="category_asc">หมวดหมู่ (ก-ฮ)</option>
                  <option value="category_desc">หมวดหมู่ (ฮ-ก)</option>
                </select>
                <button
                  type="button"
                  onClick={refreshAllEntities}
                  disabled={jobState?.status === "running"}
                  className="rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-1.5 text-xs font-medium text-[var(--accent)] hover:bg-[var(--accent-muted)]/50 disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center gap-1.5"
                  title="ดึงข้อมูลล่าสุดจาก Telegram สำหรับทุกรายการใน DB"
                >
                  {jobState?.status === "running" ? (
                    <>
                      <span className="inline-block w-3 h-3 border-2 border-[var(--accent)] border-t-transparent rounded-full animate-spin" />
                      อัปเดตทุกรายการ ({jobState.done}/{jobState.total})
                    </>
                  ) : "อัปเดตทุกรายการ"}
                </button>
                <button
                  type="button"
                  onClick={downloadCsv}
                  className="rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-1.5 text-xs font-medium text-[var(--text-muted)] hover:text-[var(--text)] inline-flex items-center gap-1.5"
                  title="ส่งออกผลลัพธ์ทั้งหมดเป็น CSV"
                >
                  ↓ CSV
                </button>
                <div className="flex rounded-lg border border-[var(--border)] p-0.5" style={{ backgroundColor: "var(--bg-elevated)" }}>
                  <button
                    type="button"
                    onClick={() => setViewMode("list")}
                    className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${viewMode === "list" ? "text-[var(--accent)]" : "text-[var(--text-muted)] hover:text-[var(--text)]"}`}
                    style={viewMode === "list" ? { backgroundColor: "var(--accent-muted)" } : undefined}
                  >
                    การ์ด
                  </button>
                  <button
                    type="button"
                    onClick={() => setViewMode("table")}
                    className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${viewMode === "table" ? "text-[var(--accent)]" : "text-[var(--text-muted)] hover:text-[var(--text)]"}`}
                    style={viewMode === "table" ? { backgroundColor: "var(--accent-muted)" } : undefined}
                  >
                    ตาราง
                  </button>
                </div>
              </div>
            )}
          </div>

          {loading ? (
            <div className="flex items-center justify-center gap-3 py-20 text-[var(--text-muted)]">
              <span className="inline-block w-6 h-6 border-2 border-[var(--accent)] border-t-transparent rounded-full animate-spin" />
              กำลังโหลด...
            </div>
          ) : results.length === 0 ? (
            <div className="rounded-2xl border border-[var(--border)] p-16 text-center" style={{ backgroundColor: "var(--bg-card)" }}>
              <p className="text-[var(--text-muted)] text-lg">ไม่พบรายการ</p>
              <p className="mt-1 text-[var(--text-dim)] text-sm">ลองเปลี่ยนคำค้น หมวดหมู่ หรือประเภท แล้วกดค้นหา</p>
            </div>
          ) : viewMode === "list" ? (
            /* ═══ CARD GRID ═══ */
            <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {sortedResults.map((e, i) => (
                <li
                  key={e.id}
                  className={`rounded-xl border border-[var(--border)] p-4 transition-all hover:border-[var(--border-focus)]/60 hover:shadow-lg ${categoryDropdownEntityId === e.id ? "relative z-[100]" : ""}`}
                  style={{
                    backgroundColor: "var(--bg-card)",
                    animation: "fadeInUp 0.35s ease-out both",
                    animationDelay: `${Math.min(i * 30, 240)}ms`,
                  }}
                >
                  <article className="h-full flex flex-col gap-3">
                    {/* Kind + status */}
                    <div className="flex items-center justify-between gap-2">
                      <span className={`shrink-0 inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ${KIND_META[e.kind].bg}`}>
                        {KIND_META[e.kind].icon} {KIND_META[e.kind].shortLabel}
                      </span>
                      <select
                        value={e.activityStatus ?? ""}
                        onChange={(ev) => {
                          const v = ev.target.value;
                          patchEntity(e.id, { activityStatus: v === "active" || v === "inactive" ? v : null });
                        }}
                        disabled={patchingEntityId === e.id}
                        className={`shrink-0 rounded-full border px-2 py-0.5 text-xs font-medium focus:outline-none disabled:opacity-50 ${
                          e.activityStatus === "active"
                            ? "border-emerald-500/60 bg-emerald-500/15 text-emerald-400"
                            : e.activityStatus === "inactive"
                              ? "border-red-500/60 bg-red-500/15 text-red-400"
                              : "border-[var(--border)] bg-[var(--bg-elevated)] text-[var(--text-muted)]"
                        }`}
                      >
                        <option value="">ไม่ระบุ</option>
                        <option value="active">ยังอัพเดต</option>
                        <option value="inactive">ไม่อัพเดต</option>
                      </select>
                    </div>

                    {/* Name + description */}
                    <div>
                      <h3 className="font-display font-semibold text-[var(--text)] leading-snug">
                        <Link href={`/entity/${e.id}`} className="hover:text-[var(--accent)] transition-colors">
                          {e.name}
                        </Link>
                      </h3>
                      {e.description && (
                        <p className="mt-1 text-xs text-[var(--text-muted)] line-clamp-2 leading-relaxed">
                          {e.description}
                        </p>
                      )}
                    </div>

                    {/* Stats */}
                    <div className="flex flex-wrap items-center gap-3 text-xs text-[var(--text-dim)]">
                      <span className="font-medium text-[var(--text-muted)]">
                        👥 {e.memberCount.toLocaleString()} สมาชิก
                      </span>
                      {e.lastPostAt ? (
                        <span className="text-emerald-400/80">โพสต์ล่าสุด {formatDate(e.lastPostAt)}</span>
                      ) : (
                        <span>ดึงข้อมูล {formatDate(e.lastUpdatedAt)}</span>
                      )}
                    </div>

                    <div className="flex-1" />

                    {/* Categories + actions */}
                    <div className="pt-2 border-t border-[var(--border)]/50 space-y-2">
                      <div className="relative">
                        <div className="flex flex-wrap items-center gap-1">
                          {e.categories.map((c) => (
                            <span
                              key={c.id}
                              className={`inline-flex rounded-full px-2 py-0.5 text-xs ${isFeatured(c.slug) ? "ring-1 ring-amber-500/30 bg-amber-500/10 text-amber-500" : "bg-[var(--bg-elevated)] text-[var(--text-dim)]"}`}
                            >
                              {c.name}
                            </span>
                          ))}
                          <button
                            type="button"
                            data-category-trigger
                            onClick={() => setCategoryDropdownEntityId((prev) => (prev === e.id ? null : e.id))}
                            disabled={patchingEntityId === e.id}
                            className="text-xs text-[var(--text-dim)] hover:text-[var(--accent)] transition-colors disabled:opacity-50"
                          >
                            {categoryDropdownEntityId === e.id ? "ปิด" : "แก้หมวด"}
                          </button>
                        </div>
                        {categoryDropdownEntityId === e.id && (
                          <div
                            data-category-dropdown
                            className="absolute left-0 top-full z-[110] mt-1 max-h-48 w-52 overflow-y-auto rounded-xl border border-[var(--border)] p-2 shadow-xl ring-1 ring-black/30"
                            style={{ backgroundColor: "var(--bg-elevated)" }}
                          >
                            {e.categories.length > 0 && (
                              <button
                                type="button"
                                onClick={() => patchEntity(e.id, { categoryIds: [] })}
                                disabled={patchingEntityId === e.id}
                                className="mb-2 w-full rounded-lg border border-[var(--border)] px-2 py-1.5 text-xs font-medium text-[var(--text-muted)] hover:bg-[var(--accent-muted)]/40 hover:text-[var(--text)] disabled:opacity-50"
                              >
                                เคลียร์หมวดหมู่
                              </button>
                            )}
                            {categories.map((c) => {
                              const checked = e.categories.some((ec) => ec.id === c.id);
                              return (
                                <label key={c.id} className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-[var(--text)] hover:bg-[var(--accent-muted)]/40">
                                  <input
                                    type="checkbox"
                                    checked={checked}
                                    onChange={() => {
                                      const newIds = checked
                                        ? e.categories.filter((ec) => ec.id !== c.id).map((ec) => ec.id)
                                        : [...e.categories.map((ec) => ec.id), c.id];
                                      patchEntity(e.id, { categoryIds: newIds });
                                    }}
                                    className="h-4 w-4 rounded border border-[var(--border)] bg-[var(--bg)] accent-[var(--accent)]"
                                  />
                                  <span>{c.name}</span>
                                </label>
                              );
                            })}
                            {categories.length === 0 && <p className="text-xs text-[var(--text-dim)]">ยังไม่มีหมวดหมู่</p>}
                          </div>
                        )}
                      </div>
                      <div className="flex flex-wrap items-center gap-2 text-xs">
                        <Link href={`/entity/${e.id}`} className="text-[var(--accent)] hover:underline">ดูรายละเอียด</Link>
                        {e.link && (
                          <a href={e.link} target="_blank" rel="noopener noreferrer" className="text-[var(--accent)] hover:underline truncate max-w-[140px]">
                            {e.link.replace("https://t.me/", "@")}
                          </a>
                        )}
                        <button
                          type="button"
                          onClick={() => refreshEntity(e)}
                          disabled={updatingId === e.id || (!e.link && !e.username)}
                          className="font-medium text-[var(--accent)] hover:underline disabled:opacity-50 inline-flex items-center gap-1"
                        >
                          {updatingId === e.id ? (
                            <><span className="inline-block w-3 h-3 border border-[var(--accent)] border-t-transparent rounded-full animate-spin" /> อัปเดต...</>
                          ) : "อัปเดต"}
                        </button>
                        <button
                          type="button"
                          onClick={() => patchEntity(e.id, { updateFetchedAt: true })}
                          disabled={patchingEntityId === e.id}
                          className="font-medium text-[var(--text-dim)] hover:text-[var(--accent)] hover:underline disabled:opacity-50"
                        >
                          {patchingEntityId === e.id ? "บันทึก..." : "ตั้งวันนี้"}
                        </button>
                      </div>
                    </div>
                  </article>
                </li>
              ))}
            </ul>
          ) : (
            <div
              className="rounded-card border border-[var(--border)] min-w-0 overflow-x-auto overflow-y-visible"
              style={{ backgroundColor: "var(--bg-card)" }}
            >
              <div className="min-w-0 overflow-y-visible">
                <table className="w-full table-fixed text-[11px] min-w-0" style={{ tableLayout: "fixed" }}>
                  <colgroup>
                    <col style={{ width: "5%" }} />
                    <col style={{ width: "10%" }} />
                    <col style={{ width: "16%" }} />
                    <col style={{ width: "13%" }} />
                    <col style={{ width: "6%" }} />
                    <col style={{ width: "8%" }} />
                    <col style={{ width: "7%" }} />
                    <col style={{ width: "8%" }} />
                    <col style={{ width: "9%" }} />
                    <col style={{ width: "14%" }} />
                    <col style={{ width: "9%" }} />
                  </colgroup>
                  <thead>
                    <tr className="border-b border-[var(--border)] text-left text-[var(--text-dim)]">
                      <th className="px-1 py-1.5 font-medium min-w-0 overflow-hidden">ประเภท</th>
                      <th className="px-1 py-1.5 font-medium min-w-0 overflow-hidden">ชื่อ</th>
                      <th className="px-1 py-1.5 font-medium min-w-0 overflow-hidden">รายละเอียด</th>
                      <th className="px-1 py-1.5 font-medium min-w-0 overflow-hidden">URL</th>
                      <th className="px-1 py-1.5 font-medium min-w-0 overflow-hidden">สมาชิก</th>
                      <th className="px-1 py-1.5 font-medium min-w-0 overflow-hidden" title="วันที่โพสต์ล่าสุดในช่อง/กลุ่ม (scrape จาก t.me/s)">โพสต์ล่าสุด</th>
                      <th className="px-1 py-1.5 font-medium min-w-0 overflow-hidden" title="วันที่ระบบดึงข้อมูลล่าสุด">ดึงข้อมูล</th>
                      <th className="px-1 py-1.5 font-medium min-w-0 overflow-hidden">สถานะ</th>
                      <th className="px-1 py-1.5 font-medium min-w-0 overflow-hidden">หมวดหมู่</th>
                      <th className="px-1 py-1.5 font-medium min-w-0 overflow-hidden">ดำเนินการ</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedResults.map((e, i) => (
                      <tr
                        key={e.id}
                        className={`border-b border-[var(--border)] last:border-0 hover:bg-[var(--bg-elevated)]/50 transition-colors ${categoryDropdownEntityId === e.id ? "relative z-[100]" : ""}`}
                        style={{
                          animation: "fadeInUp 0.25s ease-out both",
                          animationDelay: `${Math.min(i * 20, 200)}ms`,
                        }}
                      >
                        <td className="px-1 py-1.5 align-top min-w-0 overflow-hidden">
                          <span className={`inline-flex items-center gap-0.5 rounded px-1 py-0.5 font-semibold truncate max-w-full ${KIND_META[e.kind].bg}`} title={KIND_META[e.kind].label}>
                            {KIND_META[e.kind].icon} {KIND_META[e.kind].shortLabel}
                          </span>
                        </td>
                        <td className="px-1 py-1.5 align-top min-w-0 overflow-hidden">
                          <Link href={`/entity/${e.id}`} className="font-medium text-[var(--text)] hover:text-[var(--accent)] hover:underline line-clamp-2 block truncate" title={e.name}>
                            {e.name}
                          </Link>
                        </td>
                        <td className="px-1 py-1.5 text-[var(--text-muted)] align-top min-w-0 overflow-hidden">
                          <span className="line-clamp-2 block truncate" title={e.description || undefined}>{e.description || "—"}</span>
                        </td>
                        <td className="px-1 py-1.5 align-top min-w-0 overflow-hidden">
                          {e.link ? (
                            <a href={e.link} target="_blank" rel="noopener noreferrer" className="text-[var(--accent)] hover:underline line-clamp-1 block truncate" title={e.link}>
                              {e.link}
                            </a>
                          ) : (
                            <span className="text-[var(--text-dim)]">—</span>
                          )}
                        </td>
                        <td className="px-1 py-1.5 text-[var(--text-muted)] align-top min-w-0 overflow-hidden">{e.memberCount.toLocaleString()}</td>
                        <td className="px-1 py-1.5 align-top min-w-0 overflow-hidden truncate">
                          {e.lastPostAt ? (
                            <span className="text-emerald-400" title={e.lastPostAt}>{formatDate(e.lastPostAt)}</span>
                          ) : (
                            <span className="text-[var(--text-dim)]">—</span>
                          )}
                        </td>
                        <td className="px-1 py-1.5 text-[var(--text-muted)] align-top min-w-0 overflow-hidden truncate">{formatDate(e.lastUpdatedAt)}</td>
                        <td className="px-1 py-1.5 align-top min-w-0 overflow-hidden">
                          <select
                            value={e.activityStatus ?? ""}
                            onChange={(ev) => {
                              const v = ev.target.value;
                              patchEntity(e.id, {
                                activityStatus: v === "active" || v === "inactive" ? v : null,
                              });
                            }}
                            disabled={patchingEntityId === e.id}
                            className={`w-full min-w-0 max-w-full rounded border px-1 py-0.5 text-[10px] font-medium focus:outline-none disabled:opacity-50 ${
                              e.activityStatus === "active"
                                ? "border-emerald-500/60 bg-emerald-500/20 text-emerald-400"
                                : e.activityStatus === "inactive"
                                  ? "border-red-500/60 bg-red-500/20 text-red-400"
                                  : "border-[var(--border)] bg-[var(--bg-elevated)] text-[var(--text-muted)]"
                            }`}
                          >
                            <option value="">—</option>
                            <option value="active">อัพเดต</option>
                            <option value="inactive">ไม่อัพเดต</option>
                          </select>
                        </td>
                        <td
                          className={`px-1 py-1.5 align-top min-w-0 ${categoryDropdownEntityId === e.id ? "overflow-visible" : "overflow-hidden"}`}
                        >
                          <div className="relative min-w-0">
                            <div className="flex flex-wrap gap-0.5 min-w-0">
                              {e.categories.map((c) => (
                                <span
                                  key={c.id}
                                  className={`inline-flex rounded px-1 py-0.5 text-[10px] ${isFeatured(c.slug) ? "ring-1 ring-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400" : "bg-[var(--bg-elevated)] text-[var(--text-muted)]"}`}
                                >
                                  {c.name}
                                </span>
                              ))}
                            </div>
                            <button
                              type="button"
                              data-category-trigger
                              onClick={() => setCategoryDropdownEntityId((prev) => (prev === e.id ? null : e.id))}
                              disabled={patchingEntityId === e.id}
                              className="mt-0.5 inline-flex rounded border border-[var(--border)] bg-[var(--bg-elevated)] px-1 py-0.5 text-[10px] font-medium text-[var(--text)] hover:bg-[var(--accent-muted)]/30 disabled:opacity-50"
                            >
                              {categoryDropdownEntityId === e.id ? "ปิด" : "แก้หมวด"}
                            </button>
                            {categoryDropdownEntityId === e.id && (
                              <div
                                data-category-dropdown
                                className="absolute left-0 top-full z-[110] mt-1 max-h-48 w-52 overflow-y-auto rounded-lg border border-[var(--border)] p-2 shadow-xl ring-1 ring-black/30"
                                style={{ backgroundColor: "var(--bg-elevated)" }}
                              >
                                {e.categories.length > 0 && (
                                  <button
                                    type="button"
                                    onClick={() => patchEntity(e.id, { categoryIds: [] })}
                                    disabled={patchingEntityId === e.id}
                                    className="mb-2 w-full rounded border border-[var(--border)] px-2 py-1 text-xs font-medium text-[var(--text-muted)] hover:bg-[var(--accent-muted)]/40 hover:text-[var(--text)] disabled:opacity-50"
                                  >
                                    เคลียร์หมวดหมู่
                                  </button>
                                )}
                                {categories.map((c) => {
                                  const checked = e.categories.some((ec) => ec.id === c.id);
                                  return (
                                    <label
                                      key={c.id}
                                      className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm text-[var(--text)] hover:bg-[var(--accent-muted)]/40"
                                    >
                                      <input
                                        type="checkbox"
                                        checked={checked}
                                        onChange={() => {
                                          const newIds = checked
                                            ? e.categories.filter((ec) => ec.id !== c.id).map((ec) => ec.id)
                                            : [...e.categories.map((ec) => ec.id), c.id];
                                          patchEntity(e.id, { categoryIds: newIds });
                                        }}
                                        className="h-3.5 w-3.5 rounded border border-[var(--border)] bg-[var(--bg)] accent-[var(--accent)]"
                                      />
                                      <span>{c.name}</span>
                                    </label>
                                  );
                                })}
                                {categories.length === 0 && (
                                  <p className="text-xs text-[var(--text-dim)]">ยังไม่มีหมวดหมู่</p>
                                )}
                              </div>
                            )}
                          </div>
                        </td>
                        <td className="px-1 py-1.5 align-top min-w-0 overflow-hidden">
                          <div className="flex flex-col gap-0.5">
                            <button
                              type="button"
                              onClick={() => refreshEntity(e)}
                              disabled={updatingId === e.id || (!e.link && !e.username)}
                              className="text-[10px] font-medium text-[var(--accent)] hover:underline disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center gap-0.5 truncate text-left"
                              title="อัปเดตรายละเอียดจาก Telegram"
                            >
                              {updatingId === e.id ? (
                                <>
                                  <span className="inline-block h-3 w-3 border-2 border-[var(--accent)] border-t-transparent rounded-full animate-spin shrink-0" />
                                  <span className="truncate">อัปเดต...</span>
                                </>
                              ) : (
                                "อัปเดต"
                              )}
                            </button>
                            <button
                              type="button"
                              onClick={() => patchEntity(e.id, { updateFetchedAt: true })}
                              disabled={patchingEntityId === e.id}
                              className="text-[10px] font-medium text-[var(--text-muted)] hover:text-[var(--accent)] hover:underline disabled:opacity-50 truncate text-left"
                              title="ตั้งว่า ดึงข้อมูลเมื่อ เป็นวันนี้"
                            >
                              {patchingEntityId === e.id ? "กำลังบันทึก..." : "ตั้งว่าดึงวันนี้"}
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </section>
      </div> {/* /relative z-10 */}

      {/* Toast notification */}
      {toast && (
        <div
          className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-[60] flex items-center gap-3 rounded-xl border px-4 py-3 shadow-xl text-sm max-w-md transition-all ${
            toast.type === "error"
              ? "border-red-500/30 bg-red-500/10 text-red-300"
              : "border-[var(--accent)]/30 bg-[var(--accent-muted)] text-[var(--accent)]"
          }`}
        >
          <span className="flex-1">{toast.msg}</span>
          <button
            type="button"
            onClick={() => setToast(null)}
            className="text-current opacity-60 hover:opacity-100 transition-opacity shrink-0"
          >
            ✕
          </button>
        </div>
      )}

      {/* Job Status Panel — floating bottom-right */}
      {jobState && jobState.status !== "idle" && (
        <div
          className="fixed bottom-6 right-6 z-50 w-80 rounded-2xl border border-[var(--border)] shadow-2xl p-4 transition-all"
          style={{ backgroundColor: "var(--bg-card)" }}
        >
          {/* Header */}
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              {jobState.status === "running" && (
                <span className="inline-block w-3 h-3 border-2 border-[var(--accent)] border-t-transparent rounded-full animate-spin" />
              )}
              {jobState.status === "done" && (
                <span className="text-green-400 text-sm">✓</span>
              )}
              {jobState.status === "cancelled" && (
                <span className="text-[var(--text-muted)] text-sm">✕</span>
              )}
              <span className="font-semibold text-sm text-[var(--text)]">
                {jobState.status === "running" && `กำลังอัปเดต... (${jobState.workerCount} bot)`}
                {jobState.status === "done" && "อัปเดตเสร็จแล้ว"}
                {jobState.status === "cancelled" && "ยกเลิกแล้ว"}
              </span>
            </div>
            {jobState.status === "running" ? (
              <button
                type="button"
                onClick={cancelUpdateJob}
                className="text-xs text-red-400 hover:text-red-300 transition-colors px-2 py-1 rounded hover:bg-red-500/10"
              >
                ยกเลิก
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setJobState(null)}
                className="text-xs text-[var(--text-muted)] hover:text-[var(--text)] transition-colors px-2 py-1 rounded hover:bg-[var(--bg-elevated)]"
              >
                ปิด
              </button>
            )}
          </div>

          {/* Progress bar */}
          <div className="h-1.5 rounded-full bg-[var(--bg-elevated)] mb-3 overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{
                width: `${jobState.total > 0 ? Math.round((jobState.done / jobState.total) * 100) : 0}%`,
                backgroundColor:
                  jobState.status === "done"
                    ? "#22c55e"
                    : jobState.status === "cancelled"
                    ? "var(--text-muted)"
                    : "var(--accent)",
              }}
            />
          </div>

          {/* Stats row */}
          <div className="flex items-center justify-between text-xs mb-2">
            <span className="text-[var(--text-muted)]">
              {jobState.done} / {jobState.total} รายการ
            </span>
            <div className="flex gap-2">
              <span className="text-green-400">{jobState.succeeded} สำเร็จ</span>
              {jobState.failed > 0 && (
                <span className="text-red-400">{jobState.failed} ล้มเหลว</span>
              )}
            </div>
          </div>

          {/* Active workers */}
          {jobState.status === "running" && jobState.workerNames.some((n) => n) && (
            <div className="mt-1 space-y-0.5 mb-1">
              {jobState.workerNames.map((name, i) =>
                name ? (
                  <p key={i} className="text-[10px] text-[var(--text-dim)] truncate flex items-center gap-1">
                    <span className="text-[var(--accent)] shrink-0">Bot {i + 1}</span>
                    <span className="truncate">{name}</span>
                  </p>
                ) : null
              )}
            </div>
          )}

          {/* Elapsed / finished time */}
          {jobState.startedAt && (
            <p className="text-[10px] text-[var(--text-dim)]">
              {jobState.status === "running"
                ? `เริ่ม ${new Date(jobState.startedAt).toLocaleTimeString("th-TH")}`
                : jobState.finishedAt
                ? `เสร็จ ${new Date(jobState.finishedAt).toLocaleTimeString("th-TH")} · ใช้เวลา ${Math.round((new Date(jobState.finishedAt).getTime() - new Date(jobState.startedAt).getTime()) / 1000)} วิ`
                : null}
            </p>
          )}

          {/* Error list */}
          {jobState.errors.length > 0 && (
            <details className="mt-2">
              <summary className="text-[11px] text-red-400 cursor-pointer select-none">
                {jobState.errors.length} รายการล้มเหลว
              </summary>
              <ul className="mt-1.5 space-y-1 max-h-28 overflow-y-auto pr-1">
                {jobState.errors.slice(0, 10).map((err, i) => (
                  <li key={i} className="text-[10px] text-[var(--text-dim)]">
                    <span className="text-[var(--text-muted)]">{err.name}:</span>{" "}
                    {err.error}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}
    </div>
  );
}
