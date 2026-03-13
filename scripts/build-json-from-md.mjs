#!/usr/bin/env node

import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const WORKDIR = process.cwd();
const TIP = Number(process.argv[2] || "3");
const MD_DIR = path.join(WORKDIR, "output", `todotest-tip-${TIP}`);
const OUT_FILE = path.join(WORKDIR, "output", `todotest-tip-${TIP}.json`);

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
      isCorrect: tags.includes("correct"),
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
  if (!explanationMatch) return null;
  const value = explanationMatch[1].trim();
  return value || null;
}

function parseTestFile(fileName, fileContent) {
  const testHeading = (fileContent.match(/^#\s+(.+)$/m) || [])[1]?.trim() || fileName;
  const testNumber = Number((fileName.match(/^(\d+)/) || [])[1] || 0);

  const questionRegex = /^##\s+(\d+)\.\s+(.+)$/gm;
  const headings = [...fileContent.matchAll(questionRegex)];
  const questions = [];

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

    questions.push({
      index: questionNumber,
      questionNumber,
      questionText,
      imageUrls: parseQuestionImages(sectionText),
      correctAnswer,
      options: parseOptions(sectionText),
      explanationText: parseExplanation(sectionText),
    });
  }

  return {
    testNumber,
    testHeading,
    totalQuestions: questions.length,
    questions,
  };
}

async function main() {
  const allFiles = await readdir(MD_DIR);
  const mdFiles = allFiles.filter((file) => file.endsWith(".md")).sort(sortByTestNumber);

  const tests = [];
  for (const file of mdFiles) {
    const fullPath = path.join(MD_DIR, file);
    const content = await readFile(fullPath, "utf8");
    tests.push(parseTestFile(file, content));
  }

  const now = new Date().toISOString();
  const payload = {
    tip: TIP,
    createdAt: now,
    updatedAt: now,
    tests,
  };

  await mkdir(path.dirname(OUT_FILE), { recursive: true });
  await writeFile(OUT_FILE, `${JSON.stringify(payload, null, 2)}\n`, "utf8");

  console.log(
    JSON.stringify(
      {
        outFile: OUT_FILE,
        tests: payload.tests.length,
        totalQuestions: payload.tests.reduce((sum, test) => sum + test.totalQuestions, 0),
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
