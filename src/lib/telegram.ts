/**
 * ดึงข้อมูลช่อง/กลุ่ม/บอทจาก Telegram ผ่าน Bot API
 * ต้องตั้งค่า TELEGRAM_BOT_TOKEN ใน .env
 * รองรับหลาย token (TELEGRAM_BOT_TOKEN_2, _3, ...)
 * เพื่อ parallel fetching โดยไม่ติด rate limit ของ token เดียว
 *
 * ใช้ DNS over HTTPS (DoH) เพื่อ resolve hostname ผ่าน HTTPS:443
 * โดยตรงไปที่ IP ของ Google DNS (8.8.8.8) แทน UDP:53 ของ ISP
 * วิธีนี้ทำงานได้แม้ ISP บล็อก Telegram DNS และ UDP port 53
 */
import https from "https";
import { URL } from "url";

const BASE = "https://api.telegram.org/bot";

export const ACTIVITY_INACTIVE_DAYS = 30;

/**
 * ดึง token ทั้งหมดที่ตั้งค่าไว้ใน .env
 * ค้นหา TELEGRAM_BOT_TOKEN, TELEGRAM_BOT_TOKEN_2, TELEGRAM_BOT_TOKEN_3, ...
 * คืนอย่างน้อย 1 token (ถ้าตั้งค่าไว้)
 */
export function getTokenPool(): string[] {
  const vars = [
    "TELEGRAM_BOT_TOKEN",
    "TELEGRAM_BOT_TOKEN_2",
    "TELEGRAM_BOT_TOKEN_3",
    "TELEGRAM_BOT_TOKEN_4",
    "TELEGRAM_BOT_TOKEN_5",
  ];
  return vars
    .map((k) => process.env[k]?.trim())
    .filter((t): t is string => !!t);
}

/** Resolve hostname ผ่าน Google DNS over HTTPS (ไม่ต้องพึ่ง ISP DNS เลย) */
async function resolveViaDoH(hostname: string): Promise<string | null> {
  return new Promise((resolve) => {
    // เชื่อมตรงไปที่ IP 8.8.8.8 (ไม่ต้อง DNS) ผ่าน HTTPS:443
    const req = https.get(
      {
        host: "8.8.8.8",
        path: `/resolve?name=${encodeURIComponent(hostname)}&type=A`,
        headers: { Host: "dns.google" },
        servername: "dns.google",
        timeout: 5_000,
      },
      (res) => {
        let data = "";
        res.on("data", (c: Buffer) => { data += c.toString(); });
        res.on("end", () => {
          try {
            const json = JSON.parse(data) as { Answer?: Array<{ type: number; data: string }> };
            const a = json?.Answer?.find((r) => r.type === 1);
            resolve(a?.data ?? null);
          } catch {
            resolve(null);
          }
        });
      },
    );
    req.on("timeout", () => { req.destroy(); resolve(null); });
    req.on("error", () => resolve(null));
  });
}

/** HTTPS GET โดย resolve IP ผ่าน DoH ก่อน แล้วเชื่อมตรงไปที่ IP */
async function httpsGet(
  urlStr: string,
  timeoutMs = 10_000,
): Promise<{ status: number; body: string }> {
  const parsed = new URL(urlStr);
  const hostname = parsed.hostname;

  // resolve IP ผ่าน DoH (ไม่ต้องพึ่ง ISP DNS)
  const ip = await resolveViaDoH(hostname);
  const host = ip ?? hostname;

  return new Promise((resolve, reject) => {
    const req = https.get(
      {
        host,
        path: parsed.pathname + parsed.search,
        headers: { Host: hostname },
        servername: hostname, // SNI เพื่อให้ TLS ทำงานถูกต้อง
        timeout: timeoutMs,
      },
      (res) => {
        let data = "";
        res.on("data", (chunk: Buffer) => { data += chunk.toString(); });
        res.on("end", () => resolve({ status: res.statusCode ?? 0, body: data }));
      },
    );
    req.on("timeout", () => { req.destroy(); reject(new Error("timeout")); });
    req.on("error", reject);
  });
}

