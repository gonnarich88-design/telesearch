import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

type ScrapedItem = {
  username: string;
  sourceKind: "channel" | "group" | "bot" | "unknown";
};

function normalizeUsername(u: string): string {
  return u.trim().replace(/^@/, "").toLowerCase();
}

function isAllowedNicegramUrl(raw: string): URL | null {
  try {
    const u = new URL(raw);
    if (u.protocol !== "https:") return null;
    if (u.hostname !== "nicegram.app") return null;
    if (!u.pathname.startsWith("/hub/")) return null;
    return u;
  } catch {
    return null;
  }
}

function extractItemsFromHtml(html: string): ScrapedItem[] {
  const items: ScrapedItem[] = [];
  const patterns = [
    /href="\/hub\/(channel|group|bot)\/([A-Za-z0-9_]{4,})"/g,
    // Proxy/markdown format (e.g. https://nicegram.app/hub/channel/TH789bet)
    /https?:\/\/nicegram\.app\/hub\/(channel|group|bot)\/([A-Za-z0-9_]{4,})/g,
    // Fallback: any /hub/channel/USERNAME occurrences
    /\/hub\/(channel|group|bot)\/([A-Za-z0-9_]{4,})/g,
  ] as const;

  for (const re of patterns) {
    let m: RegExpExecArray | null;
    while ((m = re.exec(html))) {
      const sourceKind = (m[1] as ScrapedItem["sourceKind"]) ?? "unknown";
      const username = normalizeUsername(m[2] ?? "");
      if (!username) continue;
      items.push({ username, sourceKind });
    }
  }
  return items;
}

function extractNicegramHubLinks(html: string, baseUrl: URL): URL[] {
  // Collect any hub links (including pagination with cursor)
  const out: URL[] = [];
  const patterns = [
    /href="(\/hub\/[^"]+)"/g,
    /\((https?:\/\/nicegram\.app\/hub\/[^)]+)\)/g,
    /(https?:\/\/nicegram\.app\/hub\/[^\s"'<>]+)\b/g,
  ] as const;

  for (const re of patterns) {
    let m: RegExpExecArray | null;
    while ((m = re.exec(html))) {
      const href = m[1];
      if (!href) continue;
      try {
        const u = new URL(href, baseUrl);
        if (u.hostname !== "nicegram.app") continue;
        if (!u.pathname.startsWith("/hub/")) continue;
        out.push(u);
      } catch {
        // ignore
      }
    }
  }
  return out;
}

async function fetchHtml(url: URL): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 25_000);
  const primaryRes = await fetch(url.toString(), {
    headers: {
      // Avoid being blocked by basic bot filters
      "user-agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
      accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "accept-language": "th-TH,th;q=0.9,en;q=0.7",
      referer: "https://nicegram.app/hub",
      "sec-fetch-site": "same-origin",
      "sec-fetch-mode": "navigate",
      "sec-fetch-dest": "document",
      "upgrade-insecure-requests": "1",
    },
    // Next.js route handler: avoid caching old pages
    cache: "no-store",
    signal: controller.signal,
  });
  clearTimeout(timeout);

  if (primaryRes.ok) return await primaryRes.text();

  // Fallback: Nicegram occasionally returns 403 to server-side fetch.
  // Use a read-only proxy that returns the page content as text.
  // This keeps the client CORS-safe and still lets us parse usernames.
  if (primaryRes.status === 403) {
    const proxyUrl = `https://r.jina.ai/${url.toString()}`;
    const proxyController = new AbortController();
    const proxyTimeout = setTimeout(() => proxyController.abort(), 25_000);
    const proxyRes = await fetch(proxyUrl, { cache: "no-store", signal: proxyController.signal });
    clearTimeout(proxyTimeout);
    if (proxyRes.ok) return await proxyRes.text();
    throw new Error(`Nicegram fetch failed: 403 (proxy ${proxyRes.status})`);
  }

  throw new Error(`Nicegram fetch failed: ${primaryRes.status}`);
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const rawUrl = typeof body?.url === "string" ? body.url.trim() : "";
    const startUrl = isAllowedNicegramUrl(rawUrl);
    if (!startUrl) {
      return NextResponse.json(
        { error: "กรุณาส่ง URL ของ nicegram.app/hub เท่านั้น" },
        { status: 400 }
      );
    }

    const requestedMaxPages = Number(body?.maxPages);
    const maxPages =
      Number.isFinite(requestedMaxPages) && requestedMaxPages > 0
        ? Math.min(Math.floor(requestedMaxPages), 200)
        : 6;
    const queue: URL[] = [startUrl];
    const visited = new Set<string>();
    const usernames = new Map<string, ScrapedItem["sourceKind"]>();
    let pagesVisited = 0;
    const startPath = startUrl.pathname;

    while (queue.length > 0 && pagesVisited < maxPages) {
      const url = queue.shift()!;
      const key = url.toString();
      if (visited.has(key)) continue;
      visited.add(key);

      const html = await fetchHtml(url);
      pagesVisited++;

      for (const item of extractItemsFromHtml(html)) {
        if (!usernames.has(item.username)) {
          usernames.set(item.username, item.sourceKind);
        }
      }

      // Discover additional pages (pagination cursors). We only enqueue category pages
      // to avoid crawling the whole hub.
      const links = extractNicegramHubLinks(html, url);
      for (const l of links) {
        if (l.pathname !== startPath) continue;
        if (l.searchParams.get("cursor")) {
          queue.push(l);
        }
      }
    }

    const allItems: ScrapedItem[] = [...usernames.entries()].map(([username, sourceKind]) => ({
      username,
      sourceKind,
    }));

    const lowerList = allItems.map((x) => x.username);
    const existing = lowerList.length
      ? await prisma.entity.findMany({
          where: { username: { in: lowerList } },
          select: { username: true },
        })
      : [];
    const existingSet = new Set(existing.map((e) => (e.username ?? "").toLowerCase()).filter(Boolean));

    const newItems = allItems.filter((x) => !existingSet.has(x.username));

    return NextResponse.json({
      source: startUrl.toString(),
      pagesVisited,
      maxPages,
      totalFound: allItems.length,
      existingCount: existingSet.size,
      newCount: newItems.length,
      items: allItems,
      newItems,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("nicegram scrape error", error);
    return NextResponse.json(
      { error: "Scrape ไม่สำเร็จ กรุณาลองใหม่", detail: message },
      { status: 500 }
    );
  }
}

