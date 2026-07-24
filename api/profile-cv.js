const { PDFParse } = require('pdf-parse');

function rawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = []; let total = 0;
    req.on('data', chunk => { total += chunk.length; if (total > 8_000_000) reject(new Error('PDF must be smaller than 8 MB.')); else chunks.push(chunk); });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}
function multipartFile(buffer, contentType) {
  const match = contentType.match(/boundary=(?:"([^"]+)"|([^;]+))/i);
  const boundary = match && (match[1] || match[2]);
  if (!boundary) throw new Error('Invalid PDF upload.');
  const headerEnd = buffer.indexOf(Buffer.from('\r\n\r\n'));
  const end = buffer.indexOf(Buffer.from(`--${boundary}`), headerEnd + 4);
  const header = buffer.subarray(0, headerEnd).toString('utf8');
  const filename = header.match(/filename="([^"]+)"/i)?.[1];
  if (!filename || headerEnd < 0 || end < 0) throw new Error('No PDF file was provided.');
  return { filename, data: buffer.subarray(headerEnd + 4, end - 2) };
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed.' });
  try {
    const upload = multipartFile(await rawBody(req), req.headers['content-type'] || '');
    if (!upload.filename.toLowerCase().endsWith('.pdf') || upload.data.subarray(0, 4).toString() !== '%PDF') return res.status(400).json({ error: 'Please upload a valid PDF.' });
    const parser = new PDFParse({ data: upload.data });
    const result = await parser.getText(); await parser.destroy();
    const text = (result.text || '').replace(/\s{3,}/g, '\n').trim();
    if (!text) return res.status(422).json({ error: 'No selectable text was found in this PDF.' });
    return res.status(200).json({ fileName: upload.filename, extractedCharacters: text.length, cvSummary: text });
  } catch (error) {
    return res.status(500).json({ error: error.message || 'PDF extraction failed.' });
  }
};
