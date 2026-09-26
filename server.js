require('dotenv').config();
const http = require('http');
const ftp  = require('basic-ftp');
const os   = require('os');
const fs   = require('fs');
const path = require('path');

const PORT           = process.env.PORT           || 3000;
const FTP_HOST       = process.env.FTP_HOST;
const FTP_PORT       = parseInt(process.env.FTP_PORT || '21');
const FTP_USER       = process.env.FTP_USER;
const FTP_PASS       = process.env.FTP_PASS;
const FTP_REMOTE_DIR = process.env.FTP_REMOTE_DIR || 'htdocs/Forms';
const PUBLIC_BASE    = (process.env.PUBLIC_BASE_URL || '').replace(/\/$/, '');
const UPLOAD_TOKEN   = process.env.UPLOAD_TOKEN;

async function uploadViaFtp(filename, htmlContent) {
  const tmpFile = path.join(os.tmpdir(), filename);
  fs.writeFileSync(tmpFile, htmlContent, 'utf8');

  const client = new ftp.Client();
  try {
    await client.access({
      host:     FTP_HOST,
      port:     FTP_PORT,
      user:     FTP_USER,
      password: FTP_PASS,
      secure:   false
    });
    await client.ensureDir(FTP_REMOTE_DIR);
    await client.uploadFrom(tmpFile, filename);
  } finally {
    client.close();
    fs.unlinkSync(tmpFile);
  }

  return `${PUBLIC_BASE}/${filename}`;
}

http.createServer(async (req, res) => {
  if (req.method !== 'POST') {
    res.writeHead(405, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'error', message: 'POST only' }));
    return;
  }

  let raw = '';
  req.on('data', chunk => raw += chunk);
  req.on('end', async () => {
    try {
      const { token, filename, html } = JSON.parse(raw);

      if (UPLOAD_TOKEN && token !== UPLOAD_TOKEN) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'error', message: 'Unauthorized' }));
        return;
      }

      if (!filename || !html) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'error', message: 'filename and html are required' }));
        return;
      }

      if (!/^[a-zA-Z0-9_\-]+\.html$/.test(filename)) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'error', message: 'Invalid filename. Only alphanumeric .html files allowed.' }));
        return;
      }

      const url = await uploadViaFtp(filename, html);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok', url }));

    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'error', message: err.message }));
    }
  });
}).listen(PORT, () => {
  console.log(`Middleware listening on port ${PORT}`);
  console.log(`FTP target: ${FTP_HOST} → ${FTP_REMOTE_DIR}`);
  console.log(`Public URL base: ${PUBLIC_BASE}`);
});
