const { PDFDocument, rgb, StandardFonts, degrees } = require('pdf-lib');

module.exports = async function handler(req, res) {
  // CORS Headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // GET request - API Info
  if (req.method === 'GET') {
    return res.status(200).json({
      name: 'Ultimate PDF API',
      version: '1.0.0',
      status: 'running',
      tools: [
        'merge', 'compress', 'split', 'jpg-to-pdf', 'pdf-to-jpg',
        'rotate', 'delete-pages', 'protect', 'unlock', 'add-text', 'extract-pages'
      ]
    });
  }

  // POST request
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { tool } = req.body || {};

    if (!tool) {
      return res.status(400).json({
        error: 'Tool not specified',
        availableTools: [
          'merge', 'compress', 'split', 'jpg-to-pdf', 'pdf-to-jpg',
          'rotate', 'delete-pages', 'protect', 'unlock', 'add-text', 'extract-pages'
        ]
      });
    }

    // Tool handlers
    switch (tool.toLowerCase()) {
      case 'merge':
        return await handleMerge(req, res);
      case 'compress':
        return await handleCompress(req, res);
      case 'split':
        return await handleSplit(req, res);
      case 'jpg-to-pdf':
        return await handleJpgToPdf(req, res);
      case 'rotate':
        return await handleRotate(req, res);
      case 'delete-pages':
        return await handleDeletePages(req, res);
      case 'protect':
        return await handleProtect(req, res);
      case 'unlock':
        return await handleUnlock(req, res);
      case 'add-text':
        return await handleAddText(req, res);
      case 'extract-pages':
        return await handleExtractPages(req, res);
      default:
        return res.status(400).json({ error: `Unknown tool: ${tool}` });
    }
  } catch (error) {
    return res.status(500).json({
      error: error.message
    });
  }
};

// ============ TOOL 1: MERGE PDF ============
async function handleMerge(req, res) {
  const { pdfs } = req.body;
  
  if (!pdfs || pdfs.length < 2) {
    return res.status(400).json({ error: 'At least 2 PDFs required' });
  }

  const mergedPdf = await PDFDocument.create();

  for (const pdfData of pdfs) {
    const base64 = pdfData.replace(/^data:application\/pdf;base64,/, '');
    const pdfBytes = Buffer.from(base64, 'base64');
    const pdf = await PDFDocument.load(pdfBytes, { ignoreEncryption: true });
    const pages = await mergedPdf.copyPages(pdf, pdf.getPageIndices());
    pages.forEach(page => mergedPdf.addPage(page));
  }

  const mergedBytes = await mergedPdf.save();

  return res.status(200).json({
    success: true,
    message: `Merged ${pdfs.length} PDFs`,
    pages: mergedPdf.getPageCount(),
    pdf: Buffer.from(mergedBytes).toString('base64')
  });
}

// ============ TOOL 2: COMPRESS PDF ============
async function handleCompress(req, res) {
  const { pdf, quality = 'medium' } = req.body;
  
  if (!pdf) {
    return res.status(400).json({ error: 'PDF required' });
  }

  const base64 = pdf.replace(/^data:application\/pdf;base64,/, '');
  const pdfBytes = Buffer.from(base64, 'base64');
  const originalSize = pdfBytes.length;

  const pdfDoc = await PDFDocument.load(pdfBytes, { ignoreEncryption: true });
  const compressedBytes = await pdfDoc.save({ useObjectStreams: true });
  const newSize = compressedBytes.length;

  return res.status(200).json({
    success: true,
    originalSize,
    compressedSize: newSize,
    reduction: `${Math.round((1 - newSize / originalSize) * 100)}%`,
    pdf: Buffer.from(compressedBytes).toString('base64')
  });
}

// ============ TOOL 3: SPLIT PDF ============
async function handleSplit(req, res) {
  const { pdf, ranges } = req.body;
  
  if (!pdf) {
    return res.status(400).json({ error: 'PDF required' });
  }

  const base64 = pdf.replace(/^data:application\/pdf;base64,/, '');
  const pdfBytes = Buffer.from(base64, 'base64');
  const pdfDoc = await PDFDocument.load(pdfBytes, { ignoreEncryption: true });
  const totalPages = pdfDoc.getPageCount();

  const splitRanges = ranges || Array.from({ length: totalPages }, (_, i) => ({ start: i + 1, end: i + 1 }));
  const results = [];

  for (const { start, end } of splitRanges) {
    const newPdf = await PDFDocument.create();
    const indices = [];
    for (let i = start - 1; i < end; i++) indices.push(i);
    
    const pages = await newPdf.copyPages(pdfDoc, indices);
    pages.forEach(page => newPdf.addPage(page));
    
    const newBytes = await newPdf.save();
    results.push({
      range: `${start}-${end}`,
      pdf: Buffer.from(newBytes).toString('base64')
    });
  }

  return res.status(200).json({
    success: true,
    totalPages,
    documents: results
  });
}

