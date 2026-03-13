import { NextResponse } from "next/server";

const MAX_CHUNK_LENGTH = 700;

function splitText(text) {
  const normalized = String(text || "").trim();
  if (!normalized) return [""];
  if (normalized.length <= MAX_CHUNK_LENGTH) return [normalized];

  const parts = normalized.split(/(?<=[.!?])\s+/);
  const chunks = [];
  let current = "";

  for (const part of parts) {
    if (!part) continue;
    const candidate = current ? `${current} ${part}` : part;
    if (candidate.length > MAX_CHUNK_LENGTH) {
      if (current) chunks.push(current);
      current = part;
    } else {
      current = candidate;
    }
  }

  if (current) chunks.push(current);
  return chunks.length ? chunks : [normalized];
}

function extractTranslatedText(payload) {
  if (!Array.isArray(payload?.[0])) return "";
  return payload[0]
    .map((segment) => (Array.isArray(segment) ? segment[0] : ""))
    .join("")
    .trim();
}

async function translateChunk(chunk, target) {
  if (!chunk) return "";

  const params = new URLSearchParams({
    client: "gtx",
    sl: "es",
    tl: target,
    dt: "t",
    q: chunk,
  });

  const response = await fetch(
    `https://translate.googleapis.com/translate_a/single?${params.toString()}`,
    { cache: "no-store" }
  );

  if (!response.ok) {
    throw new Error(`Translate request failed: ${response.status}`);
  }

  const data = await response.json();
  return extractTranslatedText(data);
}

async function translateText(text, target) {
  const chunks = splitText(text);
  const translated = [];
  for (const chunk of chunks) {
    translated.push(await translateChunk(chunk, target));
  }
  return translated.join(" ").trim();
}

export async function POST(request) {
  try {
    const body = await request.json();
    const target = body?.target || "ru";
    const texts = Array.isArray(body?.texts) ? body.texts : [];

    if (target !== "ru" && target !== "es") {
      return NextResponse.json({ error: "Unsupported target language" }, { status: 400 });
    }

    if (target === "es") {
      return NextResponse.json({ texts });
    }

    const translatedTexts = await Promise.all(
      texts.map((text) =>
        translateText(text, target).catch(() => String(text || ""))
      )
    );

    return NextResponse.json({ texts: translatedTexts });
  } catch {
    return NextResponse.json({ error: "Invalid translation request" }, { status: 400 });
  }
}
