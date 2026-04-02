import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export type EntityKind = "channel" | "group" | "bot";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const q = searchParams.get("q")?.trim() ?? "";
    const kindParam = searchParams.get("kind"); // "channel" | "channel,group" | etc.
    const categoryId = searchParams.get("category")?.trim();
    const activityStatusParam = searchParams.get("activity")?.trim(); // "active" | "inactive"

    const kinds: EntityKind[] = [];
    if (kindParam) {
      const allowed = ["channel", "group", "bot"];
      kindParam.split(",").forEach((k) => {
        const t = k.trim().toLowerCase();
        if (allowed.includes(t)) kinds.push(t as EntityKind);
      });
    }

    const where: {
      kind?: { in: EntityKind[] };
      categories?: { some: { categoryId: string } };
      activityStatus?: string | null;
    } = {};

    if (kinds.length > 0) where.kind = { in: kinds };
    if (categoryId) where.categories = { some: { categoryId } };
    if (activityStatusParam === "active" || activityStatusParam === "inactive") where.activityStatus = activityStatusParam;

    // เมื่อมีคำค้น (q) ต้องค้นทั้งระบบ — ไม่ใช้แค่ 5000 รายการแรก จึงดึงมากพอแล้วกรองใน memory (case-insensitive)
    const takeLimit = q ? 10000 : 5000;
    let entities = await prisma.entity.findMany({
      where,
      include: { categories: { include: { category: true } } },
      orderBy: [{ memberCount: "desc" }, { lastUpdatedAt: "desc" }],
      take: takeLimit,
    });

    if (q) {
      const qLower = q.toLowerCase();
      entities = entities.filter(
        (e) =>
          e.name.toLowerCase().includes(qLower) ||
          (e.username?.toLowerCase().includes(qLower) ?? false) ||
          (e.description?.toLowerCase().includes(qLower) ?? false)
      );
      entities = entities.slice(0, 100);
    }

    const data = entities.map((e) => ({
      id: e.id,
      kind: e.kind,
      name: e.name,
      username: e.username,
      link: e.link,
      description: e.description ?? undefined,
      memberCount: e.memberCount,
      lastUpdatedAt: e.lastUpdatedAt.toISOString(),
      lastPostAt: e.lastPostAt?.toISOString() ?? undefined,
      isPublic: e.isPublic,
      activityStatus: e.activityStatus ?? undefined,
      categories: e.categories.map((ec) => ({ id: ec.category.id, name: ec.category.name, slug: ec.category.slug })),
    }));

    return NextResponse.json({ data });
  } catch (error) {
    console.error("search error", error);
    return NextResponse.json({ error: "Search failed" }, { status: 500 });
  }
}