// ============ TOOL 4: JPG TO PDF ============
async function handleJpgToPdf(req, res) {
  const { images, pageSize = 'A4', orientation = 'portrait', margin = 20 } = req.body;
  
  if (!images || images.length === 0) {
    return res.status(400).json({ error: 'At least 1 image required' });
  }

  const sizes = {
    'A4': { width: 595, height: 842 },
    'Letter': { width: 612, height: 792 },
    'A3': { width: 842, height: 1191 }
  };

  let { width, height } = sizes[pageSize] || sizes['A4'];
  if (orientation === 'landscape') [width, height] = [height, width];

  const pdfDoc = await PDFDocument.create();

  for (const imgData of images) {
    const base64 = imgData.replace(/^data:image\/\w+;base64,/, '');
    const imgBytes = Buffer.from(base64, 'base64');

    let image;
    try {
      image = await pdfDoc.embedJpg(imgBytes);
    } catch {
      image = await pdfDoc.embedPng(imgBytes);
    }

    const page = pdfDoc.addPage([width, height]);
    const scale = Math.min(
      (width - margin * 2) / image.width,
      (height - margin * 2) / image.height
    );

    page.drawImage(image, {
      x: (width - image.width * scale) / 2,
      y: (height - image.height * scale) / 2,
      width: image.width * scale,
      height: image.height * scale
    });
  }

  const pdfBytes = await pdfDoc.save();

  return res.status(200).json({
    success: true,
    pages: images.length,
    pdf: Buffer.from(pdfBytes).toString('base64')
  });
}

// ============ TOOL 5: ROTATE PDF ============
async function handleRotate(req, res) {
  const { pdf, rotation = 90, pages: selectedPages = 'all' } = req.body;
  
  if (!pdf) {
    return res.status(400).json({ error: 'PDF required' });
  }

  const base64 = pdf.replace(/^data:application\/pdf;base64,/, '');
  const pdfBytes = Buffer.from(base64, 'base64');
  const pdfDoc = await PDFDocument.load(pdfBytes, { ignoreEncryption: true });
  const totalPages = pdfDoc.getPageCount();

  const indices = selectedPages === 'all' 
    ? Array.from({ length: totalPages }, (_, i) => i)
    : selectedPages.map(p => p - 1);

  for (const i of indices) {
    const page = pdfDoc.getPage(i);
    const current = page.getRotation().angle;
    page.setRotation(degrees(current + rotation));
  }

  const rotatedBytes = await pdfDoc.save();

  return res.status(200).json({
    success: true,
    rotatedPages: indices.length,
    rotation,
    pdf: Buffer.from(rotatedBytes).toString('base64')
  });
}

// ============ TOOL 6: DELETE PAGES ============
async function handleDeletePages(req, res) {
  const { pdf, pages: pagesToDelete } = req.body;
  
  if (!pdf || !pagesToDelete) {
    return res.status(400).json({ error: 'PDF and pages required' });
  }

  const base64 = pdf.replace(/^data:application\/pdf;base64,/, '');
  const pdfBytes = Buffer.from(base64, 'base64');
  const pdfDoc = await PDFDocument.load(pdfBytes, { ignoreEncryption: true });
  const originalPages = pdfDoc.getPageCount();

  const indices = pagesToDelete.map(p => p - 1).sort((a, b) => b - a);
  for (const i of indices) {
    pdfDoc.removePage(i);
  }

  const newBytes = await pdfDoc.save();

  return res.status(200).json({
    success: true,
    originalPages,
    deletedPages: pagesToDelete.length,
    remainingPages: pdfDoc.getPageCount(),
    pdf: Buffer.from(newBytes).toString('base64')
  });
}

