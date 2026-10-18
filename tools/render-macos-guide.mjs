import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = dirname(dirname(fileURLToPath(import.meta.url)));
const version = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version;
const escape = s => s.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
const inline = s => escape(s).replace(/`([^`]+)`/g, '<code>$1</code>').replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>').replace(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g, '<a href="$2">$1</a>');
const lines = readFileSync(join(root, 'distribution', 'Mac-使用说明.md'), 'utf8').split('\n');
let body = '', list = '', section = 0; const toc = [];
const closeList = () => { if (list) { body += '</' + list + '>'; list = ''; } };
for (let i = 0; i < lines.length; i++) {
  const line = lines[i].trim(); if (!line) { closeList(); continue; }
  if (line.startsWith('# ')) continue;
  if (line.startsWith('## ')) { closeList(); const id = 's' + ++section; toc.push(`<a href="#${id}">${inline(line.slice(3))}</a>`); body += `<h2 id="${id}">${inline(line.slice(3))}</h2>`; continue; }
  if (line.startsWith('|')) {
    closeList(); const rows = [];
    while (i < lines.length && lines[i].trim().startsWith('|')) rows.push(lines[i++].trim().slice(1, -1).split('|').map(s => s.trim()));
    i--; const header = rows.shift(); rows.shift();
    body += '<div class="table"><table><thead><tr>' + header.map(s => '<th>' + inline(s) + '</th>').join('') + '</tr></thead><tbody>' + rows.map(row => '<tr>' + row.map(s => '<td>' + inline(s) + '</td>').join('') + '</tr>').join('') + '</tbody></table></div>'; continue;
  }
  const match = line.match(/^(?:- |(\d+)\. )(.*)$/);
  if (match) { const kind = match[1] ? 'ol' : 'ul'; if (list !== kind) { closeList(); list = kind; body += '<' + kind + '>'; } body += '<li>' + inline(match[2]) + '</li>'; continue; }
  closeList(); body += line.startsWith('> ') ? '<blockquote>' + inline(line.slice(2)) + '</blockquote>' : '<p>' + inline(line) + '</p>';
}
closeList();
const logo = readFileSync(join(root, 'extension', 'brand.svg')).toString('base64');
const html = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Plka · Mac 使用说明</title><style>
*{box-sizing:border-box}html{scroll-behavior:smooth}body{margin:0;background:#f5f3eb;color:#262932;font:15px/1.9 -apple-system,BlinkMacSystemFont,"PingFang SC",sans-serif}header{padding:55px max(25px,calc((100vw - 1100px)/2));background:#c2cef8}header img{width:64px;border-radius:18px;float:left;margin:0 20px 10px 0}h1{font-size:36px;line-height:1.3;margin:0 0 12px;letter-spacing:-1px}header p{margin:0}header small{display:block;margin-top:25px;letter-spacing:2px;font-size:11px}.layout{display:grid;grid-template-columns:195px 1fr;gap:40px;max-width:1200px;margin:35px auto;padding:0 25px}nav{position:sticky;top:22px;align-self:start}nav a{display:block;text-decoration:none;color:#6a6e7c;padding:5px 0;font-size:12px}main{background:#fffdf8;border-radius:22px;padding:20px 40px 40px;min-width:0}h2{font-size:22px;margin:35px 0 15px;scroll-margin-top:25px;border-bottom:1px solid #e7e6df;padding-bottom:12px}p{margin:14px 0}a{color:#4c65b2;overflow-wrap:anywhere}li{padding:6px 0}code{font:12px/1.8 ui-monospace,monospace;background:#edf0f9;border-radius:5px;padding:3px 6px;overflow-wrap:anywhere}blockquote{margin:20px 0;padding:18px 22px;border-radius:14px;background:#e6ebff;border-left:4px solid #a8b8ee}table{border-collapse:collapse;width:100%;font-size:13px}th,td{text-align:left;vertical-align:top;border-bottom:1px solid #e5e6eb;padding:12px}th{background:#ebeffc}.table{overflow:auto;margin:20px 0}footer{text-align:center;font-size:12px;color:#858997;margin:30px}@media(max-width:800px){header{padding:35px 25px}h1{font-size:28px}.layout{display:block}nav{position:static;display:flex;flex-wrap:wrap;gap:12px;margin-bottom:20px}main{padding:15px 22px 30px}}@media print{body{background:white;font-size:11px}header{padding:20px}header img{width:48px}h1{font-size:26px}.layout{display:block;margin:0;padding:0}nav{display:none}main{padding:10px 20px}h2{break-after:avoid;font-size:18px}tr,blockquote{break-inside:avoid}@page{size:A4;margin:15mm}}
</style></head><body><header><img alt="Plka" src="data:image/svg+xml;base64,${logo}"><h1>Plka · Mac 使用说明</h1><p>收藏参考，整理思路，再交给自己的 Codex。</p><small>v${version}　/　APPLE SILICON & INTEL　/　CHROME + CODEX</small></header><div class="layout"><nav>${toc.join('')}</nav><main>${body}</main></div><footer>独立本地图库 · 2026.10.18</footer></body></html>`;
writeFileSync(join(root, 'distribution', 'Mac-使用说明.html'), html);
console.log('Mac 使用说明已生成。');
