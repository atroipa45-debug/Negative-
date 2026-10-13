'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const PORT = parseInt(process.env.PORT, 10) || 8080;
const HOST = '0.0.0.0';
const ROOT = __dirname;
// files that must never be served to visitors
const PRIVATE = new Set(['server.js', 'package.json', 'package-lock.json', 'railway.json', 'dockerfile', '.dockerignore', 'readme.md', '.gitignore']);

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.mp4': 'video/mp4',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8'
};
const COMPRESSIBLE = new Set(['.html', '.css', '.js', '.json', '.svg', '.txt', '.xml']);

const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'SAMEORIGIN',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()'
};

// in-memory cache of compressed text files
const gzCache = new Map();

function send(res, status, headers, body) {
  res.writeHead(status, Object.assign({}, SECURITY_HEADERS, headers));
  res.end(body);
}

function resolveFile(urlPath) {
  let p;
  try { p = decodeURIComponent(urlPath.split('?')[0].split('#')[0]); } catch (e) { return null; }
  if (p.includes('\0')) return null;
  if (p.endsWith('/')) p += 'index.html';
  const full = path.normalize(path.join(ROOT, p));
  if (!full.startsWith(ROOT + path.sep) && full !== ROOT) return null;
  const base = path.basename(full).toLowerCase();
  if (PRIVATE.has(base) || base.startsWith('.')) return null;
  return full;
}

const server = http.createServer((req, res) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    return send(res, 405, { 'Allow': 'GET, HEAD', 'Content-Type': 'text/plain; charset=utf-8' }, 'Method Not Allowed');
  }
  if (req.url === '/health') {
    return send(res, 200, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' }, 'ok');
  }

  let file = resolveFile(req.url || '/');
  if (!file) return send(res, 400, { 'Content-Type': 'text/plain; charset=utf-8' }, 'Bad Request');

  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) {
      // unknown paths without an extension fall back to the home page
      if (!path.extname(file)) { file = path.join(ROOT, 'index.html'); }
      else return send(res, 404, { 'Content-Type': 'text/plain; charset=utf-8' }, 'Not Found');
      return fs.stat(file, (e2, st2) => (e2 ? send(res, 404, {}, 'Not Found') : serve(req, res, file, st2)));
    }
    serve(req, res, file, st);
  });
});

function serve(req, res, file, st) {
  const ext = path.extname(file).toLowerCase();
  const type = TYPES[ext] || 'application/octet-stream';
  const etag = '"' + st.size.toString(16) + '-' + Math.floor(st.mtimeMs).toString(16) + '"';
  const cache = ext === '.html' ? 'no-cache' : 'public, max-age=2592000, immutable';
  const base = { 'Content-Type': type, 'Cache-Control': cache, 'ETag': etag, 'Last-Modified': st.mtime.toUTCString(), 'Accept-Ranges': 'bytes', 'Vary': 'Accept-Encoding' };

  if (req.headers['if-none-match'] === etag) return send(res, 304, base);

  // byte ranges (needed by Safari/iOS for video)
  const range = req.headers.range;
  if (range && !COMPRESSIBLE.has(ext)) {
    const m = /^bytes=(\d*)-(\d*)$/.exec(range.trim());
    if (!m) return send(res, 416, { 'Content-Range': 'bytes */' + st.size });
    let start = m[1] === '' ? null : parseInt(m[1], 10);
    let end = m[2] === '' ? null : parseInt(m[2], 10);
    if (start === null) { start = Math.max(0, st.size - end); end = st.size - 1; }
    if (end === null || end >= st.size) end = st.size - 1;
    if (start > end || start >= st.size) return send(res, 416, { 'Content-Range': 'bytes */' + st.size });
    res.writeHead(206, Object.assign({}, SECURITY_HEADERS, base, { 'Content-Range': 'bytes ' + start + '-' + end + '/' + st.size, 'Content-Length': end - start + 1 }));
    if (req.method === 'HEAD') return res.end();
    return fs.createReadStream(file, { start, end }).on('error', () => res.destroy()).pipe(res);
  }

  const acceptsGzip = /\bgzip\b/.test(req.headers['accept-encoding'] || '');
  if (COMPRESSIBLE.has(ext) && acceptsGzip) {
    const key = file + etag;
    const done = (buf) => {
      res.writeHead(200, Object.assign({}, SECURITY_HEADERS, base, { 'Content-Encoding': 'gzip', 'Content-Length': buf.length }));
      res.end(req.method === 'HEAD' ? undefined : buf);
    };
    if (gzCache.has(key)) return done(gzCache.get(key));
    return fs.readFile(file, (e, data) => {
      if (e) return send(res, 500, {}, 'Server Error');
      zlib.gzip(data, { level: 9 }, (ze, gz) => {
        if (ze) return send(res, 500, {}, 'Server Error');
        gzCache.set(key, gz);
        done(gz);
      });
    });
  }

  res.writeHead(200, Object.assign({}, SECURITY_HEADERS, base, { 'Content-Length': st.size }));
  if (req.method === 'HEAD') return res.end();
  fs.createReadStream(file).on('error', () => res.destroy()).pipe(res);
}

server.keepAliveTimeout = 65000;
server.headersTimeout = 66000;
server.listen(PORT, HOST, () => console.log('Site running on http://' + HOST + ':' + PORT));

const stop = () => server.close(() => process.exit(0));
process.on('SIGTERM', stop);
process.on('SIGINT', stop);