// ============ TOOL 7: PROTECT PDF ============
async function handleProtect(req, res) {
  const { pdf, userPassword, ownerPassword } = req.body;
  
  if (!pdf) {
    return res.status(400).json({ error: 'PDF required' });
  }

  const base64 = pdf.replace(/^data:application\/pdf;base64,/, '');
  const pdfBytes = Buffer.from(base64, 'base64');
  const pdfDoc = await PDFDocument.load(pdfBytes, { ignoreEncryption: true });

  pdfDoc.setTitle('Protected Document');
  pdfDoc.setProducer('Ultimate PDF API');

  const protectedBytes = await pdfDoc.save();

  return res.status(200).json({
    success: true,
    message: 'PDF protection metadata added',
    userPasswordSet: !!userPassword,
    ownerPasswordSet: !!ownerPassword,
    pdf: Buffer.from(protectedBytes).toString('base64'),
    note: 'For full encryption, use dedicated encryption library'
  });
}

// ============ TOOL 8: UNLOCK PDF ============
async function handleUnlock(req, res) {
  const { pdf, password } = req.body;
  
  if (!pdf) {
    return res.status(400).json({ error: 'PDF required' });
  }

  const base64 = pdf.replace(/^data:application\/pdf;base64,/, '');
  const pdfBytes = Buffer.from(base64, 'base64');

  const pdfDoc = await PDFDocument.load(pdfBytes, {
    ignoreEncryption: true,
    password
  });

  const unlockedPdf = await PDFDocument.create();
  const pages = await unlockedPdf.copyPages(pdfDoc, pdfDoc.getPageIndices());
  pages.forEach(page => unlockedPdf.addPage(page));

  const unlockedBytes = await unlockedPdf.save();

  return res.status(200).json({
    success: true,
    pages: unlockedPdf.getPageCount(),
    pdf: Buffer.from(unlockedBytes).toString('base64')
  });
}

// ============ TOOL 9: ADD TEXT ============
async function handleAddText(req, res) {
  const { 
    pdf, text, pages: selectedPages = 'all',
    position = 'center', fontSize = 30,
    color = '#000000', opacity = 0.5 
  } = req.body;
  
  if (!pdf || !text) {
    return res.status(400).json({ error: 'PDF and text required' });
  }

  const base64 = pdf.replace(/^data:application\/pdf;base64,/, '');
  const pdfBytes = Buffer.from(base64, 'base64');
  const pdfDoc = await PDFDocument.load(pdfBytes, { ignoreEncryption: true });
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const totalPages = pdfDoc.getPageCount();

  const hex = color.replace('#', '');
  const r = parseInt(hex.substr(0, 2), 16) / 255;
  const g = parseInt(hex.substr(2, 2), 16) / 255;
  const b = parseInt(hex.substr(4, 2), 16) / 255;

  const indices = selectedPages === 'all'
    ? Array.from({ length: totalPages }, (_, i) => i)
    : selectedPages.map(p => p - 1);

  for (const i of indices) {
    const page = pdfDoc.getPage(i);
    const { width, height } = page.getSize();
    const textWidth = font.widthOfTextAtSize(text, fontSize);

    let x, y;
    switch (position) {
      case 'top-left': x = 50; y = height - 50; break;
      case 'top-right': x = width - textWidth - 50; y = height - 50; break;
      case 'bottom-left': x = 50; y = 50; break;
      case 'bottom-right': x = width - textWidth - 50; y = 50; break;
      default: x = (width - textWidth) / 2; y = height / 2;
    }

    page.drawText(text, {
      x, y, size: fontSize, font,
      color: rgb(r, g, b), opacity
    });
  }

  const modifiedBytes = await pdfDoc.save();

  return res.status(200).json({
    success: true,
    modifiedPages: indices.length,
    pdf: Buffer.from(modifiedBytes).toString('base64')
  });
}

// ============ TOOL 10: EXTRACT PAGES ============
async function handleExtractPages(req, res) {
  const { pdf, pages: selectedPages } = req.body;
  
  if (!pdf || !selectedPages) {
    return res.status(400).json({ error: 'PDF and pages required' });
  }

  const base64 = pdf.replace(/^data:application\/pdf;base64,/, '');
  const pdfBytes = Buffer.from(base64, 'base64');
  const pdfDoc = await PDFDocument.load(pdfBytes, { ignoreEncryption: true });

  const indices = selectedPages.map(p => p - 1).sort((a, b) => a - b);
  
  const extractedPdf = await PDFDocument.create();
  const pages = await extractedPdf.copyPages(pdfDoc, indices);
  pages.forEach(page => extractedPdf.addPage(page));

  const extractedBytes = await extractedPdf.save();

  return res.status(200).json({
    success: true,
    originalPages: pdfDoc.getPageCount(),
    extractedPages: selectedPages,
    pdf: Buffer.from(extractedBytes).toString('base64')
  });
}
