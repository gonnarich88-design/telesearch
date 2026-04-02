import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const FEATURED_SLUGS = ["adult-content-18", "gambling-betting"];

export async function GET() {
  try {
    const categories = await prisma.category.findMany({
      orderBy: { slug: "asc" },
      include: {
        _count: { select: { entities: true } },
      },
    });
    const mapped = categories.map((c) => ({
      id: c.id,
      name: c.name,
      slug: c.slug,
      entityCount: c._count.entities,
    }));
    const featured = FEATURED_SLUGS.map((slug) => mapped.find((c) => c.slug === slug)).filter(
      (c): c is (typeof mapped)[0] => c != null
    );
    const rest = mapped.filter((c) => !FEATURED_SLUGS.includes(c.slug));
    const data = [...featured, ...rest];
    return NextResponse.json({ data });
  } catch (error) {
    console.error("categories list error", error);
    return NextResponse.json({ error: "Failed to list categories" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, slug } = body as { name: string; slug: string };
    if (!name?.trim()) return NextResponse.json({ error: "Name is required" }, { status: 400 });
    const slugVal = (slug ?? name).trim().toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
    if (!slugVal) return NextResponse.json({ error: "Invalid slug" }, { status: 400 });

    const category = await prisma.category.create({
      data: { name: name.trim(), slug: slugVal },
    });
    return NextResponse.json({ data: category });
  } catch (error) {
    console.error("category create error", error);
    return NextResponse.json({ error: "Failed to create category" }, { status: 500 });
  }
}
