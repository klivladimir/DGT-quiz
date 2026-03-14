import { access, readFile } from "node:fs/promises";
import path from "node:path";

const CARDS_JSON_FILE = path.join(process.cwd(), "output", "todotest-tip-3.json");

function normalizeQuestionText(value) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function dedupeByQuestionText(cards) {
  const seen = new Set();
  const unique = [];

  for (const card of cards) {
    const key = normalizeQuestionText(card.questionText);
    if (!key) {
      unique.push(card);
      continue;
    }

    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(card);
  }

  return unique;
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
        cards.push({
          id: `${testNumber}-${questionNumber}`,
          testNumber,
          testTitle,
          questionNumber,
          questionText: question.questionText || "",
          correctAnswer: question.correctAnswer || null,
          questionImages: question.imageUrls || [],
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

    return dedupeByQuestionText(cards);
  } catch {
    return null;
  }
}

export default async function loadFlashcards() {
  const jsonCards = await loadCardsFromJson();
  return jsonCards && jsonCards.length > 0 ? jsonCards : [];
}
