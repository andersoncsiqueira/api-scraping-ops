import fs from "fs/promises";
import path from "path";

const CACHE_DIR = path.resolve(process.cwd(), "cache");

export async function ensureCacheDir() {
  await fs.mkdir(CACHE_DIR, { recursive: true });
}

export function getCachePath(fileName: string) {
  return path.join(CACHE_DIR, fileName);
}

export async function readJsonCache<T>(fileName: string): Promise<T | null> {
  try {
    await ensureCacheDir();

    const filePath = getCachePath(fileName);
    const raw = await fs.readFile(filePath, "utf-8");

    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export async function writeJsonCache<T>(
  fileName: string,
  data: T
): Promise<void> {
  await ensureCacheDir();

  const filePath = getCachePath(fileName);

  await fs.writeFile(filePath, JSON.stringify(data, null, 2), "utf-8");
}

export function isCacheFresh(updatedAt: string, maxAgeMinutes: number): boolean {
  const updatedTime = new Date(updatedAt).getTime();

  if (Number.isNaN(updatedTime)) {
    return false;
  }

  const now = Date.now();
  const diffMinutes = (now - updatedTime) / 1000 / 60;

  return diffMinutes <= maxAgeMinutes;
}