import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const KINDS = ["channel", "group", "bot"] as const;

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const entity = await prisma.entity.findUnique({
      where: { id },
      include: { categories: { include: { category: true } } },
    });
    if (!entity) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({
      data: {
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
        categories: entity.categories.map((ec) => ({
          id: ec.category.id,
          name: ec.category.name,
          slug: ec.category.slug,
        })),
      },
    });
  } catch (error) {
    console.error("entity get error", error);
    return NextResponse.json({ error: "Failed to get entity" }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const body = await request.json();
    const {
      kind,
      name,
      username,
      link,
      description,
      memberCount,
      isPublic,
      categoryIds,
    } = body;

    const updateData: Record<string, unknown> = {};
    if (kind && KINDS.includes(kind)) updateData.kind = kind;
    if (name !== undefined) updateData.name = String(name).trim();
    if (username !== undefined) updateData.username = username ? String(username).trim() : null;
    if (link !== undefined) updateData.link = link ? String(link).trim() : null;
    if (description !== undefined) updateData.description = description ? String(description).trim() : null;
    if (memberCount !== undefined) updateData.memberCount = Number(memberCount) || 0;
    if (isPublic !== undefined) updateData.isPublic = Boolean(isPublic);
    updateData.lastUpdatedAt = new Date();

    const entity = await prisma.entity.update({
      where: { id },
      data: updateData,
      include: { categories: { include: { category: true } } },
    });

    if (Array.isArray(categoryIds)) {
      await prisma.entityCategory.deleteMany({ where: { entityId: id } });
      if (categoryIds.length > 0) {
        await prisma.entityCategory.createMany({
          data: categoryIds.map((categoryId: string) => ({ entityId: id, categoryId })),
        });
      }
      const updated = await prisma.entity.findUnique({
        where: { id },
        include: { categories: { include: { category: true } } },
      });
      if (updated) {
        return NextResponse.json({
          data: {
            id: updated.id,
            kind: updated.kind,
            name: updated.name,
            username: updated.username,
            link: updated.link,
            description: updated.description ?? undefined,
            memberCount: updated.memberCount,
            lastUpdatedAt: updated.lastUpdatedAt.toISOString(),
            lastPostAt: updated.lastPostAt?.toISOString() ?? undefined,
            isPublic: updated.isPublic,
            categories: updated.categories.map((ec) => ({
              id: ec.category.id,
              name: ec.category.name,
              slug: ec.category.slug,
            })),
          },
        });
      }
    }

    return NextResponse.json({
      data: {
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
        categories: entity.categories.map((ec) => ({
          id: ec.category.id,
          name: ec.category.name,
          slug: ec.category.slug,
        })),
      },
    });
  } catch (error) {
    console.error("entity update error", error);
    return NextResponse.json({ error: "Failed to update entity" }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    await prisma.entity.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("entity delete error", error);
    return NextResponse.json({ error: "Failed to delete entity" }, { status: 500 });
  }
}
