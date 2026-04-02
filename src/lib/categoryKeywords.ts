/**
 * คำหลักสำหรับคัดกรองหมวดหมู่อัตโนมัติจากชื่อ/คำอธิบายช่องหรือกลุ่ม
 * slug → คำที่ถ้ามีในชื่อหรือคำอธิบาย จะจัดเข้าหมวดนั้น
 * ครบตามหมวดหมู่ Nicegram
 */
export const CATEGORY_KEYWORDS: Record<string, string[]> = {
  "blogs": ["blog", "บล็อก", "บทความ", "เขียน"],
  "news": ["news", "ข่าว", "สำนักข่าว", "อัปเดตข่าว"],
  "technology-innovation": ["tech", "เทค", "technology", "programming", "dev", "developer", "software", "code", "it", "ไอที", "นวัตกรรม"],
  "economics-finance": ["economy", "เศรษฐกิจ", "การเงิน", "finance", "ลงทุน", "หุ้น", "ตลาด"],
  "travel-adventure": ["travel", "ท่องเที่ยว", "เที่ยว", "adventure", "ทริป", "backpack"],
  "marketing-sales": ["marketing", "การตลาด", "ขาย", "sale", "โฆษณา", "promote"],
  "art-design": ["art", "ศิลปะ", "design", "ออกแบบ", "กราฟิก", "creative"],
  "education-research": ["education", "การศึกษา", "เรียน", "course", "research", "วิจัย", "ความรู้"],
  "lifestyle-wellness": ["lifestyle", "ไลฟ์สไตล์", "wellness", "สุขภาพ", "ชีวิต", "living"],
  "literature-languages": ["book", "หนังสือ", "วรรณกรรม", "ภาษา", "language", "เรียนภาษา"],
  "religion-spirituality": ["religion", "ศาสนา", "ธรรม", "จิตวิญญาณ", "meditation"],
  "sports-fitness": ["sport", "กีฬา", "ฟิตเนส", "fitness", "ออกกำลัง", "ฟุตบอล", "บอล"],
  "gaming-apps": ["game", "เกม", "gaming", "app", "แอป", "esport", "อีสปอร์ต", "เล่นเกม"],
  "animals-nature": ["animal", "สัตว์", "nature", "ธรรมชาติ", "pet", "สัตว์เลี้ยง", "หมา", "แมว", "dog", "cat"],
  "hobbies-collectibles": ["hobby", "งานอดิเรก", "collectible", "ของสะสม", "craft", "งานฝีมือ", "diy"],
  "real-estate-property": ["real estate", "อสังหา", "ที่ดิน", "บ้าน", "คอนโด", "property"],
  "agriculture-farming": ["agriculture", "เกษตร", "farming", "ฟาร์ม", "ปลูก", "ไร่", "สวน"],
  "web3-blockchain": ["web3", "blockchain", "บล็อกเชน", "defi", "nft", "metaverse"],
  "gambling-betting": [
    "gambling", "การพนัน", "betting", "เดิมพัน", "คาสิโน", "casino", "พนัน",
    "สล็อต", "slot", "บาคาร่า", "baccarat", "ยิงปลา", "หวย",
    "ไฮโล", "ป๊อกเด้ง", "เสือมังกร", "รูเล็ต", "jackpot", "แจ็คพอต",
    "เครดิตฟรี", "แจกเครดิต", "ฝากถอน", "เว็บตรง", "สมัครรับฟรี",
    "โบนัสฟรี", "เว็บพนัน", "แทงบอล", "บอลออนไลน์",
  ],
  "online-chats-forums": ["chat", "แชท", "forum", "ฟอรัม", "discussion", "สนทนา", "community"],
  "military-defense": ["military", "ทหาร", "defense", "ป้องกันประเทศ", "army", "กองทัพ"],
  "cryptocurrency": ["crypto", "คริปโต", "bitcoin", "ethereum", "เหรียญ", "เทรด", "cryptocurrency"],
  "movies": ["movie", "film", "หนัง", "ภาพยนตร์", "ซีรีส์", "series", "ทีวี", "tv"],
  "communities": ["community", "ชุมชน", "ท้องถิ่น", "local", "กลุ่ม", "community"],
  "business-startups": ["business", "ธุรกิจ", "startup", "สตาร์ทอัพ", "entrepreneur"],
  "photography": ["photo", "ถ่ายภาพ", "photography", "กล้อง", "camera"],
  "telegram-tips": ["telegram", "เทเลแกรม", "tips", "เคล็ดลับ", "bot", "บอท"],
  "transport-auto": ["car", "รถ", "transport", "ขนส่ง", "automotive", "ยานยนต์", "มอเตอร์ไซค์", "auto"],
  "fashion-lifestyle": ["fashion", "แฟชั่น", "beauty", "ความงาม", "เสื้อผ้า", "lifestyle", "ไลฟ์สไตล์"],
  "psychology": ["psychology", "จิตวิทยา", "จิตใจ", "mental", "mind"],
  "virtual-reality": ["vr", "virtual reality", "ความจริงเสมือน", "metaverse", "ar ", "augmented"],
  "productivity": ["productivity", "ผลผลิต", "productive", "งาน", "ทำงาน", "efficiency"],
  "politics": ["politics", "การเมือง", "รัฐบาล", "political", "พรรค"],
  "adult-content-18": ["adult", "+18", "18+", "ผู้ใหญ่", "nsfw"],
  "music": ["music", "เพลง", "ดนตรี", "audio", "podcast", "musician"],
  "other": [],
};

/**
 * คืน category slugs ที่ตรงกับข้อความ (ชื่อ + คำอธิบาย)
 */
export function detectCategoriesFromText(name: string, description: string | null): string[] {
  const text = `${name} ${description || ""}`.toLowerCase();
  const matched: string[] = [];
  for (const [slug, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    if (slug === "other") continue;
    const found = keywords.some((kw) => text.includes(kw.toLowerCase()));
    if (found) matched.push(slug);
  }
  return matched;
}
