import { parentPort, workerData } from 'node:worker_threads';

try {
  const buffer = Buffer.from(workerData.buffer);
  if (workerData.mime === 'application/pdf') {
    const { PDFDocument } = await import('pdf-lib');
    if (!/%%EOF\s*$/.test(buffer.toString('latin1', Math.max(0, buffer.length - 1024)))) throw new Error('Incomplete PDF');
    const document = await PDFDocument.load(buffer, { ignoreEncryption: false, throwOnInvalidObject: true, updateMetadata: false });
    const pages = document.getPages();
    if (!pages.length || pages.length > 100) throw new Error('Invalid page count');
    for (const page of pages) {
      const { width, height } = page.getSize();
      if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) throw new Error('Invalid page');
    }
  } else {
    const { default: sharp } = await import('sharp');
    sharp.cache(false);
    sharp.concurrency(1);
    const image = sharp(buffer, { failOn: 'warning', limitInputPixels: 16_000_000, animated: false });
    const metadata = await image.metadata();
    const expected = { 'image/png': 'png', 'image/jpeg': 'jpeg', 'image/webp': 'webp' }[workerData.mime];
    if (metadata.format !== expected || (metadata.pages || 1) > 1) throw new Error('Unsupported image');
    // Metadata/signatures alone do not decode pixels or detect truncated streams.
    await image.stats();
  }
  parentPort.postMessage(true);
} catch {
  parentPort.postMessage(false);
}
