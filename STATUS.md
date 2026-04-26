# Telesearch — Project Status
> อัปเดตล่าสุด: 2026-04-26

## ภาพรวม
Thai Telegram directory (channels / groups / bots) สไตล์ Nicegram Hub
- Stack: Next.js 15 App Router · SQLite via Prisma · Tailwind CSS
- Dev: `npm run dev` → http://localhost:3030
- Deploy: Docker (`docker-compose up`) พร้อม seed.sql

---

## สิ่งที่ทำเสร็จแล้ว ✅

### Core / Backend
| รายการ | หมายเหตุ |
|--------|----------|
| Data model | `Entity` (kind: channel/group/bot), `Category`, `EntityCategory` (many-to-many) |
| `GET /api/search` | ค้นหาด้วย q, kind, category, activity — filter in-memory, cap 100 results |
| `GET/POST /api/entities` | list ทั้งหมด / สร้างด้วยมือ |
| `GET/PATCH/DELETE /api/entities/[id]` | CRUD รายตัว |
| `GET /api/categories` | list หมวดหมู่ทั้งหมด |
| `POST /api/telegram/fetch` | รับ link/username → ดึงจาก Telegram Bot API → upsert ลง DB |
| `POST /api/scrape/nicegram` | scrape Nicegram Hub URL → เก็บ username รายการ → queue ไป fetch |
| `POST /api/update-all` | bulk update memberCount ทุก entity ด้วย parallel workers + token pool |
| Token pool (round-robin) | `src/lib/tokenPool.ts` — รับ N bot tokens จาก env, แจกหมุนเวียน |
| Auto-category detection | `src/lib/categoryKeywords.ts` — `detectCategoriesFromText()` match keyword → slug |
| `lastPostAt` / `activityStatus` | ดึงวันโพสต์ล่าสุดจาก t.me/s/username (channel สาธารณะ) |

### Frontend (ปัจจุบัน)
| หน้า | Component | สถานะ |
|------|-----------|--------|
| `/` | SearchPage | ✅ ค้นหา + กรอง kind/category/activity + list/table toggle |
| `/search` | SearchPage | ✅ (same component) |
| `/add` | AddPage | ✅ กรอก link → fetch จาก Telegram |
| `/entity/[id]` | entity detail page | ✅ |
| CSV export | ปุ่มใน SearchPage | ✅ ส่งออก UTF-8 BOM CSV |

### Deployment
| รายการ | สถานะ |
|--------|--------|
| Dockerfile (standalone output) | ✅ |
| docker-compose.yml (port 3030, volume `./data:/app/prisma`) | ✅ |
| start.sh (db push + seed จาก seed.sql แล้ว start) | ✅ |
| seed.sql (dump ข้อมูลตั้งต้น อยู่นอก /app/prisma เพื่อรอด volume mount) | ✅ |

---

## สิ่งที่ยังไม่ได้ทำ ❌

ตาม `docs/NICEGRAM-STYLE-PLAN.md` — เป้าหมายคือทำ UI ให้เหมือน Nicegram Hub

### Phase 1 — UI / หน้าใหม่

| ลำดับ | หน้า | รายละเอียด | สถานะ |
|-------|------|------------|--------|
| 1 | Top menu | เมนูบน: ช่องทาง / กลุ่ม / บอท / หมวดหมู่ + ลิงก์ไปหน้าใหม่ | ❌ ยังไม่ทำ |
| 2 | `/` homepage แบบ Hub | Hero + ช่องค้นหา, บล็อก "เลือกตามหมวดหมู่" (การ์ดหมวด), "ยอดนิยม", "เพิ่งเพิ่ม" | ❌ ปัจจุบันเป็นแค่ SearchPage |
| 3 | `/channels` | รายการช่อง + กรองหมวด + search | ❌ |
| 3 | `/groups` | รายการกลุ่ม + กรองหมวด + search | ❌ |
| 3 | `/bots` | รายการบอท + กรองหมวด + search | ❌ |
| 4 | `/channel/[username]` | หน้า detail แบบ SEO-friendly (แทน /entity/[id]) | ❌ |
| 4 | `/group/[username]` | เหมือนกัน | ❌ |
| 4 | `/bot/[username]` | เหมือนกัน | ❌ |
| 5 | `/categories` | การ์ดทุกหมวด พร้อมสถิติ (จำนวนช่อง + สมาชิกรวม) | ❌ |
| 5 | `/category/[slug]` | แสดง entity ในหมวดนั้น | ❌ |
| 6 | `/top` | Top 100 เรียงตาม memberCount | ❌ |

### Phase 2 — ข้อมูลและ SEO (ถ้าต้องการต่อ)
- Sitemap / robots.txt สำหรับ SEO
- Meta tags (OG) ต่อหน้า entity
- Sticker packs (ถ้าต้องการ)
- Verification badge สำหรับแอดมินช่อง (ต้องมี auth)

---

## จุดเริ่มทำต่อ

**แนะนำเริ่มจาก Phase 1 ข้อ 1–2:**
1. ปรับ `src/components/AppNav.tsx` ให้มี top menu ครบ
2. สร้าง homepage ใหม่ (`src/app/page.tsx`) แทน SearchPage — มี Hero, category cards, popular list
3. สร้างหน้า `/channels`, `/groups`, `/bots` เป็น list pages
4. สร้างหน้า `/categories` + `/category/[slug]`
5. สร้าง SEO-friendly detail pages `/channel/[username]` แทน `/entity/[id]`

---

## ข้อควรรู้

- Telegram rate limit: ~30 req/นาที/token (ระวัง flood wait)
- `TELEGRAM_BOT_TOKEN` ใน `.env` — ใส่หลาย token ได้ (`TOKEN1,TOKEN2,...`) tokenPool จะ round-robin
- ข้อมูล `lastPostAt` ดึงได้เฉพาะ **channel สาธารณะ** เท่านั้น (ผ่าน t.me/s/username)
- Nicegram scraper ใช้ HTTPS fetch ตรงๆ (ไม่ใช้ Bot API) — ดึงได้เร็ว แต่ได้แค่ username ยังไม่มี member count จนกว่าจะ run update-all
