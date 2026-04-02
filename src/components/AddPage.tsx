"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

type Category = { id: string; name: string; slug: string };

/** แยก URL/username จากข้อความ — แยกตาม newline หรือ comma */
function parseUrls(text: string): string[] {
  const raw = text
    .split(/[\n,]+/)
    .map((s) => s.trim())
    .filter(Boolean);
  const seen = new Set<string>();
  return raw.filter((s) => {
    const key = s.toLowerCase().replace(/^@/, "").replace(/.*t\.me\//i, "");
    if (!key || key.length < 4) return false;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function AddPage() {
  const [urlInput, setUrlInput] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [categories, setCategories] = useState<Category[]>([]);
  const [fetching, setFetching] = useState(false);
  const [result, setResult] = useState<{ ok: number; fail: number; messages: string[] } | null>(null);
  const [nicegramUrl, setNicegramUrl] = useState("https://nicegram.app/hub/category/gambling-betting?lang=th");
  const [nicegramMaxPages, setNicegramMaxPages] = useState(20);
  const [scrapingNicegram, setScrapingNicegram] = useState(false);
  const [nicegramPreview, setNicegramPreview] = useState<{
    source: string;
    pagesVisited: number;
    totalFound: number;
    existingCount: number;
    newCount: number;
    newUsernames: string[];
    allItems: Array<{ username: string; sourceKind: string; isNew: boolean }>;
  } | null>(null);

  useEffect(() => {
    fetch("/api/categories")
      .then((res) => res.json())
      .then((json) => json.data && setCategories(json.data));
  }, []);

  const importToDb = async (urlsOrUsernames: string[]) => {
    const urls = urlsOrUsernames;
    if (urls.length === 0) {
      setResult({ ok: 0, fail: 0, messages: ["ไม่พบ URL หรือ username ที่ใช้ได้ (วางทีละบรรทัดหรือคั่นด้วย comma)"] });
      return;
    }
    setFetching(true);
    setResult(null);
    const categoryIds = categoryId ? [categoryId] : [];
    let ok = 0;
    let fail = 0;
    const messages: string[] = [];
    const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

    for (let i = 0; i < urls.length; i++) {
      const link = urls[i];
      try {
        const res = await fetch("/api/telegram/fetch", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ link, categoryIds }),
        });
        const json = await res.json().catch(() => ({}));
        if (res.ok && json.data) {
          ok++;
          messages.push(`✓ ${json.data.name}`);
        } else {
          fail++;
          const errMsg = [json.error, json.detail].filter(Boolean).join(" — ");
          messages.push(`✗ ${link}: ${errMsg || "ไม่สำเร็จ"}`);
        }
      } catch {
        fail++;
        messages.push(`✗ ${link}: เกิดข้อผิดพลาด`);
      }
      // เว้นช่วง 1.5 วินาทีระหว่างแต่ละรายการ เพื่อลดโอกาส Telegram rate limit (Too Many Requests)
      if (i < urls.length - 1) await delay(1500);
    }

    setResult({ ok, fail, messages });
    setUrlInput("");
    setFetching(false);
  };

  const handleFetchFromTelegram = async () => {
    const urls = parseUrls(urlInput);
    await importToDb(urls);
  };

  const scrapeNicegram = async () => {
    const url = nicegramUrl.trim();
    if (!url) return;
    setScrapingNicegram(true);
    setNicegramPreview(null);
    try {
      const res = await fetch("/api/scrape/nicegram", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url, maxPages: nicegramMaxPages }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setResult({
          ok: 0,
          fail: 1,
          messages: [`✗ scrape: ${[json.error, json.detail].filter(Boolean).join(" — ") || "ไม่สำเร็จ"}`],
        });
        return;
      }

      const newUsernames: string[] = Array.isArray(json?.newItems)
        ? json.newItems
            .map((x: any) => (typeof x?.username === "string" ? x.username : ""))
            .filter(Boolean)
        : [];

      const newSet = new Set(newUsernames);
      const allItems: Array<{ username: string; sourceKind: string; isNew: boolean }> = Array.isArray(json?.items)
        ? json.items.map((x: any) => ({
            username: String(x?.username || ""),
            sourceKind: String(x?.sourceKind || "unknown"),
            isNew: newSet.has(String(x?.username || "")),
          })).filter((x) => x.username)
        : [];

      setNicegramPreview({
        source: String(json.source || url),
        pagesVisited: Number(json.pagesVisited || 0),
        totalFound: Number(json.totalFound || 0),
        existingCount: Number(json.existingCount || 0),
        newCount: Number(json.newCount || newUsernames.length),
        newUsernames,
        allItems,
      });
    } catch (err) {
      const detail = err instanceof Error ? ` (${err.message})` : "";
      setResult({ ok: 0, fail: 1, messages: [`✗ scrape: เกิดข้อผิดพลาด${detail}`] });
    } finally {
      setScrapingNicegram(false);
    }
  };

  const importNicegramNewItems = async () => {
    if (!nicegramPreview) return;
    const links = nicegramPreview.newUsernames.map((u) => `@${u}`);
    await importToDb(links);
  };

  const downloadNicegramCsv = () => {
    if (!nicegramPreview) return;
    const rows = [
      ["username", "kind", "status", "telegram_link"],
      ...nicegramPreview.allItems.map((item) => [
        item.username,
        item.sourceKind,
        item.isNew ? "new" : "existing",
        `https://t.me/${item.username}`,
      ]),
    ];
    const csv = rows.map((r) => r.map((v) => `"${v}"`).join(",")).join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `nicegram_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="min-h-screen bg-mesh grain relative">
      <div className="relative z-10 max-w-2xl mx-auto px-4 sm:px-6 py-8 sm:py-12">
        <header className="mb-8">
          <h1 className="font-display text-2xl sm:text-3xl font-bold text-[var(--text)]">
            เพิ่มข้อมูลช่อง/กลุ่มลงระบบ
          </h1>
          <p className="mt-2 text-[var(--text-muted)] text-sm sm:text-base">
            ใส่ลิงก์หรือ username ของช่อง/กลุ่ม/บอท (ต้องเป็นสาธารณะ) ระบบจะดึงชื่อและจำนวนสมาชิกจาก Telegram มาเก็บไว้ในระบบ
            หลังจากนั้นสามารถไปที่ <Link href="/" className="text-[var(--accent)] hover:underline">หน้าค้นหา</Link> เพื่อใช้ข้อมูลนี้ได้
          </p>
        </header>

        <section
          className="rounded-card border border-[var(--border)] p-5 sm:p-6"
          style={{ backgroundColor: "var(--bg-card)" }}
        >
          <h2 className="font-display font-semibold text-[var(--text)] mb-2">
            เพิ่มจากลิงก์ Telegram
          </h2>
          <p className="text-[var(--text-muted)] text-sm mb-4">
            วางได้หลายลิงก์ — ทีละบรรทัด หรือคั่นด้วย comma (เช่น t.me/durov, @channel_th)
          </p>
          <div className="mb-5 rounded-input border border-[var(--border)] p-4" style={{ backgroundColor: "var(--bg-elevated)" }}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="font-medium text-[var(--text)] text-sm">นำเข้าจาก Nicegram Hub</p>
                <p className="text-[var(--text-dim)] text-xs mt-0.5">
                  วางลิงก์หมวดหมู่ของ Nicegram แล้วกดดึงรายการ (ระบบจะนำเข้าเฉพาะรายการที่ยังไม่มีใน DB)
                </p>
              </div>
              <button
                type="button"
                onClick={scrapeNicegram}
                disabled={scrapingNicegram || fetching}
                className="rounded-input px-4 py-2 text-sm font-medium text-[var(--bg)] disabled:opacity-50"
                style={{ backgroundColor: "var(--accent)" }}
              >
                {scrapingNicegram ? "กำลังดึงรายการ..." : "ดึงรายการจาก Nicegram"}
              </button>
            </div>
            <div className="mt-3 flex flex-col sm:flex-row gap-2">
              <input
                value={nicegramUrl}
                onChange={(e) => setNicegramUrl(e.target.value)}
                placeholder="https://nicegram.app/hub/category/..."
                className="flex-1 min-w-0 rounded-input border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-[var(--text)] text-sm focus:border-[var(--border-focus)] focus:outline-none"
              />
              <div className="flex items-center gap-1.5 shrink-0">
                <label className="text-xs text-[var(--text-muted)] whitespace-nowrap">หน้าสูงสุด</label>
                <input
                  type="number"
                  min={1}
                  max={200}
                  value={nicegramMaxPages}
                  onChange={(e) => setNicegramMaxPages(Math.max(1, Math.min(200, Number(e.target.value) || 20)))}
                  className="w-20 rounded-input border border-[var(--border)] bg-[var(--bg)] px-2 py-2 text-[var(--text)] text-sm text-center focus:border-[var(--border-focus)] focus:outline-none"
                />
              </div>
            </div>

            {nicegramPreview && (
              <div className="mt-3">
                <div className="flex flex-wrap items-center gap-2 text-xs text-[var(--text-muted)]">
                  <span className="rounded-full border border-[var(--border)] px-2 py-0.5">pages {nicegramPreview.pagesVisited}</span>
                  <span className="rounded-full border border-[var(--border)] px-2 py-0.5">found {nicegramPreview.totalFound}</span>
                  <span className="rounded-full border border-[var(--border)] px-2 py-0.5">มีแล้ว {nicegramPreview.existingCount}</span>
                  <span className="rounded-full border border-[var(--border)] px-2 py-0.5">ใหม่ {nicegramPreview.newCount}</span>
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={importNicegramNewItems}
                    disabled={fetching || nicegramPreview.newUsernames.length === 0}
                    className="rounded-input px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
                    style={{ backgroundColor: "var(--success)" }}
                  >
                    {fetching ? "กำลังนำเข้า..." : `นำเข้า ${nicegramPreview.newUsernames.length} รายการใหม่`}
                  </button>
                  <button
                    type="button"
                    onClick={downloadNicegramCsv}
                    disabled={nicegramPreview.allItems.length === 0}
                    className="rounded-input px-4 py-2 text-sm font-medium disabled:opacity-50 border border-[var(--border)] text-[var(--text)]"
                    style={{ backgroundColor: "var(--bg-elevated)" }}
                  >
                    ดาวน์โหลด CSV ({nicegramPreview.allItems.length})
                  </button>
                  {nicegramPreview.newUsernames.length > 0 && (
                    <span className="text-[var(--text-dim)] text-xs">จะแปลงเป็น @username แล้วเรียก Telegram API ทีละรายการ</span>
                  )}
                </div>
                {nicegramPreview.newUsernames.length > 0 && (
                  <ul className="mt-2 max-h-40 overflow-y-auto text-xs text-[var(--text-muted)] space-y-0.5">
                    {nicegramPreview.newUsernames.slice(0, 60).map((u) => (
                      <li key={u} className="truncate">@{u}</li>
                    ))}
                    {nicegramPreview.newUsernames.length > 60 && (
                      <li className="text-[var(--text-dim)]">… และอีก {nicegramPreview.newUsernames.length - 60} รายการ</li>
                    )}
                  </ul>
                )}
              </div>
            )}
          </div>
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <label htmlFor="add-category" className="text-[var(--text)] text-sm font-medium">
              หมวดหมู่
            </label>
            <select
              id="add-category"
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
              className="rounded-input border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-2 text-[var(--text)] text-sm min-w-[200px] focus:border-[var(--border-focus)] focus:outline-none"
            >
              <option value="">— ไม่ระบุ —</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <span className="text-[var(--text-dim)] text-xs">ไม่เลือกก็ได้ — ระบบจะคัดกรองหมวดหมู่จากชื่อและคำอธิบายให้อัตโนมัติ</span>
          </div>
          <textarea
            placeholder={"t.me/durov\n@channel_th\nhttps://t.me/group_abc"}
            value={urlInput}
            onChange={(e) => setUrlInput(e.target.value)}
            rows={6}
            className="w-full rounded-input border border-[var(--border)] bg-[var(--bg-elevated)] px-4 py-3 text-[var(--text)] placeholder-[var(--text-dim)] focus:border-[var(--border-focus)] focus:outline-none focus:ring-2 focus:ring-[var(--border-focus)]/30 resize-y text-sm font-mono"
          />
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={handleFetchFromTelegram}
              disabled={fetching}
              className="rounded-input px-6 py-2.5 font-medium text-white shrink-0 disabled:opacity-50"
              style={{ backgroundColor: "var(--success)" }}
            >
              {fetching ? "กำลังดึง..." : "ดึงข้อมูล"}
            </button>
            {urlInput.trim() && (
              <span className="text-[var(--text-dim)] text-sm">
                ประมาณ {parseUrls(urlInput).length} รายการ
              </span>
            )}
          </div>
          {result && (
            <div className="mt-4 rounded-input border border-[var(--border)] p-3 text-sm" style={{ backgroundColor: "var(--bg-elevated)" }}>
              <p className="font-medium text-[var(--text)] mb-1">
                สำเร็จ {result.ok} รายการ
                {result.fail > 0 && <span className="text-[var(--error)]"> ไม่สำเร็จ {result.fail}</span>}
              </p>
              {result.fail > 0 && result.ok === 0 && result.messages.length > 0 && !result.messages.every((m) => m.startsWith("✗ scrape:")) && (
                <p className="text-[var(--text-dim)] text-xs mb-2">
                  แนะนำ: ตรวจสอบว่าใน .env ตั้งค่า TELEGRAM_BOT_TOKEN ถูกต้อง (สร้างบอทจาก @BotFather) และช่อง/กลุ่มต้องเป็นสาธารณะ (มี username) บอทต้องเคยถูก add ในกลุ่มก่อนถ้าเป็นกลุ่มส่วนตัว
                </p>
              )}
              {result.fail > 0 && result.messages.some((m) => m.includes("Too Many Requests")) && (
                <p className="text-amber-500/90 text-xs mb-2">
                  บางรายการเจอข้อจำกัดการเรียก API ของ Telegram (Too Many Requests) — ระบบเว้นช่วง 1.5 วินาทีต่อรายการแล้ว ถ้ายังเจออีกลองดึงทีละน้อยหรือรอสักครู่แล้วกดดึงใหม่
                </p>
              )}
              {result.messages.length > 0 && (
                <ul className="mt-2 space-y-0.5 text-[var(--text-muted)] max-h-80 overflow-y-auto">
                  {result.messages.map((msg, i) => (
                    <li key={i} className={msg.startsWith("✗") ? "text-[var(--error)]" : "text-[var(--success)]"}>
                      {msg}
                    </li>
                  ))}
                </ul>
              )}
              {result.messages.length > 0 && (
                <p className="mt-1 text-[var(--text-dim)] text-xs">แสดงทั้งหมด {result.messages.length} รายการ</p>
              )}
            </div>
          )}
        </section>

        <p className="mt-6 text-[var(--text-dim)] text-sm">
          ต้องการค้นหาข้อมูลที่อยู่ในระบบแล้ว? → <Link href="/" className="text-[var(--accent)] hover:underline">ไปหน้าค้นหา</Link>
        </p>
      </div>
    </div>
  );
}
