# Telegram Channel Last Post Fetching — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Scrape `t.me/s/USERNAME` to populate `lastPostAt` and auto-set `activityStatus` for public Telegram channels, triggered on add and on-demand refresh.

**Architecture:** Add `fetchLastPostAt(username)` to the existing `src/lib/telegram.ts`, then call it inside `POST /api/telegram/fetch` after the entity upsert. Refactor the route to use a single unified re-fetch at the end (covering both create and update branches) so `lastPostAt` is always reflected in the response.

**Tech Stack:** Next.js 15 App Router, Prisma + SQLite, TypeScript, native `fetch` with `AbortController`

---

## File Map

| File | Action | What changes |
|---|---|---|
| `src/lib/telegram.ts` | Modify | Add `ACTIVITY_INACTIVE_DAYS` constant and `fetchLastPostAt` function |
| `src/app/api/telegram/fetch/route.ts` | Modify | Call `fetchLastPostAt` after upsert; unify final re-fetch to single `findUnique` |
| `prisma/schema.prisma` | Modify | Remove stale MTProto comment on `lastPostAt` field |
| `src/app/entity/[id]/page.tsx` | Modify | Remove stale MTProto disclaimer UI block (lines 259–263) |

---

## Task 1: Add `fetchLastPostAt` to `src/lib/telegram.ts`

**Files:**
- Modify: `src/lib/telegram.ts`

### Context

`t.me/s/USERNAME` returns HTML like:
```html
<div class="tgme_widget_message ...">
  ...
  <time datetime="2024-11-15T08:30:00+00:00">...</time>
  ...
</div>
```

Each post is a `tgme_widget_message` block containing a `<time datetime="...">` element. We extract all `datetime` values from within these blocks and pick the latest.

### Steps

- [ ] **Step 1: Add the constant and function signature**

Open `src/lib/telegram.ts`. After the existing imports/constants at the top of the file, add:

```ts
export const ACTIVITY_INACTIVE_DAYS = 30;

/**
 * ดึงวันที่โพสล่าสุดของช่อง Telegram สาธารณะโดย scrape t.me/s/username
 * คืน null ถ้าไม่พบหรือเกิดข้อผิดพลาดใดๆ
 */
export async function fetchLastPostAt(username: string): Promise<Date | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5_000);
  try {
    const res = await fetch(`https://t.me/s/${encodeURIComponent(username)}`, {
      signal: controller.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; telesearch-bot/1.0)",
      },
    });
    if (!res.ok) return null;
    const html = await res.text();

    // จับทุก tgme_widget_message block แล้วดึง datetime ภายในแต่ละ block
    const blockRe = /tgme_widget_message[\s\S]*?<\/article>/g;
    const datetimeRe = /datetime="([^"]+)"/;

    let latestMs = -Infinity;
    let latestDate: Date | null = null;

    for (const block of html.matchAll(blockRe)) {
      const m = block[0].match(datetimeRe);
      if (!m) continue;
      const d = new Date(m[1]);
      if (isNaN(d.getTime())) continue;
      if (d.getTime() > latestMs) {
        latestMs = d.getTime();
        latestDate = d;
      }
    }

    if (!latestDate) {
      console.warn(`[fetchLastPostAt] ไม่พบ datetime ใน t.me/s/${username}`);
      return null;
    }
    return latestDate;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors. If there are errors, fix them before continuing.

- [ ] **Step 3: Smoke-test manually (optional but recommended)**

Start the dev server and run this in a browser console or a quick Node script:

```ts
// Quick smoke test — run in Node with tsx
import { fetchLastPostAt } from "./src/lib/telegram";
const d = await fetchLastPostAt("telegram"); // Telegram's official channel
console.log(d); // should print a Date, not null
```

Or just proceed to Task 2 and test end-to-end there.

- [ ] **Step 4: Commit**

```bash
git add src/lib/telegram.ts
git commit -m "feat: add fetchLastPostAt to scrape last post date from t.me/s/username"
```

---

## Task 2: Wire `fetchLastPostAt` into `POST /api/telegram/fetch`

**Files:**
- Modify: `src/app/api/telegram/fetch/route.ts`

### Context

The route currently has two branches after category resolution:

- **Update branch** (lines 73–89): updates existing entity, re-fetches into `entity`
- **Create branch** (lines 90–101): creates new entity, assigns directly to `entity`

Then line 103 returns `entity`. We need to:
1. Call `fetchLastPostAt` after both branches (using the entity id)
2. If we get a date, update `lastPostAt` + `activityStatus` in DB
3. Do a **single unified re-fetch** into `finalEntity` covering both branches
4. Use `finalEntity` for the response

### Steps

- [ ] **Step 1: Import `fetchLastPostAt` and `ACTIVITY_INACTIVE_DAYS`**

At the top of `src/app/api/telegram/fetch/route.ts`, update the telegram import line:

```ts
import { fetchFromTelegram, fetchLastPostAt, ACTIVITY_INACTIVE_DAYS } from "@/lib/telegram";
```

- [ ] **Step 2: Replace the if/else block and response**

Replace lines 72–123 (from `let entity: EntityWithCategories;` through the closing `}` of the `return NextResponse.json`) with:

```ts
    let entityId: string;
    if (existing) {
      await prisma.entity.update({
        where: { id: existing.id },
        data,
      });
      if (categoryIds.length > 0) {
        await prisma.entityCategory.deleteMany({ where: { entityId: existing.id } });
        await prisma.entityCategory.createMany({
          data: categoryIds.map((categoryId) => ({ entityId: existing.id, categoryId })),
        });
      }
      entityId = existing.id;
    } else {
      const created = await prisma.entity.create({
        data: {
          ...data,
          categories:
            categoryIds.length > 0
              ? { create: categoryIds.map((categoryId) => ({ categoryId })) }
              : undefined,
        },
        select: { id: true },
      });
      entityId = created.id;
    }

    // ดึงวันที่โพสล่าสุด (เฉพาะ channel ที่มี username)
    if (kind === "channel" && usernameNorm) {
      const lastPostAt = await fetchLastPostAt(usernameNorm);
      if (lastPostAt !== null) {
        const daysDiff = (Date.now() - lastPostAt.getTime()) / 86_400_000;
        const activityStatus = daysDiff <= ACTIVITY_INACTIVE_DAYS ? "active" : "inactive";
        await prisma.entity.update({
          where: { id: entityId },
          data: { lastPostAt, activityStatus },
        });
      }
    }

    // Re-fetch เดียวครอบทั้ง create และ update branch
    const finalEntity = await prisma.entity.findUnique({
      where: { id: entityId },
      include: { categories: { include: { category: true } } },
    });
    if (!finalEntity) throw new Error("Entity not found after upsert");

    return NextResponse.json({
      data: {
        id: finalEntity.id,
        kind: finalEntity.kind,
        name: finalEntity.name,
        username: finalEntity.username,
        link: finalEntity.link,
        description: finalEntity.description ?? undefined,
        memberCount: finalEntity.memberCount,
        lastUpdatedAt: finalEntity.lastUpdatedAt.toISOString(),
        lastPostAt: finalEntity.lastPostAt?.toISOString() ?? undefined,
        isPublic: finalEntity.isPublic,
        activityStatus: finalEntity.activityStatus ?? undefined,
        categories: finalEntity.categories.map((ec) => ({
          id: ec.category.id,
          name: ec.category.name,
          slug: ec.category.slug,
        })),
      },
      created: !existing,
    });
```

- [ ] **Step 3: Remove unused `EntityWithCategories` type**

After the replacement, the `EntityWithCategories` type (lines 7–9 of the original file) is no longer used. Remove it:

```ts
// ลบ 3 บรรทัดนี้ออก:
type EntityWithCategories = Prisma.EntityGetPayload<{
  include: { categories: { include: { category: true } } };
}>;
```

Also remove `type { Prisma }` from the `@prisma/client` import at line 2 if `Prisma` is no longer referenced anywhere else in the file.

- [ ] **Step 4: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 5: End-to-end test**

Start the dev server:
```bash
npm run dev
```

Open `http://localhost:3030/add` and add a public Telegram channel (e.g. `t.me/telegram`).

Expected:
- Entity is created successfully
- In the entity detail page, "โพสต์ล่าสุด" field shows a date
- "สถานะช่อง/กลุ่ม" shows "ยังอัพเดตอยู่" (active) for active channels

Also test the "อัปเดตรายละเอียด" button on an existing channel's entity detail page — `lastPostAt` should refresh.

- [ ] **Step 6: Commit**

```bash
git add src/app/api/telegram/fetch/route.ts
git commit -m "feat: populate lastPostAt and activityStatus via t.me/s scrape on channel upsert"
```

---

## Task 3: Remove stale MTProto comments and disclaimer

**Files:**
- Modify: `prisma/schema.prisma`
- Modify: `src/app/entity/[id]/page.tsx`

### Steps

- [ ] **Step 1: Update `prisma/schema.prisma`**

Find line 26 which reads:
```
  lastPostAt      DateTime? // วันที่โพสต์ล่าสุดในช่อง/กลุ่ม (ต้องดึงจาก MTProto/Telethon — Bot API ไม่มี)
```

Replace with:
```
  lastPostAt      DateTime? // วันที่โพสต์ล่าสุดในช่อง/กลุ่ม (ดึงจาก t.me/s/username — เฉพาะ channel สาธารณะ)
```

- [ ] **Step 2: Remove disclaimer block from entity detail page**

In `src/app/entity/[id]/page.tsx`, remove lines 259–263:
```tsx
          {!entity.lastPostAt && (
            <p className="text-[10px] text-[var(--text-dim)] mt-1">
              หมายเหตุ: วันที่โพสต์ล่าสุดต้องดึงจาก MTProto/Telethon — Bot API ไม่ส่งค่านี้
            </p>
          )}
```

- [ ] **Step 3: Verify TypeScript compiles and dev server starts cleanly**

```bash
npx tsc --noEmit
npm run lint
```

Expected: no errors.

- [ ] **Step 4: Verify in browser**

Open any channel entity detail page. Confirm:
- No MTProto disclaimer text appears
- "โพสต์ล่าสุด" shows a date if the channel has been refreshed

- [ ] **Step 5: Commit**

```bash
git add prisma/schema.prisma src/app/entity/[id]/page.tsx
git commit -m "chore: update lastPostAt comment and remove stale MTProto disclaimer UI"
```