/**
 * ดึงวันที่โพสล่าสุดของช่อง Telegram สาธารณะโดย scrape t.me/s/username
 * คืน null ถ้าไม่พบหรือเกิดข้อผิดพลาดใดๆ
 */
export async function fetchLastPostAt(username: string): Promise<Date | null> {
  try {
    const { status, body: html } = await httpsGet(
      `https://t.me/s/${encodeURIComponent(username)}`,
      5_000,
    );
    if (status < 200 || status >= 300) return null;

    // ดึง datetime ทั้งหมดจาก HTML แล้วหาค่าล่าสุด
    const datetimeRe = /datetime="([^"]+)"/g;
    let latestMs = -Infinity;
    let latestDate: Date | null = null;

    for (const m of html.matchAll(datetimeRe)) {
      const d = new Date(m[1]);
      if (isNaN(d.getTime())) continue;
      if (d.getTime() > latestMs) {
        latestMs = d.getTime();
        latestDate = d;
      }
    }

    if (!latestDate) {
      console.warn(`[fetchLastPostAt] ไม่พบ datetime ใน t.me/s/${username}`);
      return null;
    }
    return latestDate;
  } catch (e) {
    if (e instanceof Error && e.message !== "timeout") {
      console.warn(`[fetchLastPostAt] error fetching t.me/s/${username}:`, e.message);
    }
    return null;
  }
}

export type TelegramChatType = "channel" | "supergroup" | "group" | "private";

export type TelegramChat = {
  id: number;
  type: TelegramChatType;
  title?: string;
  username?: string;
  description?: string;
  invite_link?: string;
};

export type FetchTelegramResult = {
  ok: true;
  kind: "channel" | "group" | "bot";
  name: string;
  username: string | null;
  link: string | null;
  description: string | null;
  memberCount: number;
} | {
  ok: false;
  error: string;
};

/**
 * แยก username จากลิงก์หรือข้อความ เช่น
 * t.me/durov, https://t.me/durov, @durov, durov
 */
export function parseTelegramUsername(input: string): string | null {
  const s = input.trim();
  if (!s) return null;
  try {
    const tMe = s.match(/t\.me\/([a-zA-Z0-9_]+)/i);
    if (tMe) return tMe[1];
    const at = s.match(/^@?([a-zA-Z0-9_]{5,32})$/);
    if (at) return at[1];
  } catch {
    return null;
  }
  return null;
}

function parseJson(body: string): Record<string, unknown> {
  try { return JSON.parse(body) as Record<string, unknown>; } catch { return {}; }
}

/**
 * เรียก Telegram Bot API getChat
 * รับ token โดยตรง (เพื่อรองรับ multi-token pool)
 */
async function getChat(
  chatId: string,
  token: string,
): Promise<{ ok: true; result: TelegramChat } | { ok: false; description: string }> {
  const id = chatId.startsWith("@") ? chatId : `@${chatId}`;
  try {
    const { status, body } = await httpsGet(`${BASE}${token}/getChat?chat_id=${encodeURIComponent(id)}`);
    const json = parseJson(body);
    if (status === 429) {
      const retryAfter = (json?.parameters as { retry_after?: number })?.retry_after ?? 60;
      return { ok: false, description: `RATELIMIT:${retryAfter}` };
    }
    if (status < 200 || status >= 300) return { ok: false, description: String(json?.description ?? "Request failed") };
    if (!json?.ok) return { ok: false, description: String(json?.description ?? "Telegram API error") };
    return { ok: true, result: json.result as TelegramChat };
  } catch (e) {
    if (e instanceof Error && e.message === "timeout") {
      return { ok: false, description: "การเชื่อมต่อ Telegram หมดเวลา (timeout 10s) กรุณาลองใหม่อีกครั้ง" };
    }
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, description: `การเชื่อมต่อ Telegram ล้มเหลว: ${msg}` };
  }
}

