import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

/** หมวดหมู่ครบตาม Nicegram Browse by Category */
const CATEGORIES: { name: string; slug: string }[] = [
  { name: "บล็อก & บทความ", slug: "blogs" },
  { name: "ข่าว", slug: "news" },
  { name: "เทคโนโลยี & นวัตกรรม", slug: "technology-innovation" },
  { name: "เศรษฐกิจ & การเงิน", slug: "economics-finance" },
  { name: "ท่องเที่ยว & ผจญภัย", slug: "travel-adventure" },
  { name: "การตลาด & ขาย", slug: "marketing-sales" },
  { name: "ศิลปะ & ออกแบบ", slug: "art-design" },
  { name: "การศึกษา & วิจัย", slug: "education-research" },
  { name: "ไลฟ์สไตล์ & สุขภาพ", slug: "lifestyle-wellness" },
  { name: "วรรณกรรม & ภาษา", slug: "literature-languages" },
  { name: "ศาสนา & จิตวิญญาณ", slug: "religion-spirituality" },
  { name: "กีฬา & ฟิตเนส", slug: "sports-fitness" },
  { name: "เกม & แอป", slug: "gaming-apps" },
  { name: "สัตว์ & ธรรมชาติ", slug: "animals-nature" },
  { name: "งานอดิเรก & ของสะสม", slug: "hobbies-collectibles" },
  { name: "อสังหาริมทรัพย์", slug: "real-estate-property" },
  { name: "เกษตร & ฟาร์ม", slug: "agriculture-farming" },
  { name: "Web3 & บล็อกเชน", slug: "web3-blockchain" },
  { name: "การพนัน & เดิมพัน", slug: "gambling-betting" },
  { name: "แชท & ฟอรัมออนไลน์", slug: "online-chats-forums" },
  { name: "ทหาร & ป้องกันประเทศ", slug: "military-defense" },
  { name: "คริปโตเคอร์เรนซี", slug: "cryptocurrency" },
  { name: "ภาพยนตร์", slug: "movies" },
  { name: "ชุมชน", slug: "communities" },
  { name: "ธุรกิจ & สตาร์ทอัพ", slug: "business-startups" },
  { name: "ถ่ายภาพ", slug: "photography" },
  { name: "เคล็ดลับ Telegram", slug: "telegram-tips" },
  { name: "ขนส่ง & รถยนต์", slug: "transport-auto" },
  { name: "แฟชั่น & ไลฟ์สไตล์", slug: "fashion-lifestyle" },
  { name: "จิตวิทยา", slug: "psychology" },
  { name: "ความจริงเสมือน (VR)", slug: "virtual-reality" },
  { name: "Productivity / ผลผลิต", slug: "productivity" },
  { name: "การเมือง", slug: "politics" },
  { name: "เนื้อหาผู้ใหญ่ (+18)", slug: "adult-content-18" },
  { name: "เพลง", slug: "music" },
  { name: "อื่น ๆ", slug: "other" },
];

const SLUGS = new Set(CATEGORIES.map((c) => c.slug));

async function main() {
  for (const { name, slug } of CATEGORIES) {
    await prisma.category.upsert({
      where: { slug },
      update: { name },
      create: { name, slug },
    });
  }
  const toRemove = await prisma.category.findMany({
    where: { slug: { notIn: [...SLUGS] } },
    select: { id: true },
  });
  if (toRemove.length > 0) {
    await prisma.entityCategory.deleteMany({
      where: { categoryId: { in: toRemove.map((c) => c.id) } },
    });
    await prisma.category.deleteMany({
      where: { id: { in: toRemove.map((c) => c.id) } },
    });
  }

  const tech = await prisma.category.findUnique({ where: { slug: "technology-innovation" } });
  const news = await prisma.category.findUnique({ where: { slug: "news" } });
  const entertainment = await prisma.category.findUnique({ where: { slug: "communities" } });
  if (!tech || !news || !entertainment) throw new Error("Categories not found");

  const ch1 = await prisma.entity.upsert({
    where: { id: "seed-channel-1" },
    update: {},
    create: {
      id: "seed-channel-1",
      kind: "channel",
      name: "Tech News TH",
      username: "technews_th",
      link: "https://t.me/technews_th",
      memberCount: 12500,
      isPublic: true,
    },
  });
  await prisma.entityCategory.upsert({
    where: {
      entityId_categoryId: { entityId: ch1.id, categoryId: tech.id },
    },
    update: {},
    create: { entityId: ch1.id, categoryId: tech.id },
  });

  const gr1 = await prisma.entity.create({
    data: {
      kind: "group",
      name: "Developer Thailand",
      username: "dev_th",
      link: "https://t.me/dev_th",
      memberCount: 3200,
      isPublic: true,
    },
  });
  await prisma.entityCategory.create({
    data: { entityId: gr1.id, categoryId: tech.id },
  });

  const bot1 = await prisma.entity.create({
    data: {
      kind: "bot",
      name: "Search Bot",
      username: "telesearch_bot",
      link: "https://t.me/telesearch_bot",
      description: "ค้นหา channel และ group บน Telegram",
      memberCount: 0,
      isPublic: true,
    },
  });
  await prisma.entityCategory.create({
    data: { entityId: bot1.id, categoryId: tech.id },
  });

  console.log("Seed done. Categories:", CATEGORIES.length);
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e);
    prisma.$disconnect();
    process.exit(1);
  });
