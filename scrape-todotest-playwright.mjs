#!/usr/bin/env node

import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { chromium } from 'playwright';

const WORKDIR = process.cwd();
const URLS_FILE = path.join(WORKDIR, 'urls.txt');
const SESSION_STATE_FILE = path.join(WORKDIR, 'session', 'todotest-storage.json');

function normalizeWhitespace(value) {
  return value.replace(/\s+/g, ' ').trim();
}

function stripQuestionNumber(value) {
  return normalizeWhitespace(value).replace(/^\d+\.\s*/, '');
}

function decodeHtmlEntities(value) {
  return value
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>');
}

function htmlToText(html) {
  return normalizeWhitespace(
    decodeHtmlEntities(
      html
        .replace(/<script[\s\S]*?<\/script>/gi, ' ')
        .replace(/<style[\s\S]*?<\/style>/gi, ' ')
        .replace(/<[^>]+>/g, ' ')
    )
  );
}

async function resolveTargetUrl() {
  if (process.argv[2]) {
    return process.argv[2];
  }

  const raw = await readFile(URLS_FILE, 'utf8');
  const firstUrl = raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find(Boolean);

  if (!firstUrl) {
    throw new Error(`No URLs found in ${URLS_FILE}`);
  }

  return firstUrl;
}

function buildOutputDir(url) {
  const parsedUrl = new URL(url);
  const tip = parsedUrl.searchParams.get('tip') ?? 'unknown';
  return path.join(WORKDIR, 'output', `todotest-tip-${tip}`);
}

function toSafeFilePart(value) {
  return value
    .normalize('NFKD')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .toLowerCase();
}

function renderTestMarkdown(result) {
  const lines = [
    `# ${result.testHeading}`,
    '',
    `- Source URL: <${result.sourceUrl}>`,
    `- Scraped at: ${result.scrapedAt}`,
    `- Total questions: ${result.meta.totalQuestions}`,
  ];

  for (const question of result.questions) {
    lines.push('', `## ${question.index}. ${question.questionText}`, '');
    lines.push(`- Correct answer: \`${question.correctAnswer ?? '-'}\``);
    lines.push(`- Selected answer: \`${question.selectedAnswer ?? '-'}\``);

    if (question.imageUrls.length > 0) {
      lines.push(`- Question images: ${question.imageUrls.map((url) => `<${url}>`).join(', ')}`);
    }

    lines.push('', '### Options', '');
    for (const option of question.options) {
      const flags = [];
      if (option.isCorrect) flags.push('correct');
      if (option.isSelected) flags.push('selected');
      const suffix = flags.length ? ` (${flags.join(', ')})` : '';
      lines.push(`- \`${option.key}\` ${option.text}${suffix}`);
    }

    lines.push('', '### Explanation', '');
    lines.push(question.explanationText || '_No explanation found._');

    if (question.explanationImageUrls.length > 0) {
      lines.push('', '### Explanation Images', '');
      for (const url of question.explanationImageUrls) {
        lines.push(`- <${url}>`);
      }
    }

    if (question.explanationVideoUrls.length > 0) {
      lines.push('', '### Explanation Videos', '');
      for (const url of question.explanationVideoUrls) {
        lines.push(`- <${url}>`);
      }
    }
  }

  return `${lines.join('\n')}\n`;
}

