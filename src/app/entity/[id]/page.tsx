"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";

type EntityKind = "channel" | "group" | "bot";
type Category = { id: string; name: string; slug: string };
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
  createdAt?: string;
  categories: Category[];
};

const KIND_META: Record<EntityKind, { label: string; shortLabel: string; icon: string; bg: string }> = {
  channel: { label: "ช่องทาง", shortLabel: "ช่อง", icon: "📢", bg: "bg-[var(--accent-muted)] text-[var(--accent)]" },
  group: { label: "กลุ่ม", shortLabel: "กลุ่ม", icon: "👥", bg: "bg-blue-500/15 text-blue-400" },
  bot: { label: "บอท", shortLabel: "บอท", icon: "🤖", bg: "bg-violet-500/15 text-violet-400" },
};

export default function EntityDetailPage() {
  const params = useParams();
  const id = typeof params?.id === "string" ? params.id : "";
  const [entity, setEntity] = useState<Entity | null>(null);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [savingTag, setSavingTag] = useState(false);
  const [savingFetchedAt, setSavingFetchedAt] = useState(false);
  const [savingCategories, setSavingCategories] = useState(false);
  const [allCategories, setAllCategories] = useState<Category[]>([]);

  const fetchEntity = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/entity/${id}`);
      const json = await res.json();
      if (res.ok && json.data) setEntity(json.data);
      else setEntity(null);
    } catch {
      setEntity(null);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchEntity();
  }, [fetchEntity]);

  useEffect(() => {
    fetch("/api/categories")
      .then((res) => res.json())
      .then((json) => json.data && setAllCategories(json.data));
  }, []);

  const formatDate = (iso: string) => {
    try {
      return new Date(iso).toLocaleString("th-TH", {
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return iso;
    }
  };

  const refreshEntity = useCallback(async () => {
    if (!entity) return;
    const link = entity.link?.trim() || (entity.username ? `https://t.me/${entity.username}` : "");
    if (!link) return;
    setUpdating(true);
    try {
      const res = await fetch("/api/telegram/fetch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          link,
          categoryIds: entity.categories.map((c) => c.id),
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (res.ok && json.data) {
        setEntity((prev) => (prev ? { ...prev, ...json.data, lastUpdatedAt: json.data.lastUpdatedAt } : null));
      } else {
        alert(json.error || json.detail || "อัปเดตไม่สำเร็จ");
      }
    } catch {
      alert("เกิดข้อผิดพลาดในการอัปเดต");
    } finally {
      setUpdating(false);
    }
  }, [entity]);

  const setFetchedAtToNow = useCallback(async () => {
    if (!entity) return;
    setSavingFetchedAt(true);
    try {
      const res = await fetch(`/api/entity/${entity.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ updateFetchedAt: true }),
      });
      const json = await res.json().catch(() => ({}));
      if (res.ok && json.data?.lastUpdatedAt) {
        setEntity((prev) => (prev ? { ...prev, lastUpdatedAt: json.data.lastUpdatedAt } : null));
      } else {
        alert(json.error || "บันทึกไม่สำเร็จ");
      }
    } catch {
      alert("เกิดข้อผิดพลาด");
    } finally {
      setSavingFetchedAt(false);
    }
  }, [entity]);

  const setActivityTag = useCallback(async (value: "active" | "inactive" | null) => {
    if (!entity) return;
    setSavingTag(true);
    try {
      const res = await fetch(`/api/entity/${entity.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ activityStatus: value }),
      });
      const json = await res.json().catch(() => ({}));
      if (res.ok && json.data) setEntity((prev) => (prev ? { ...prev, activityStatus: json.data.activityStatus } : null));
      else alert(json.error || "บันทึกไม่สำเร็จ");
    } catch {
      alert("เกิดข้อผิดพลาด");
    } finally {
      setSavingTag(false);
    }
  }, [entity]);

  const saveCategories = useCallback(async (categoryIds: string[]) => {
    if (!entity) return;
    setSavingCategories(true);
    try {
      const res = await fetch(`/api/entity/${entity.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ categoryIds }),
      });
      const json = await res.json().catch(() => ({}));
      if (res.ok && json.data) setEntity((prev) => (prev ? { ...prev, categories: json.data.categories } : null));
      else alert(json.error || "บันทึกหมวดหมู่ไม่สำเร็จ");
    } catch {
      alert("เกิดข้อผิดพลาด");
    } finally {
      setSavingCategories(false);
    }
  }, [entity]);

  const addCategory = useCallback((categoryId: string) => {
    if (!entity) return;
    const currentIds = entity.categories.map((c) => c.id);
    if (currentIds.includes(categoryId)) return;
    saveCategories([...currentIds, categoryId]);
  }, [entity, saveCategories]);

  const removeCategory = useCallback((categoryId: string) => {
    if (!entity) return;
    saveCategories(entity.categories.filter((c) => c.id !== categoryId).map((c) => c.id));
  }, [entity, saveCategories]);

  if (loading) {
    return (
      <div className="min-h-screen bg-mesh grain relative flex items-center justify-center">
        <div className="relative z-10 flex items-center gap-2 text-[var(--text-muted)]">
          <span className="inline-block w-6 h-6 border-2 border-[var(--accent)] border-t-transparent rounded-full animate-spin" />
          กำลังโหลด...
        </div>
      </div>
    );
  }

  if (!entity) {
    return (
      <div className="min-h-screen bg-mesh grain relative">
        <div className="relative z-10 max-w-2xl mx-auto px-4 py-12 text-center">
          <p className="text-[var(--text-muted)]">ไม่พบรายการนี้</p>
          <Link href="/" className="mt-4 inline-block text-[var(--accent)] hover:underline">
            ← กลับไปหน้าค้นหา
          </Link>
        </div>
      </div>
    );
  }

  const meta = KIND_META[entity.kind];

  return (
    <div className="min-h-screen bg-mesh grain relative">
      <div className="relative z-10 max-w-2xl mx-auto px-4 sm:px-6 py-8 sm:py-12">
        <Link href="/" className="inline-flex items-center gap-1 text-sm text-[var(--text-muted)] hover:text-[var(--accent)] mb-6">
          ← กลับไปหน้าค้นหา
        </Link>

        <article
          className="rounded-card border border-[var(--border)] p-6 sm:p-8"
          style={{ backgroundColor: "var(--bg-card)" }}
        >
          <div className="flex items-start gap-4">
            <div className={`flex h-14 w-14 shrink-0 flex-col items-center justify-center rounded-2xl text-2xl font-semibold ${meta.bg}`}>
              <span className="leading-none">{meta.icon}</span>
              <span className="text-xs mt-1">{meta.shortLabel}</span>
            </div>
            <div className="min-w-0 flex-1">
              <span className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-semibold ${meta.bg}`}>
                <span>{meta.icon}</span>
                <span>ประเภท: {meta.shortLabel}</span>
              </span>
              <h1 className="font-display text-xl sm:text-2xl font-bold text-[var(--text)] mt-2">
                {entity.name}
              </h1>
              {entity.username && (
                <p className="text-sm text-[var(--text-muted)] mt-0.5">@{entity.username}</p>
              )}
            </div>
          </div>

          {entity.description && (
            <div className="mt-6">
              <h2 className="text-sm font-medium text-[var(--text-dim)] mb-1">รายละเอียด</h2>
              <p className="text-[var(--text)] whitespace-pre-wrap">{entity.description}</p>
            </div>
          )}

          <dl className="mt-6 grid gap-3 sm:grid-cols-2">
            <div>
              <dt className="text-xs text-[var(--text-dim)]">จำนวนสมาชิก</dt>
              <dd className="text-[var(--text)] font-medium mt-0.5">{entity.memberCount.toLocaleString()}</dd>
            </div>
            {entity.lastPostAt && (
              <div>
                <dt className="text-xs text-[var(--text-dim)]">โพสต์ล่าสุด</dt>
                <dd className="text-[var(--text)] font-medium mt-0.5">{formatDate(entity.lastPostAt)}</dd>
              </div>
            )}
            <div>
              <dt className="text-xs text-[var(--text-dim)]">ดึงข้อมูลเมื่อ</dt>
              <dd className="text-[var(--text)] font-medium mt-0.5">{formatDate(entity.lastUpdatedAt)}</dd>
            </div>
          </dl>

          <div className="mt-6">
            <h2 className="text-sm font-medium text-[var(--text-dim)] mb-2">หมวดหมู่</h2>
            <p className="text-xs text-[var(--text-dim)] mb-2">ใส่หมวดหมู่ย้อนหลังได้ — เลือกเพิ่มหรือกด × เพื่อลบ</p>
            <div className="flex flex-wrap items-center gap-2">
              {entity.categories.map((c) => (
                <span
                  key={c.id}
                  className="inline-flex items-center gap-1 rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] px-2.5 py-1 text-sm text-[var(--text)]"
                >
                  {c.name}
                  <button
                    type="button"
                    onClick={() => removeCategory(c.id)}
                    disabled={savingCategories}
                    className="ml-0.5 rounded p-0.5 text-[var(--text-dim)] hover:bg-[var(--border)] hover:text-[var(--error)] disabled:opacity-50"
                    aria-label={`ลบ ${c.name}`}
                  >
                    ×
                  </button>
                </span>
              ))}
              <select
                value=""
                onChange={(e) => {
                  const v = e.target.value;
                  e.target.value = "";
                  if (v) addCategory(v);
                }}
                disabled={savingCategories}
                className="rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] px-2.5 py-1 text-sm text-[var(--text)] focus:border-[var(--border-focus)] focus:outline-none disabled:opacity-50"
              >
                <option value="">+ เพิ่มหมวดหมู่</option>
                {allCategories
                  .filter((c) => !entity.categories.some((ec) => ec.id === c.id))
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
              </select>
            </div>
            {savingCategories && <span className="mt-1.5 block text-xs text-[var(--text-dim)]">กำลังบันทึก...</span>}
          </div>

          <div className="mt-6">
            <h2 className="text-sm font-medium text-[var(--text-dim)] mb-2">สถานะช่อง/กลุ่ม (ตั้งเอง)</h2>
            <p className="text-xs text-[var(--text-dim)] mb-2">เลือกว่าช่อง/กลุ่มนี้ยังอัพเดตอยู่หรือไม่อัพเดตแล้ว เพื่อกรองในหน้าค้นหา</p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setActivityTag("active")}
                disabled={savingTag}
                className={`rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors disabled:opacity-50 ${
                  entity.activityStatus === "active"
                    ? "border-emerald-500 bg-emerald-500/15 text-emerald-400"
                    : "border-[var(--border)] text-[var(--text-muted)] hover:border-[var(--border-focus)] hover:text-[var(--text)]"
                }`}
              >
                ยังอัพเดตอยู่
              </button>
              <button
                type="button"
                onClick={() => setActivityTag("inactive")}
                disabled={savingTag}
                className={`rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors disabled:opacity-50 ${
                  entity.activityStatus === "inactive"
                    ? "border-[var(--text-dim)] bg-[var(--text-dim)]/15 text-[var(--text-dim)]"
                    : "border-[var(--border)] text-[var(--text-muted)] hover:border-[var(--border-focus)] hover:text-[var(--text)]"
                }`}
              >
                ไม่อัพเดตแล้ว
              </button>
              <button
                type="button"
                onClick={() => setActivityTag(null)}
                disabled={savingTag}
                className={`rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors disabled:opacity-50 ${
                  entity.activityStatus == null || entity.activityStatus === undefined
                    ? "border-[var(--accent)] bg-[var(--accent-muted)] text-[var(--accent)]"
                    : "border-[var(--border)] text-[var(--text-muted)] hover:border-[var(--border-focus)] hover:text-[var(--text)]"
                }`}
              >
                ไม่ระบุ
              </button>
              {savingTag && <span className="text-xs text-[var(--text-dim)] self-center">กำลังบันทึก...</span>}
            </div>
          </div>

          <div className="mt-8 flex flex-wrap items-center gap-3 pt-6 border-t border-[var(--border)]">
            {entity.link && (
              <a
                href={entity.link}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-lg px-4 py-2.5 text-sm font-medium text-white"
                style={{ backgroundColor: "var(--accent)" }}
              >
                เปิดใน Telegram →
              </a>
            )}
            <button
              type="button"
              onClick={refreshEntity}
              disabled={updating || (!entity.link && !entity.username)}
              className="rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] px-4 py-2.5 text-sm font-medium text-[var(--text)] hover:bg-[var(--accent-muted)]/50 disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center gap-2"
            >
              {updating ? (
                <>
                  <span className="inline-block w-4 h-4 border-2 border-[var(--accent)] border-t-transparent rounded-full animate-spin" />
                  กำลังอัปเดต...
                </>
              ) : (
                "อัปเดตรายละเอียด"
              )}
            </button>
            <button
              type="button"
              onClick={setFetchedAtToNow}
              disabled={savingFetchedAt}
              className="rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] px-4 py-2.5 text-sm font-medium text-[var(--text-muted)] hover:text-[var(--accent)] hover:bg-[var(--accent-muted)]/30 disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center gap-2"
              title='ตั้งว่า "ดึงข้อมูลเมื่อ" เป็นวันนี้ (ไม่ดึงจาก Telegram)'
            >
              {savingFetchedAt ? "กำลังบันทึก..." : "ตั้งว่าดึงวันนี้"}
            </button>
          </div>
        </article>
      </div>
    </div>
  );
}