/**
 * เรียก Telegram Bot API getChatMemberCount
 * รับ token โดยตรง (เพื่อรองรับ multi-token pool)
 */
async function getChatMemberCount(
  chatId: string,
  token: string,
): Promise<{ ok: true; count: number } | { ok: false; description: string }> {
  const id = chatId.startsWith("@") ? chatId : `@${chatId}`;
  try {
    const { status, body } = await httpsGet(`${BASE}${token}/getChatMemberCount?chat_id=${encodeURIComponent(id)}`);
    const json = parseJson(body);
    if (status === 429) {
      const retryAfter = (json?.parameters as { retry_after?: number })?.retry_after ?? 60;
      return { ok: false, description: `RATELIMIT:${retryAfter}` };
    }
    if (status < 200 || status >= 300) return { ok: false, description: String(json?.description ?? "Request failed") };
    if (!json?.ok) return { ok: false, description: String(json?.description ?? "Telegram API error") };
    return { ok: true, count: json.result as number };
  } catch (e) {
    if (e instanceof Error && e.message === "timeout") {
      return { ok: false, description: "การเชื่อมต่อ Telegram หมดเวลา (timeout 10s)" };
    }
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, description: `การเชื่อมต่อ Telegram ล้มเหลว: ${msg}` };
  }
}

/**
 * ดึงข้อมูลจาก Telegram ตาม username/link
 * @param token — token ที่จะใช้; ถ้าไม่ระบุจะใช้ TELEGRAM_BOT_TOKEN จาก .env
 */
export async function fetchFromTelegram(
  linkOrUsername: string,
  token?: string,
): Promise<FetchTelegramResult> {
  const resolvedToken = token ?? process.env.TELEGRAM_BOT_TOKEN?.trim();
  if (!resolvedToken) return { ok: false, error: "TELEGRAM_BOT_TOKEN is not set" };

  try {
    const username = parseTelegramUsername(linkOrUsername);
    if (!username) {
      return { ok: false, error: "ลิงก์หรือ username ไม่ถูกต้อง (ตัวอย่าง: t.me/durov หรือ @durov)" };
    }

    const chatId = `@${username}`;
    const chatRes = await getChat(chatId, resolvedToken);
    if (!chatRes.ok) {
      const desc = chatRes.description || "ไม่พบช่อง/กลุ่ม/บอทนี้";
      // ส่ง RATELIMIT error ผ่านตรงๆ เพื่อให้ caller จัดการ
      if (desc.startsWith("RATELIMIT:")) return { ok: false, error: desc };
      if (desc.includes("not found") || desc.includes("have no access")) {
        return { ok: false, error: "ไม่พบหรือบอทไม่มีสิทธิ์เข้าถึง (ช่อง/กลุ่มต้องเป็นสาธารณะ หรือบอทต้องอยู่ภายในกลุ่ม)" };
      }
      return { ok: false, error: desc };
    }

    const chat = chatRes.result;
    const title = chat.title || chat.username || username;
    const kind: "channel" | "group" | "bot" =
      chat.type === "channel" ? "channel"
      : chat.type === "supergroup" || chat.type === "group" ? "group"
      : "bot";
    const link = chat.username ? `https://t.me/${chat.username}` : null;
    const usernameVal = chat.username || null;

    let memberCount = 0;
    if (chat.type === "channel" || chat.type === "supergroup" || chat.type === "group") {
      const countRes = await getChatMemberCount(chatId, resolvedToken);
      if (countRes.ok) memberCount = countRes.count;
    }

    return {
      ok: true,
      kind,
      name: title,
      username: usernameVal,
      link,
      description: chat.description || null,
      memberCount,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: `เกิดข้อผิดพลาด: ${msg}` };
  }
}
