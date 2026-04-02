import { NextRequest, NextResponse } from "next/server";
import { fetchFromTelegram, fetchLastPostAt, ACTIVITY_INACTIVE_DAYS, getTokenPool } from "@/lib/telegram";
import { getNextToken } from "@/lib/tokenPool";
import { prisma } from "@/lib/prisma";
import { detectCategoriesFromText } from "@/lib/categoryKeywords";

/**
 * POST /api/telegram/fetch
 * Body: { link: string, categoryIds?: string[] } — ลิงก์หรือ username และ optional หมวดหมู่
 * ถ้าไม่ส่ง categoryIds ระบบจะคัดกรองหมวดหมู่จากชื่อและคำอธิบายอัตโนมัติ
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const linkOrUsername = typeof body?.link === "string" ? body.link.trim() : "";
    let categoryIds = Array.isArray(body?.categoryIds)
      ? (body.categoryIds as string[]).filter((id): id is string => typeof id === "string" && id.length > 0)
      : [];
    if (!linkOrUsername) {
      return NextResponse.json(
        { error: "กรุณาส่ง link (เช่น t.me/durov หรือ @durov)" },
        { status: 400 }
      );
    }

    // Round-robin: เลือก token ถัดไปในลำดับ
    // ถ้า token นั้นติด rate limit ให้ลอง token อื่นต่อไปเรื่อยๆ จนครบ pool
    const pool = getTokenPool();
    const startToken = getNextToken();
    let fetched = await fetchFromTelegram(linkOrUsername, startToken ?? undefined);

    if (!fetched.ok && fetched.error.startsWith("RATELIMIT:") && pool.length > 1) {
      for (const token of pool) {
        if (token === startToken) continue; // ข้ามตัวที่ลองแล้ว
        fetched = await fetchFromTelegram(linkOrUsername, token);
        if (fetched.ok || !fetched.error.startsWith("RATELIMIT:")) break;
      }
    }

    if (!fetched.ok) {
      const errMsg = fetched.error.startsWith("RATELIMIT:")
        ? (() => {
            const secs = parseInt(fetched.error.split(":")[1]) || 60;
            return `ถูก Telegram rate limit ทุก bot — กรุณารอ ${secs >= 3600 ? `${Math.ceil(secs / 3600)} ชม.` : `${Math.ceil(secs / 60)} นาที`}`;
          })()
        : fetched.error;
      return NextResponse.json({ error: errMsg }, { status: 400 });
    }

    const { kind, name, username, link, description, memberCount } = fetched;
    const usernameNorm = username?.toLowerCase() || null;

    if (categoryIds.length === 0) {
      const autoSlugs = detectCategoriesFromText(name, description);
      if (autoSlugs.length > 0) {
        const cats = await prisma.category.findMany({
          where: { slug: { in: autoSlugs } },
          select: { id: true },
        });
        categoryIds = cats.map((c) => c.id);
      } else {
        const otherCat = await prisma.category.findUnique({
          where: { slug: "other" },
          select: { id: true },
        });
        if (otherCat) categoryIds = [otherCat.id];
      }
    }
    const existing = usernameNorm
      ? await prisma.entity.findFirst({
          where: { username: usernameNorm },
          include: { categories: { include: { category: true } } },
        })
      : null;

    const data = {
      kind,
      name,
      username: usernameNorm,
      link: link || null,
      description: description || null,
      memberCount,
      lastUpdatedAt: new Date(),
      isPublic: true,
    };

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
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("telegram fetch error", error);
    return NextResponse.json(
      {
        error: "ดึงข้อมูลไม่สำเร็จ กรุณาลองใหม่",
        detail: message,
      },
      { status: 500 }
    );
  }
}
