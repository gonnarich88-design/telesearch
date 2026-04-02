# Design: Telegram Channel Last Post Fetching

**Date:** 2026-03-19
**Status:** Approved

## Overview

ดึงวันที่โพสล่าสุด (`lastPostAt`) และคำนวณ `activityStatus` ของช่อง Telegram สาธารณะ โดย scrape หน้า `t.me/s/USERNAME` ซึ่ง Telegram เปิดเป็นสาธารณะ ไม่ต้องใช้ auth เพิ่มเติม

เนื่องจากปุ่ม "อัปเดตรายละเอียด" ในหน้า entity detail เรียก `POST /api/telegram/fetch` อยู่แล้ว ฟีเจอร์นี้จึงไม่ต้องมี API endpoint ใหม่หรือปุ่มใหม่ — แค่ต่อยอดใน `fetchLastPostAt` ที่ endpoint เดิม

## Scope

- รองรับเฉพาะ `kind === "channel"` ที่มี `username` (ช่องสาธารณะ)
- ดึงเฉพาะ `lastPostAt` — ไม่ดึง content โพส
- ทำงาน 2 กรณี ด้วย code path เดียวกัน:
  1. ตอนเพิ่ม entity ใหม่ผ่าน AddPage
  2. ตอนกด "อัปเดตรายละเอียด" ในหน้า entity detail (เรียก endpoint เดิม)
- ลบ stale comments ที่บอกว่าต้องใช้ MTProto

## Architecture

### New Function — `src/lib/telegram.ts`

```ts
export const ACTIVITY_INACTIVE_DAYS = 30;

export async function fetchLastPostAt(username: string): Promise<Date | null>
```

**การทำงาน:**
1. Fetch `https://t.me/s/${username}` ด้วย:
   - Header `User-Agent: Mozilla/5.0 (compatible; telesearch-bot/1.0)`
   - `AbortController` timeout 5 วินาที
2. ถ้า response ไม่ OK → return `null`
3. Parse HTML text ด้วย regex หาทุก `datetime` attribute ภายใน `.tgme_widget_message` block:
   - Pattern: จับ string ระหว่าง `tgme_widget_message` และ `</article>` แต่ละ block, แล้วดึง `datetime="..."` ภายใน block นั้น
   - เลือก datetime ที่มีค่า ISO string สูงสุด (โพสล่าสุด)
4. แปลงเป็น `new Date(...)` → คืนค่า ถ้า valid
5. ทุกกรณีที่ error → return `null` (ไม่ throw)
6. Log `console.warn` ถ้า response OK แต่ไม่พบ datetime — เพื่อ observability

**คำนวณ activityStatus** (ใช้ `ACTIVITY_INACTIVE_DAYS`):

```
โพสล่าสุดอยู่ภายใน 30 วันที่ผ่านมา  →  "active"
โพสล่าสุดเกิน 30 วันที่ผ่านมา       →  "inactive"
fetchLastPostAt คืน null             →  ไม่เปลี่ยน activityStatus เดิม
```

### Modified API — `POST /api/telegram/fetch` (เดิม)

**ไม่มีการเปลี่ยนแปลง signature หรือ response format**

เพิ่มหลังจาก upsert entity สำเร็จแล้ว (ก่อน re-fetch สุดท้ายเพื่อ response):

```
if (kind === "channel" && usernameNorm) {
  const lastPostAt = await fetchLastPostAt(usernameNorm);
  if (lastPostAt !== null) {
    const daysDiff = (Date.now() - lastPostAt.getTime()) / 86_400_000;
    const activityStatus = daysDiff <= ACTIVITY_INACTIVE_DAYS ? "active" : "inactive";
    await prisma.entity.update({
      where: { id: entity.id },
      data: { lastPostAt, activityStatus },
    });
  }
}
// re-fetch entity for response — ทั้ง update branch และ create branch ต้องมี re-fetch ณ จุดนี้
// เพื่อให้ response มี lastPostAt ที่อัพเดตแล้ว
// create branch (lines 91-101) ไม่มี re-fetch เดิม → ต้องเพิ่ม prisma.entity.findUnique ด้วย
const finalEntity = await prisma.entity.findUnique({
  where: { id: entity.id },
  include: { categories: { include: { category: true } } },
});
```

สำคัญ:
- `fetchLastPostAt` ต้องเกิดขึ้น **ก่อน** re-fetch สุดท้าย มิฉะนั้น response จะได้ค่าเก่า
- **create branch** ในโค้ดเดิมไม่มี re-fetch — ต้องเพิ่มให้ครบ (update branch มีอยู่แล้วที่ lines 84-89)
- ใช้ `finalEntity` เป็นข้อมูล response แทน `entity` variable เดิม เพื่อให้ทั้งสอง branch ใช้ code path เดียวกัน
- datetime comparison ใช้ `new Date(s).getTime()` เพื่อความถูกต้อง ไม่ใช่ string comparison

### Stale Code Cleanup

1. **`prisma/schema.prisma`** — ลบ comment บน `lastPostAt`: `// วันที่โพสต์ล่าสุดในช่อง/กลุ่ม (ต้องดึงจาก MTProto/Telethon — Bot API ไม่มี)`

2. **`src/app/entity/[id]/page.tsx` lines 259–263** — ลบ block ทั้งหมด:
   ```tsx
   {!entity.lastPostAt && (
     <p className="text-[10px] text-[var(--text-dim)] mt-1">
       หมายเหตุ: วันที่โพสต์ล่าสุดต้องดึงจาก MTProto/Telethon — Bot API ไม่ส่งค่านี้
     </p>
   )}
   ```

## Data Flow

```
AddPage หรือ EntityDetailPage "อัปเดตรายละเอียด"
  → POST /api/telegram/fetch
    → fetchFromTelegram()                    # ดึงชื่อ, memberCount ฯลฯ (เดิม)
    → upsert Entity in DB                   (เดิม)
    → if channel + username:
        fetchLastPostAt() [5s timeout]       # ใหม่
        if got Date:
          prisma.update lastPostAt + activityStatus
    → re-fetch entity from DB               # (เดิม)
    → return entity
```

## Error Handling

| กรณี | พฤติกรรม |
|---|---|
| Timeout >5s | `fetchLastPostAt` คืน `null` — ไม่อัพเดต lastPostAt |
| Non-200 HTTP | `null` |
| ไม่พบ `.tgme_widget_message` | `null` + `console.warn` |
| datetime invalid | `null` |
| ทุกกรณี | entity ยังสร้าง/อัพเดตสำเร็จ — lastPostAt เป็น optional |

## Out of Scope

- Groups และ Bots (ไม่มีหน้า t.me/s/)
- ช่องส่วนตัว (ไม่มี username)
- Batch/cron job
- ดึง content โพส หรือ post count
- Rate limiting / per-entity cooldown (พิจารณาในอนาคต)
