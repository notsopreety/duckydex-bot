const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const { PDFDocument } = require('pdf-lib');

const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));

const MAX_PDF_MB = 50;
const MAX_WIDTH = 1200;

async function getChapterPages(chapterId) {
  const res = await fetch(`https://api.samirb.com.np/manga/pages/${chapterId}`);
  return await res.json();
}

// Fetch and compress single image to JPEG
async function fetchAndCompressImage(url, pageNumber, quality) {
  const proxyUrl = `https://api.samirb.com.np/manga/img?url=${encodeURIComponent(url)}`;
  console.log(`📥 Fetching page ${pageNumber}`);

  const res = await fetch(proxyUrl, {
    headers: { 'User-Agent': 'DuckDex-Bot/1.0' },
    timeout: 30000,
  });

  const buffer = await res.arrayBuffer();

  const jpegBuffer = await sharp(buffer)
    .resize({ width: MAX_WIDTH, withoutEnlargement: true })
    .jpeg({ quality, mozjpeg: true })
    .toBuffer();

  const meta = await sharp(jpegBuffer).metadata();

  return {
    buffer: jpegBuffer,
    width: meta.width,
    height: meta.height,
    pageNumber
  };
}

// Build PDF from image objects
async function buildPdf(imageObjects) {
  const pdfDoc = await PDFDocument.create();

  for (const { buffer, width, height } of imageObjects) {
    const img = await pdfDoc.embedJpg(buffer);
    const page = pdfDoc.addPage([width, height]);
    page.drawImage(img, { x: 0, y: 0, width, height });
  }

  return await pdfDoc.save();
}

// Main function with size constraint logic
async function createChapterPDF(chapterId, mangaTitle = 'Unknown', chapterNumber = 'Unknown') {
  console.log(`📚 Starting PDF for ${chapterId}`);

  const pages = await getChapterPages(chapterId);
  if (!pages || pages.length === 0) throw new Error('No pages found');

  let quality = 85;
  let pdfBytes;
  let imageObjects = [];

  // Retry loop to hit size limit
  for (; quality >= 20; quality -= 10) {
    console.log(`🧪 Trying compression at quality: ${quality}`);
    const results = await Promise.allSettled(
      pages.map(p => fetchAndCompressImage(p.imageUrl, p.page, quality))
    );

    imageObjects = results
      .filter(r => r.status === 'fulfilled')
      .map(r => r.value);

    if (imageObjects.length < pages.length) {
      console.warn(`⚠️ Some pages failed to process. Aborting.`);
      break;
    }

    pdfBytes = await buildPdf(imageObjects);
    const sizeMB = pdfBytes.length / 1024 / 1024;

    console.log(`📦 PDF size at quality ${quality}: ${sizeMB.toFixed(2)} MB`);

    if (sizeMB <= MAX_PDF_MB) break;
  }

  // Sanitize chapterId to avoid nested directories like manga/title
  const safeId = chapterId.replace(/[\\/]/g, '_');
  const filename = `${safeId}.pdf`;
  const outputDir = path.join(__dirname, '..', 'temp');
  if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });
  const outputPath = path.join(outputDir, filename);

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, pdfBytes);

  console.log(`🎉 PDF saved: ${filename}`);
  console.log(`📊 Final quality: ${quality}, Pages: ${pages.length}, Size: ${(pdfBytes.length / 1024 / 1024).toFixed(2)} MB`);

  return {
    path: outputPath,
    filename,
    totalPages: pages.length,
    quality,
    size: +(pdfBytes.length / 1024 / 1024).toFixed(2)
  };
}

/**
 * Cleanup temp folder
 */
function cleanupTempFiles() {
  const dir = path.join(__dirname, '..', 'temp');
  if (!fs.existsSync(dir)) return;

  const cutoff = Date.now() - 60 * 60 * 1000;
  fs.readdirSync(dir).forEach(file => {
    const f = path.join(dir, file);
    const stat = fs.statSync(f);
    if (stat.mtimeMs < cutoff) {
      fs.unlinkSync(f);
      console.log(`🧹 Removed old file: ${file}`);
    }
  });
}

module.exports = {
  createChapterPDF,
  getChapterPages,
  cleanupTempFiles
};
