import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const KINDS = ["channel", "group", "bot"] as const;

export async function GET() {
  try {
    const entities = await prisma.entity.findMany({
      include: { categories: { include: { category: true } } },
      orderBy: [{ kind: "asc" }, { memberCount: "desc" }],
    });
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
      categories: e.categories.map((ec) => ({ id: ec.category.id, name: ec.category.name, slug: ec.category.slug })),
    }));
    return NextResponse.json({ data });
  } catch (error) {
    console.error("entities list error", error);
    return NextResponse.json({ error: "Failed to list entities" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      kind,
      name,
      username,
      link,
      description,
      memberCount = 0,
      isPublic = true,
      categoryIds = [],
    } = body as {
      kind: string;
      name: string;
      username?: string;
      link?: string;
      description?: string;
      memberCount?: number;
      isPublic?: boolean;
      categoryIds?: string[];
    };

    if (!kind || !KINDS.includes(kind as (typeof KINDS)[number])) {
      return NextResponse.json({ error: "Invalid kind" }, { status: 400 });
    }
    if (!name?.trim()) {
      return NextResponse.json({ error: "Name is required" }, { status: 400 });
    }

    const entity = await prisma.entity.create({
      data: {
        kind: kind as (typeof KINDS)[number],
        name: name.trim(),
        username: username?.trim() || null,
        link: link?.trim() || null,
        description: description?.trim() || null,
        memberCount: Number(memberCount) || 0,
        isPublic: Boolean(isPublic),
        categories:
          categoryIds?.length > 0
            ? { create: categoryIds.map((categoryId: string) => ({ categoryId })) }
            : undefined,
      },
      include: { categories: { include: { category: true } } },
    });

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
    console.error("entity create error", error);
    return NextResponse.json({ error: "Failed to create entity" }, { status: 500 });
  }
}
