import { NextResponse } from "next/server";
import {
  getJobState,
  startJob,
  setJobTotal,
  setWorkerCurrent,
  recordSuccess,
  recordFailure,
  finishJob,
  cancelJob,
  isCancelRequested,
} from "@/lib/updateJob";
import { prisma } from "@/lib/prisma";
import {
  fetchFromTelegram,
  fetchLastPostAt,
  ACTIVITY_INACTIVE_DAYS,
  getTokenPool,
} from "@/lib/telegram";
import { detectCategoriesFromText } from "@/lib/categoryKeywords";

/** GET /api/update-all — ดึงสถานะงานปัจจุบัน */
export async function GET() {
  return NextResponse.json(getJobState());
}

/** POST /api/update-all — เริ่มงาน (ถ้ายังไม่ได้รัน) */
export async function POST() {
  const tokens = getTokenPool();
  if (tokens.length === 0) {
    return NextResponse.json({ error: "ไม่พบ TELEGRAM_BOT_TOKEN" }, { status: 500 });
  }

  const started = startJob(tokens.length);
  if (!started) {
    return NextResponse.json({ error: "งานกำลังทำงานอยู่แล้ว" }, { status: 409 });
  }

  // รัน background — ไม่ await เพื่อให้ response กลับทันที
  runJob(tokens).catch((err) => {
    console.error("[update-all] job crashed:", err);
    finishJob();
  });

  return NextResponse.json({ started: true, state: getJobState() });
}

/** DELETE /api/update-all — ขอยกเลิกงาน */
export async function DELETE() {
  cancelJob();
  return NextResponse.json({ cancelled: true });
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

/** แยก retry_after (วินาที) จาก RATELIMIT error — คืน null ถ้าไม่ใช่ */
function parseRateLimit(error: string): number | null {
  if (!error.startsWith("RATELIMIT:")) return null;
  return parseInt(error.slice("RATELIMIT:".length)) || 60;
}

async function runJob(tokens: string[]) {
  try {
    const entities = await prisma.entity.findMany({
      include: { categories: { include: { category: true } } },
      orderBy: { lastUpdatedAt: "asc" },
    });

    const toUpdate = entities.filter((e) => e.link?.trim() || e.username);
    setJobTotal(toUpdate.length);

    // แบ่ง entity ให้แต่ละ worker แบบ round-robin
    // เช่น 3 tokens → worker0: [0,3,6,9...], worker1: [1,4,7,10...], worker2: [2,5,8,11...]
    const chunks = tokens.map(() => [] as typeof toUpdate);
    toUpdate.forEach((e, i) => chunks[i % tokens.length].push(e));

    // รัน workers ทุกตัวพร้อมกัน
    await Promise.all(
      chunks.map((chunk, workerIdx) => runWorker(chunk, tokens[workerIdx], workerIdx))
    );
  } finally {
    finishJob();
  }
}

type EntityWithCategories = Awaited<ReturnType<typeof prisma.entity.findMany<{
  include: { categories: { include: { category: true } } };
}>>>[number];

async function runWorker(
  entities: EntityWithCategories[],
  token: string,
  workerIdx: number,
) {
  // stagger start เล็กน้อยเพื่อไม่ให้ทุก worker hit API พร้อมกันในนาทีแรก
  await sleep(workerIdx * 400);

  for (const e of entities) {
    if (isCancelRequested()) break;

    const link =
      e.link?.trim() ||
      (e.username ? `https://t.me/${e.username}` : "");
    if (!link) {
      recordFailure(e.name, "ไม่มีลิงก์");
      continue;
    }

    setWorkerCurrent(workerIdx, e.name);

    try {
      let fetched = await fetchFromTelegram(link, token);

      // handle rate limit: รอ retry_after (cap 5 นาที) แล้ว retry ครั้งเดียว
      if (!fetched.ok) {
        const retryAfterSec = parseRateLimit(fetched.error);
        if (retryAfterSec !== null) {
          const waitMs = Math.min(retryAfterSec * 1000, 5 * 60 * 1000);
          const waitMin = Math.ceil(waitMs / 60_000);
          setWorkerCurrent(workerIdx, `⏳ รอ rate limit ${waitMin} นาที...`);
          await sleep(waitMs);
          if (isCancelRequested()) break;
          setWorkerCurrent(workerIdx, e.name);
          fetched = await fetchFromTelegram(link, token);
        }
      }

      if (!fetched.ok) {
        const retryAfterSec = parseRateLimit(fetched.error);
        const friendlyError = retryAfterSec !== null
          ? `ถูก Telegram rate limit (retry after ${retryAfterSec}s)`
          : fetched.error;
        recordFailure(e.name, friendlyError);
        await sleep(1_200);
        continue;
      }

      const { kind, name, username, link: fetchedLink, description, memberCount } = fetched;
      const usernameNorm = username?.toLowerCase() || null;

      // ใช้ category เดิมถ้ามี ไม่งั้น auto-detect
      let categoryIds = e.categories.map((ec) => ec.categoryId);
      if (categoryIds.length === 0) {
        const autoSlugs = detectCategoriesFromText(name, description);
        if (autoSlugs.length > 0) {
          const cats = await prisma.category.findMany({
            where: { slug: { in: autoSlugs } },
            select: { id: true },
          });
          categoryIds = cats.map((c) => c.id);
        }
      }

      await prisma.entity.update({
        where: { id: e.id },
        data: {
          kind,
          name,
          username: usernameNorm,
          link: fetchedLink || null,
          description: description || null,
          memberCount,
          lastUpdatedAt: new Date(),
          isPublic: true,
        },
      });

      if (kind === "channel" && usernameNorm) {
        const lastPostAt = await fetchLastPostAt(usernameNorm);
        if (lastPostAt !== null) {
          const daysDiff = (Date.now() - lastPostAt.getTime()) / 86_400_000;
          const activityStatus =
            daysDiff <= ACTIVITY_INACTIVE_DAYS ? "active" : "inactive";
          await prisma.entity.update({
            where: { id: e.id },
            data: { lastPostAt, activityStatus },
          });
        }
      }

      recordSuccess();
    } catch (err) {
      recordFailure(e.name, err instanceof Error ? err.message : "unknown error");
    }

    await sleep(1_200);
  }

  setWorkerCurrent(workerIdx, "");
}
