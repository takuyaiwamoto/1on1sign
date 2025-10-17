import { NextResponse } from "next/server";
import { promises as fs } from "node:fs";
import path from "node:path";

const ALLOWED_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".webp", ".gif"]);

function detectMime(ext: string) {
  switch (ext.toLowerCase()) {
    case ".png":
      return "image/png";
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".webp":
      return "image/webp";
    case ".gif":
      return "image/gif";
    default:
      return "application/octet-stream";
  }
}

export async function GET() {
  const dir = path.join(process.cwd(), "pic");
  try {
    const dirEntries = await fs.readdir(dir, { withFileTypes: true });
    const backgrounds = [];
    for (const entry of dirEntries) {
      if (!entry.isFile()) continue;
      const ext = path.extname(entry.name).toLowerCase();
      if (!ALLOWED_EXTENSIONS.has(ext)) continue;
      const filePath = path.join(dir, entry.name);
      const file = await fs.readFile(filePath);
      const mime = detectMime(ext);
      const dataUrl = `data:${mime};base64,${file.toString("base64")}`;
      backgrounds.push({
        name: entry.name,
        dataUrl
      });
    }
    return NextResponse.json({ backgrounds });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return NextResponse.json({ backgrounds: [] });
    }
    console.error("[backgrounds] failed to load images", error);
    return NextResponse.json({ backgrounds: [] }, { status: 500 });
  }
}
