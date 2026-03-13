import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

const CARDS_DIR = path.join(process.cwd(), "output", "todotest-tip-3");

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
      options: parseOptions(sectionText),
      explanation: parseExplanation(sectionText),
    });
  }

  return cards;
}

export default async function loadFlashcards() {
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

  return allCards;
}
