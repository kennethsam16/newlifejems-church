import { scryptSync, timingSafeEqual } from "node:crypto";

const salt = Buffer.from("adb81e4b32091a0bb11153a3af97e5d8", "hex");
const expected = Buffer.from("499db8c60a5e1c89b8b6d110955d80789a204f0b723e2db69ca28dd4e797654fce51b91b2d4a4d1221325ff833b0ec6c887ba604957fa18185db3b7d1b3629d6", "hex");

export function isAdminPassword(value) {
  if (typeof value !== "string" || value.length > 200) return false;
  const actual = scryptSync(value, salt, 64);
  return timingSafeEqual(actual, expected);
}
