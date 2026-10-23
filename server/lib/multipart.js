import { HttpError } from './validate.js';

/** Lê um multipart/form-data em memória, com limite de tamanho. Retorna { fields, file }. */
export async function readMultipart(req, maxBytes) {
  const type = req.headers['content-type'] || '';
  const m = /multipart\/form-data;.*boundary=(?:"([^"]+)"|([^;]+))/i.exec(type);
  if (!m) throw new HttpError(400, 'Envie o arquivo como multipart/form-data.');
  const boundary = Buffer.from('--' + (m[1] || m[2]));

  const declared = Number(req.headers['content-length']);
  if (declared && declared > maxBytes + 65536) throw new HttpError(413, 'Arquivo muito grande.');

  const chunks = []; let size = 0;
  for await (const c of req) {
    size += c.length;
    if (size > maxBytes + 65536) throw new HttpError(413, 'Arquivo muito grande.');
    chunks.push(c);
  }
  const body = Buffer.concat(chunks);
  const fields = {}; let file = null;

  let pos = body.indexOf(boundary);
  while (pos !== -1) {
    const start = pos + boundary.length;
    if (body.slice(start, start + 2).toString() === '--') break;
    const next = body.indexOf(boundary, start);
    if (next === -1) break;
    // parte = start+2 (após CRLF) .. next-2 (antes do CRLF)
    const part = body.subarray(start + 2, next - 2);
    const sep = part.indexOf('\r\n\r\n');
    if (sep !== -1) {
      const head = part.subarray(0, sep).toString('utf8');
      const content = part.subarray(sep + 4);
      const name = /name="([^"]*)"/i.exec(head)?.[1];
      const filename = /filename="([^"]*)"/i.exec(head)?.[1];
      if (name) {
        if (filename !== undefined) { if (!file && content.length) file = { name, filename, data: Buffer.from(content) }; }
        else fields[name] = content.toString('utf8');
      }
    }
    pos = next;
  }
  return { fields, file };
}
