import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

    const entity = await prisma.entity.findUnique({
      where: { id },
      include: { categories: { include: { category: true } } },
    });
    if (!entity) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const data = {
      id: entity.id,
      kind: entity.kind,
      name: entity.name,
      username: entity.username,
      link: entity.link,
      description: entity.description ?? undefined,
      memberCount: entity.memberCount,
      lastUpdatedAt: entity.lastUpdatedAt.toISOString(),
      lastPostAt: entity.lastPostAt?.toISOString() ?? undefined,
      isPublic: entity.isPublic,
      createdAt: entity.createdAt.toISOString(),
      activityStatus: entity.activityStatus ?? undefined,
      categories: entity.categories.map((ec) => ({
        id: ec.category.id,
        name: ec.category.name,
        slug: ec.category.slug,
      })),
    };
    return NextResponse.json({ data });
  } catch (error) {
    console.error("entity get error", error);
    return NextResponse.json({ error: "Failed to load" }, { status: 500 });
  }
}

/** PATCH: อัปเดต activityStatus, categoryIds และ/หรือ ตั้งดึงข้อมูลเมื่อเป็นวันนี้ (updateFetchedAt: true) */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });
    const body = await request.json().catch(() => ({}));

    const activityStatus = body.activityStatus === "active" || body.activityStatus === "inactive"
      ? body.activityStatus
      : body.activityStatus === null || body.activityStatus === ""
        ? null
        : undefined;
    if (activityStatus === undefined && body.activityStatus !== undefined) {
      return NextResponse.json({ error: "activityStatus ต้องเป็น active, inactive หรือ null" }, { status: 400 });
    }

    const categoryIds = Array.isArray(body.categoryIds)
      ? (body.categoryIds as unknown[]).filter((x): x is string => typeof x === "string" && x.length > 0)
      : undefined;

    const updateFetchedAt = body.updateFetchedAt === true;

    const updateData: { activityStatus?: string | null; lastUpdatedAt?: Date } = {};
    if (activityStatus !== undefined) updateData.activityStatus = activityStatus;
    if (updateFetchedAt) updateData.lastUpdatedAt = new Date();

    if (Object.keys(updateData).length > 0) {
      await prisma.entity.update({
        where: { id },
        data: updateData,
      });
    }
    if (categoryIds !== undefined) {
      await prisma.entityCategory.deleteMany({ where: { entityId: id } });
      if (categoryIds.length > 0) {
        await prisma.entityCategory.createMany({
          data: categoryIds.map((categoryId) => ({ entityId: id, categoryId })),
        });
      }
    }

    const entity = await prisma.entity.findUnique({
      where: { id },
      include: { categories: { include: { category: true } } },
    });
    if (!entity) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const data = {
      id: entity.id,
      kind: entity.kind,
      name: entity.name,
      username: entity.username,
      link: entity.link,
      description: entity.description ?? undefined,
      memberCount: entity.memberCount,
      lastUpdatedAt: entity.lastUpdatedAt.toISOString(),
      lastPostAt: entity.lastPostAt?.toISOString() ?? undefined,
      isPublic: entity.isPublic,
      createdAt: entity.createdAt.toISOString(),
      activityStatus: entity.activityStatus ?? undefined,
      categories: entity.categories.map((ec) => ({
        id: ec.category.id,
        name: ec.category.name,
        slug: ec.category.slug,
      })),
    };
    return NextResponse.json({ data });
  } catch (error) {
    console.error("entity patch error", error);
    return NextResponse.json({ error: "Failed to update" }, { status: 500 });
  }
}
