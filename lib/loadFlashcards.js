import { access, readdir, readFile } from "node:fs/promises";
import path from "node:path";

const CARDS_DIR = path.join(process.cwd(), "output", "todotest-tip-3");
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

function sortByTestNumber(a, b) {
  const aNum = Number((a.match(/^(\d+)/) || [])[1] || Number.MAX_SAFE_INTEGER);
  const bNum = Number((b.match(/^(\d+)/) || [])[1] || Number.MAX_SAFE_INTEGER);
  return aNum - bNum;
}

function parseOptions(sectionText) {
  const options = [];
  const optionsMatch = sectionText.match(/### Options\s*([\s\S]*?)### Explanation/i);
  if (!optionsMatch) return options;

  const optionLineRegex = /^- `([a-d])`\s+(.+?)(?:\s+\(([^)]+)\))?$/gim;
  for (const match of optionsMatch[1].matchAll(optionLineRegex)) {
    const key = match[1].toLowerCase();
    const text = match[2].trim();
    const tags = (match[3] || "").toLowerCase();
    options.push({
      key,
      text,
      isCorrectTagged: tags.includes("correct"),
      isSelectedTagged: tags.includes("selected"),
    });
  }

  return options;
}

function parseQuestionImages(sectionText) {
  const imagesLine = (sectionText.match(/^- Question images:\s*(.+)$/im) || [])[1];
  if (!imagesLine) return [];

  return imagesLine
    .split(/\s*,\s*/)
    .map((part) => {
      const match = part.match(/<([^>]+)>/);
      return match ? match[1] : part.trim();
    })
    .filter(Boolean);
}

function parseExplanation(sectionText) {
  const explanationMatch = sectionText.match(/### Explanation\s*([\s\S]*)$/i);
  if (!explanationMatch) return "";
  return explanationMatch[1].trim();
}

function parseTestFile(fileName, fileContent) {
  const testTitle = (fileContent.match(/^#\s+(.+)$/m) || [])[1]?.trim() || fileName;
  const testNumber = Number((fileName.match(/^(\d+)/) || [])[1] || 0);

  const questionRegex = /^##\s+(\d+)\.\s+(.+)$/gm;
  const headings = [...fileContent.matchAll(questionRegex)];
  const cards = [];

  for (let i = 0; i < headings.length; i += 1) {
    const current = headings[i];
    const next = headings[i + 1];
    const questionNumber = Number(current[1]);
    const questionText = current[2].trim();
    const sectionStart = current.index || 0;
    const sectionEnd = next?.index || fileContent.length;
    const sectionText = fileContent.slice(sectionStart, sectionEnd);

    const correctAnswer = (
      sectionText.match(/^- Correct answer:\s+`([a-d])`/im) || []
    )[1]?.toLowerCase() || null;

    cards.push({
      id: `${testNumber}-${questionNumber}`,
      testNumber,
      testTitle,
      questionNumber,
      questionText,
      correctAnswer,
      questionImages: parseQuestionImages(sectionText),
      options: parseOptions(sectionText),
      explanation: parseExplanation(sectionText),
    });
  }

  return cards;
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
  if (jsonCards && jsonCards.length > 0) {
    return jsonCards;
  }

  const allFiles = await readdir(CARDS_DIR);
  const mdFiles = allFiles
    .filter((file) => file.endsWith(".md"))
    .sort(sortByTestNumber);

  const allCards = [];
  for (const file of mdFiles) {
    const filePath = path.join(CARDS_DIR, file);
    const content = await readFile(filePath, "utf8");
    allCards.push(...parseTestFile(file, content));
  }

  return dedupeByQuestionText(allCards);
}
