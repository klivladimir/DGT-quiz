import { access, readFile, readdir } from "node:fs/promises";
import path from "node:path";

const CARDS_JSON_FILE = path.join(process.cwd(), "output", "todotest-tip-3.json");
const LOCAL_IMAGES_DIR = path.join(process.cwd(), "public", "images", "cards");
const LOCAL_IMAGE_EXTENSIONS = [".webp", ".jpg", ".jpeg", ".png", ".avif", ".gif", ".svg"];

function getExtensionPriority(ext) {
  const idx = LOCAL_IMAGE_EXTENSIONS.indexOf(ext);
  return idx === -1 ? Number.MAX_SAFE_INTEGER : idx;
}

async function loadLocalImageMap() {
  try {
    const entries = await readdir(LOCAL_IMAGES_DIR, { withFileTypes: true });
    const byId = new Map();

    for (const entry of entries) {
      if (!entry.isFile()) continue;
      const parsed = path.parse(entry.name);
      const ext = String(parsed.ext || "").toLowerCase();
      if (!LOCAL_IMAGE_EXTENSIONS.includes(ext)) continue;

      const id = parsed.name;
      if (!id) continue;

      const current = byId.get(id);
      if (!current || getExtensionPriority(ext) < getExtensionPriority(current.ext)) {
        byId.set(id, { fileName: entry.name, ext });
      }
    }

    return byId;
  } catch {
    return new Map();
  }
}

async function loadCardsFromJson() {
  try {
    await access(CARDS_JSON_FILE);
  } catch {
    return null;
  }

  try {
    const raw = await readFile(CARDS_JSON_FILE, "utf8");
    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.tests)) return null;

    const cards = [];
    const localImageMap = await loadLocalImageMap();
    const tests = [...parsed.tests].sort(
      (a, b) => Number(a.testNumber) - Number(b.testNumber)
    );

    for (const test of tests) {
      const testNumber = Number(test.testNumber || 0);
      const testTitle = test.testHeading || `Test ${testNumber}`;
      const questions = Array.isArray(test.questions) ? test.questions : [];

      const orderedQuestions = [...questions].sort(
        (a, b) =>
          Number(a.questionNumber || a.index || 0) -
          Number(b.questionNumber || b.index || 0)
      );

      for (const question of orderedQuestions) {
        const questionNumber = Number(question.questionNumber || question.index || 0);
        const id = `${testNumber}-${questionNumber}`;
        const localImage = localImageMap.get(id);
        const imageUrl =
          typeof question.imageUrl === "string" && question.imageUrl.trim()
            ? question.imageUrl.trim()
            : "";
        cards.push({
          id,
          testNumber,
          testTitle,
          questionNumber,
          questionText: question.questionText || "",
          correctAnswer: question.correctAnswer || null,
          questionImage: localImage ? `/images/cards/${localImage.fileName}` : imageUrl,
          options: (question.options || []).map((option) => ({
            key: option.key,
            text: option.text,
            isCorrectTagged: Boolean(option.isCorrect),
            isSelectedTagged: Boolean(option.isSelected),
          })),
          explanation: question.explanationText || "",
        });
      }
    }

    return cards;
  } catch {
    return null;
  }
}

export default async function loadFlashcards() {
  const jsonCards = await loadCardsFromJson();
  return jsonCards && jsonCards.length > 0 ? jsonCards : [];
}
