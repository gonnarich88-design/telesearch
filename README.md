# Telesearch

ระบบค้นหา Channel, Group และ Bot บน Telegram — กรองตามประเภทและหมวดหมู่ แสดงชื่อ, ลิงก์, จำนวนสมาชิก, อัปเดตล่าสุด

## Tech stack

- **Next.js 15** (App Router) + TypeScript + Tailwind CSS
- **Prisma** + SQLite

## การติดตั้งและรัน

```bash
npm install
npx prisma generate
npx prisma db push
npm run db:seed
cp .env.example .env
# แก้ .env ใส่ TELEGRAM_BOT_TOKEN จาก @BotFather
npm run dev
```

เปิด [http://localhost:3030](http://localhost:3030)

## ดึงข้อมูลจาก Telegram

- สร้างบอทที่ [@BotFather](https://t.me/BotFather) แล้วเอา token ไปใส่ใน `.env` เป็น `TELEGRAM_BOT_TOKEN`
- ในหน้าแรก มีช่อง "เพิ่มจากลิงก์ Telegram" — วางลิงก์ (เช่น `t.me/durov`) หรือ username (`@durov`) แล้วกด "ดึงข้อมูล"
- ระบบจะเรียก Telegram Bot API (getChat, getChatMemberCount) แล้วบันทึก/อัปเดตลง DB
- ช่อง/กลุ่มต้องเป็น**สาธารณะ** ถึงจะดึงได้

## API

- **GET /api/search?q=...&kind=channel,group,bot&category=...** — ค้นหา entities ตามคำค้น, ประเภท (channel/group/bot), หมวดหมู่
- **GET /api/entities** — รายการ entities ทั้งหมด
- **POST /api/entities** — สร้าง entity (kind, name, username, link, description, memberCount, isPublic, categoryIds)
- **GET /api/entities/[id]** — ดึง entity ตาม id
- **PATCH /api/entities/[id]** — แก้ไข entity
- **DELETE /api/entities/[id]** — ลบ entity
- **GET /api/categories** — รายการหมวดหมู่
- **POST /api/categories** — สร้างหมวดหมู่ (name, slug)

## ข้อมูลที่แสดง

- **Channel / Group:** ชื่อ, ลิงก์, จำนวนสมาชิก, อัปเดตล่าสุด, หมวดหมู่
- **Bot:** ชื่อ, username (@xxx), ลิงก์, คำอธิบาย, จำนวนสมาชิก, อัปเดตล่าสุด, หมวดหมู่