async function main() {
  const targetUrl = await resolveTargetUrl();
  const outputDir = process.env.OUTPUT_PATH || buildOutputDir(targetUrl);
  const sessionStatePath = process.env.STORAGE_STATE || SESSION_STATE_FILE;

  const browser = await chromium.launch({
    headless: process.env.HEADLESS !== 'false',
  });

  try {
    let storageState;
    try {
      await access(sessionStatePath);
      storageState = sessionStatePath;
    } catch {
      storageState = undefined;
    }

    const context = await browser.newContext(
      storageState ? { storageState } : {}
    );
    await context.route('**/*', async (route) => {
      const request = route.request();
      const resourceType = request.resourceType();
      const url = request.url();
      if (
        resourceType === 'image' ||
        resourceType === 'media' ||
        resourceType === 'font' ||
        url.includes('googlesyndication.com') ||
        url.includes('doubleclick.net') ||
        url.includes('googleads.') ||
        url.includes('smartadserver.com')
      ) {
        await route.abort();
        return;
      }
      await route.continue();
    });
    const page = await context.newPage();
    await page.goto(targetUrl, {
      waitUntil: 'domcontentloaded',
      timeout: 60_000,
    });

    await page.locator('button:has-text("ACEPTO")').click({ timeout: 5_000 }).catch(() => {});

    await page.waitForFunction(() => {
      const list = [...document.querySelectorAll('ul')].find(
        (ul) => ul.querySelectorAll(':scope > li').length === 30
      );
      return Boolean(window.jQuery && list);
    }, null, { timeout: 90_000 });

    const questions = await page.evaluate(() => {
      const clean = (value) => value.replace(/\s+/g, ' ').trim();
      const stripNumber = (value) => clean(value).replace(/^\d+\.\s*/, '');
      const list = [...document.querySelectorAll('ul')].find(
        (ul) => ul.querySelectorAll(':scope > li').length === 30
      );

      if (!list) {
        throw new Error('Question list not found');
      }

      return [...list.querySelectorAll(':scope > li')].map((li, index) => {
        const questionNode = li.querySelector('.preg');
        const containerNode = li.querySelector('.cont_preg');

        return {
          index: index + 1,
          questionNumber: parseInt(questionNode?.id ?? `${index + 1}`, 10),
          questionId: parseInt(containerNode?.id ?? `${index + 1}`, 10),
          questionText: stripNumber(questionNode?.textContent ?? ''),
          imageUrls: [...li.querySelectorAll('.img_min img, .cont_preg > img, img.img_p')].map(
            (img) => img.src
          ),
          options: [...li.querySelectorAll('p.resp')].map((option) => {
            const key =
              option.classList.contains('a') ? 'a' :
              option.classList.contains('b') ? 'b' :
              option.classList.contains('c') ? 'c' :
              option.classList.contains('d') ? 'd' :
              null;

            return {
              key,
              text: clean(option.textContent ?? '').replace(/^[a-d]\)\s*/i, ''),
            };
          }),
        };
      });
    });

    const correction = await page.evaluate(() => {
      const list = [...document.querySelectorAll('ul')].find(
        (ul) => ul.querySelectorAll(':scope > li').length === 30
      );

      if (!list) {
        throw new Error('Question list not found');
      }

      const items = [...list.querySelectorAll(':scope > li')];
      const selections = [];
      items.forEach((li, index) => {
        const options = [...li.querySelectorAll('p.resp')];
        const choice = options[index % options.length];
        choice?.click();
        const selectedKey =
          choice?.classList.contains('a') ? 'a' :
          choice?.classList.contains('b') ? 'b' :
          choice?.classList.contains('c') ? 'c' :
          choice?.classList.contains('d') ? 'd' :
          null;
        selections.push(selectedKey);
      });

      const correctAnswers = Array.isArray(window.vRespostesCorrectes)
        ? window.vRespostesCorrectes.map((value) => String(value).toLowerCase())
        : [];

      return {
        tip: window.vTipusTest,
        testId: window.vIdTest,
        selectedAnswers: selections,
        correctAnswers,
      };
    });

    const explanationResults = await page.evaluate(async () => {
      const list = [...document.querySelectorAll('ul')].find(
        (ul) => ul.querySelectorAll(':scope > li').length === 30
      );

      if (!list) {
        throw new Error('Question list not found');
      }

      const post = (endpoint, payload) =>
        new Promise((resolve, reject) => {
          window.jQuery
            .post(endpoint, payload)
            .done(resolve)
            .fail((xhr, status, err) => {
              reject(new Error(`Explanation request failed: ${status} ${err || ''}`.trim()));
            });
        });

      const items = [...list.querySelectorAll(':scope > li')];
      const results = [];

      for (const li of items) {
        const containerNode = li.querySelector('.cont_preg');
        const questionNode = li.querySelector('.preg');
        const questionId = parseInt(containerNode?.id ?? '0', 10);
        const questionNumber = parseInt(questionNode?.id ?? '0', 10);
        const raw = await post('test_ajax_explica.asp', {
          tip: window.vTipusTest,
          t: window.vIdTest,
          npt: questionNumber,
          p: questionId,
          nalea: Math.round(Math.random() * 10_000),
        });

        let explanationHtml = null;
        let explanationText = null;
        let videoUrls = [];
        let imageUrls = [];

        if (typeof raw === 'string' && raw.startsWith('EXP$$')) {
          explanationHtml = raw.slice(5);
          const wrapper = document.createElement('div');
          wrapper.innerHTML = explanationHtml;

          const explanationRoot = wrapper.querySelector('.explicacio') || wrapper;
          const firstContentBlock = [...explanationRoot.querySelectorAll(':scope > div')].find(
            (node) => !node.classList.contains('videoexpl')
          );

          explanationText = firstContentBlock?.textContent?.replace(/\s+/g, ' ').trim() ?? null;
          videoUrls = [...explanationRoot.querySelectorAll('video source')].map((node) => node.src);
          imageUrls = [...explanationRoot.querySelectorAll('img')].map((node) => node.src);
        }

        results.push({
          questionId,
          questionNumber,
          explanationHtml,
          explanationText,
          videoUrls,
          explanationImageUrls: imageUrls,
        });
      }

      return results;
    });

    const explanationsByQuestionId = new Map(
      explanationResults.map((item) => [item.questionId, item])
    );

    const result = {
      sourceUrl: targetUrl,
      scrapedAt: new Date().toISOString(),
      testHeading: await page.locator('h1').first().textContent() || `test ${correction.testId}`,
      meta: {
        tip: correction.tip,
        testId: correction.testId,
        totalQuestions: questions.length,
      },
      questions: questions.map((question) => {
        const correctionInfo = {
          selectedAnswer: correction.selectedAnswers[question.index - 1] ?? null,
          correctAnswer: correction.correctAnswers[question.index - 1] ?? null,
        };
        const explanationInfo = explanationsByQuestionId.get(question.questionId) ?? {};

        return {
          ...question,
          selectedAnswer: correctionInfo.selectedAnswer ?? null,
          correctAnswer: correctionInfo.correctAnswer ?? null,
          options: question.options.map((option) => ({
            ...option,
            isSelected: option.key === correctionInfo.selectedAnswer,
            isCorrect: option.key === correctionInfo.correctAnswer,
          })),
          explanationText: explanationInfo.explanationText
            ? normalizeWhitespace(explanationInfo.explanationText)
            : explanationInfo.explanationHtml
              ? htmlToText(explanationInfo.explanationHtml)
              : null,
          explanationHtml: explanationInfo.explanationHtml ?? null,
          explanationVideoUrls: explanationInfo.videoUrls ?? [],
          explanationImageUrls: explanationInfo.explanationImageUrls ?? [],
        };
      }),
    };

    await mkdir(outputDir, { recursive: true });
    const testNumber = (result.testHeading.match(/\d+/) || [String(result.meta.testId)])[0];
    const outputFile = path.join(
      outputDir,
      `${String(testNumber).padStart(2, '0')}-${toSafeFilePart(result.testHeading)}.md`
    );
    await writeFile(outputFile, renderTestMarkdown(result), 'utf8');

    console.log(JSON.stringify({
      outputFile,
      totalQuestions: result.questions.length,
      filesWritten: 1,
      testHeading: result.testHeading,
    }, null, 2));

    await context.close();
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
