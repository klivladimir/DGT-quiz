import { promises as fs } from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";

const IMAGE_DIR = path.join(process.cwd(), "public", "images", "cards");

const MIME_BY_EXT = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".avif": "image/avif",
  ".svg": "image/svg+xml",
};

function getMimeType(fileName) {
  const ext = path.extname(fileName).toLowerCase();
  return MIME_BY_EXT[ext] || "application/octet-stream";
}

export async function GET(_, { params }) {
  const id = String(params?.id || "").trim();
  if (!id) {
    return NextResponse.json({ error: "Missing image id" }, { status: 400 });
  }

  try {
    const entries = await fs.readdir(IMAGE_DIR, { withFileTypes: true });
    const exactMatch = entries.find((entry) => {
      if (!entry.isFile()) return false;
      return path.parse(entry.name).name === id;
    });

    if (!exactMatch) {
      return NextResponse.json({ error: "Image not found" }, { status: 404 });
    }

    const filePath = path.join(IMAGE_DIR, exactMatch.name);
    const fileBuffer = await fs.readFile(filePath);
    const mimeType = getMimeType(exactMatch.name);

    return new NextResponse(fileBuffer, {
      status: 200,
      headers: {
        "Content-Type": mimeType,
        "Cache-Control": "no-store",
      },
    });
  } catch {
    return NextResponse.json({ error: "Unable to load image" }, { status: 500 });
  }
}
