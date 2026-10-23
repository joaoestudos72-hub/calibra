import { isDate } from './dates.js';

export class HttpError extends Error {
  constructor(status, message, details) { super(message); this.status = status; this.details = details; }
}

const CTRL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;
const PLATE = /^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$/;

function coerce(f, v) {
  switch (f.type) {
    case 'string':
    case 'text': {
      if (typeof v !== 'string') throw new Error('Texto inválido.');
      const s = v.replace(CTRL, '');
      const max = f.max ?? (f.type === 'text' ? 2000 : 200);
      if (s.length > max) throw new Error(`Máximo de ${max} caracteres.`);
      return s;
    }
    case 'plate': {
      const s = String(v).toUpperCase().replace(/[^A-Z0-9]/g, '');
      if (!PLATE.test(s)) throw new Error('Placa inválida. Use AAA1234 ou AAA1B23.');
      return s;
    }
    case 'int': {
      const n = Number(v);
      if (!Number.isInteger(n)) throw new Error('Informe um número inteiro.');
      if (n < (f.min ?? 0)) throw new Error(`Valor mínimo: ${f.min ?? 0}.`);
      if (n > (f.max ?? 99999999)) throw new Error(`Valor máximo: ${f.max ?? 99999999}.`);
      return n;
    }
    case 'money': {
      const n = typeof v === 'string' ? Number(v.replace(',', '.')) : Number(v);
      if (!Number.isFinite(n) || n < 0) throw new Error('Informe um valor válido.');
      if (n > 9999999.99) throw new Error('Valor muito alto.');
      return Math.round(n * 100);
    }
    case 'date': {
      if (!isDate(v) || v < '1950-01-01' || v > '2100-12-31') throw new Error('Data inválida.');
      return v;
    }
    case 'enum':
      if (!f.values.includes(v)) throw new Error('Opção inválida.');
      return v;
    case 'id': {
      const n = Number(v);
      if (!Number.isInteger(n) || n < 1) throw new Error('Seleção inválida.');
      return n;
    }
    default: throw new Error('Tipo de campo desconhecido.');
  }
}

/** Valida `input` segundo `spec`. Retorna { data, errors }. */
export function validate(spec, input) {
  const data = {}, errors = {};
  const src = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
  for (const [name, f] of Object.entries(spec)) {
    let v = src[name];
    if (typeof v === 'string') v = v.trim();
    if (v === undefined || v === null || v === '') {
      if (f.required) errors[name] = 'Campo obrigatório.';
      else data[name] = f.default ?? null;
      continue;
    }
    try { data[name] = coerce(f, v); } catch (e) { errors[name] = e.message; }
  }
  return { data, errors };
}

export const invalid = (errors, msg = 'Verifique os campos informados.') => new HttpError(422, msg, errors);
