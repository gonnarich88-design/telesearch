/**
 * Round-robin token pool สำหรับ single-entity fetch
 * แจก token ทีละตัวหมุนเวียน เพื่อกระจาย load ระหว่าง bot tokens
 */
import { getTokenPool } from "./telegram";

let index = 0;

/**
 * คืน token ถัดไปจาก pool แบบ round-robin
 * กด 30 ครั้งติดกัน → กระจายไปทุก token เท่าๆ กัน
 */
export function getNextToken(): string | null {
  const pool = getTokenPool();
  if (pool.length === 0) return null;
  const token = pool[index % pool.length];
  index = (index + 1) % pool.length;
  return token;
}
