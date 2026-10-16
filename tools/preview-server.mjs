import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { getPartnerContent, CONTENT_VERSION } from '../supabase/functions/quiz-api/partner-content.ts';

const root = path.resolve(fileURLToPath(new URL('../site/', import.meta.url)));
const port = Number(process.env.PREVIEW_PORT || 8011);
const code = 'DEMO-TEST-2026';
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml' };
const server = http.createServer(async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  try {
    const route = new URL(req.url, 'http://127.0.0.1').pathname;
    if (route === '/config.js') { res.setHeader('Content-Type', types['.js']); res.end('window.RELATIONSHIP_QUIZ_CONFIG=' + JSON.stringify({ localPreview: true, previewCode: code }) + ';'); return; }
    if (['/api/start', '/api/stories'].includes(route) && req.method === 'POST') {
      let body = ''; for await (const part of req) { body += part; if (body.length > 2048) { res.writeHead(413).end(); return; } }
      const data = JSON.parse(body); res.setHeader('Content-Type', 'application/json; charset=utf-8');
      if (data.code !== code.replaceAll('-', '') || (route === '/api/start' && data.content_version !== CONTENT_VERSION)) { res.writeHead(403).end(JSON.stringify({ error: '本机预览密码为 ' + code + '，不会调用正式数据库。' })); return; }
      if (route === '/api/stories') {
        const content = getPartnerContent();
        if (!/^R[1-6]$/.test(data.result_id)) { res.writeHead(400).end(); return; }
        res.end(JSON.stringify({ stories: content.stories[data.result_id], storyEdition: content.storyEdition, storyNote: content.storyNote, optionLookup: Object.fromEntries(content.questions.flatMap(q => q.options.map(option => [option.text, option.id]))) })); return;
      }
      res.end(JSON.stringify({ ok: true, remaining: 4, content: getPartnerContent() })); return;
    }
    const filename = path.resolve(root, '.' + (route === '/' ? '/index.html' : route));
    if (!filename.startsWith(root + path.sep) && filename !== path.join(root, 'index.html')) { res.writeHead(403).end(); return; }
    res.setHeader('Content-Type', types[path.extname(filename)] || 'application/octet-stream'); res.end(await readFile(filename));
  } catch { res.writeHead(404).end('Not found'); }
});
server.listen(port, '127.0.0.1', () => console.log(`Local acceptance preview: http://127.0.0.1:${port}/\nPreview access code: ${code}\nNo production database writes. Stop with Ctrl+C.`));
