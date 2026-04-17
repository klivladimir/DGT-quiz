import fs from 'fs';
import path from 'path';
import https from 'https';
import http from 'http';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const jsonPath = path.join(__dirname, 'output', 'todotest-tip-3.json');
const outputDir = path.join(__dirname, 'toBegenerated');

// Create output directory if it doesn't exist
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

// Function to download an image using fetch (handles redirects automatically)
const downloadImage = async (urlStr, filepath) => {
  const response = await fetch(urlStr);
  if (!response.ok) {
    throw new Error(`Failed to download image: ${response.status} ${response.statusText}`);
  }

  const buffer = await response.arrayBuffer();
  fs.writeFileSync(filepath, Buffer.from(buffer));
};

async function main() {
  try {
    const data = fs.readFileSync(jsonPath, 'utf8');
    const testsData = JSON.parse(data);

    let downloadCount = 0;
    let errorCount = 0;

    for (const test of testsData.tests) {
      const testNumber = test.testNumber;

      for (const question of test.questions) {
        if (question.imageUrl && question.imageUrl.trim() !== '') {
          const questionNumber = question.questionNumber;

          // Safely extract extension ignoring query parameters
          let ext = '.jpg';
          try {
             const urlObj = new URL(question.imageUrl);
             ext = path.extname(urlObj.pathname) || '.jpg';
          } catch (e) {
             ext = path.extname(question.imageUrl.split('?')[0]) || '.jpg';
          }

          const filename = `${testNumber}-${questionNumber}${ext}`;
          const filepath = path.join(outputDir, filename);

          console.log(`Downloading ${question.imageUrl} to ${filename}...`);
          try {
            await downloadImage(question.imageUrl, filepath);
            downloadCount++;
          } catch (err) {
            console.error(`Error downloading ${question.imageUrl}:`, err.message);
            errorCount++;
          }
        }
      }
    }

    console.log(`\nFinished! Downloaded ${downloadCount} images. Encountered ${errorCount} errors.`);
  } catch (err) {
    console.error('Error reading JSON file:', err);
  }
}

main();
