# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Development (runs on localhost:3030)
npm run dev

# Build
npm run build

# Lint
npm run lint

# Database
npm run db:generate   # regenerate Prisma client after schema changes
npm run db:push       # push schema to SQLite (prisma/dev.db)
npm run db:seed       # seed categories + sample entities
```

No test suite is configured.

## Environment

Create `.env` with:
```
TELEGRAM_BOT_TOKEN=your_bot_token_here
```

The Telegram Bot API is used to fetch channel/group/bot metadata. The bot must be a member of private groups to access them; public channels/groups/bots work without membership.

## Architecture

**telesearch** is a Next.js 15 (App Router) directory of Thai Telegram channels, groups, and bots. It uses SQLite via Prisma for storage and Tailwind CSS for styling.

### Data Model

Three models in `prisma/schema.prisma`:
- `Entity` — a Telegram channel, group, or bot (`kind: "channel" | "group" | "bot"`)
- `Category` — browseable categories (seeded from `prisma/seed.ts`, matching Nicegram's category list)
- `EntityCategory` — many-to-many join table

Entities are identified by `username` (lowercased). The upsert pattern in `POST /api/telegram/fetch` updates existing entities by matching on `username`.

### API Routes

| Route | Method | Purpose |
|---|---|---|
| `/api/search` | GET | Search/filter entities (by `q`, `kind`, `category`, `activity`) |
| `/api/entities` | GET/POST | List all or create entity manually |
| `/api/entities/[id]` | GET/PATCH/DELETE | Get, update, delete a single entity |
| `/api/entity/[id]` | — | Alternate entity route |
| `/api/categories` | GET | List all categories |
| `/api/telegram/fetch` | POST | Fetch from Telegram Bot API and upsert entity |

### Key Library Files

- `src/lib/telegram.ts` — wraps Telegram Bot API (`getChat`, `getChatMemberCount`). Parses `t.me/username`, `@username`, or bare username inputs.
- `src/lib/categoryKeywords.ts` — keyword-based auto-categorization: `detectCategoriesFromText(name, description)` returns matching category slugs. Falls back to `"other"` if no match.
- `src/lib/prisma.ts` — singleton Prisma client.

### Frontend

- `src/app/page.tsx` → renders `<SearchPage>` (the main search/browse UI)
- `src/app/search/page.tsx` → also renders `<SearchPage>`
- `src/app/add/page.tsx` → renders `<AddPage>` (add entity by Telegram link)
- `src/app/entity/[id]/page.tsx` → entity detail page
- `src/components/SearchPage.tsx` — client component with search, kind filters, category filters, activity filters, and list/table view toggle
- `src/components/AddPage.tsx` — client component for submitting a Telegram link; calls `POST /api/telegram/fetch`
- `src/components/AppNav.tsx` — shared navigation bar

### Search Behavior

`GET /api/search` fetches up to 10,000 records from DB when `q` is present, then filters in-memory (case-insensitive match on `name`, `username`, `description`), capped at 100 results. Without `q`, returns up to 500 records sorted by `memberCount` desc.

### Category Auto-Detection

When adding via `/api/telegram/fetch` without explicit `categoryIds`, the system calls `detectCategoriesFromText()` to match keywords in the entity's name and description against `CATEGORY_KEYWORDS` in `src/lib/categoryKeywords.ts`. If no keywords match, the entity is assigned to the `"other"` category.
