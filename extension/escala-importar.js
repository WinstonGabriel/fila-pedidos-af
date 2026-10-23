/* Reconhecimento local de escala. Nunca envia o arquivo original ao banco. */
(() => {
  'use strict';
  const normal = (s) =>
    String(s ?? '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .trim();
  const nomes = ['Natalie', 'Cássio', 'Evangela', 'Gabriel', 'Kazaf', 'Rayla', 'Abigail', 'Alisson'];
  const acharNome = (s) =>
    nomes.find(
      (n) =>
        normal(s) === normal(n) ||
        normal(s)
          .split(/[^a-z]+/)
          .includes(normal(n)),
    );
  const iso = (y, m, d) => {
    const a = Number(y),
      b = Number(m),
      c = Number(d),
      x = new Date(Date.UTC(a, b - 1, c));
    return x.getUTCFullYear() === a && x.getUTCMonth() === b - 1 && x.getUTCDate() === c
      ? `${a}-${String(b).padStart(2, '0')}-${String(c).padStart(2, '0')}`
      : null;
  };
  function data(v, ano, mes) {
    if (v instanceof Date && !isNaN(v)) return iso(v.getFullYear(), v.getMonth() + 1, v.getDate());
    const s = String(v ?? '').trim();
    let m = s.match(/^(\d{4})-(\d{2})-(\d{2})(?:T.*)?$/);
    if (m) return iso(m[1], m[2], m[3]);
    m = s.match(/^(?:\w+[.,]?\s+)?(\d{1,2})[/.\-](\d{1,2})(?:[/.\-](\d{2,4}))?$/);
    if (m) return iso(m[3] ? (Number(m[3]) < 100 ? 2000 + Number(m[3]) : m[3]) : ano, m[2], m[1]);
    if (/^\d{1,2}$/.test(s)) return iso(ano, mes, Number(s));
    return null;
  }
  const hora = (v) => {
    if (v instanceof Date && !isNaN(v))
      return `${String(v.getHours()).padStart(2, '0')}:${String(v.getMinutes()).padStart(2, '0')}`;
    if (typeof v === 'number' && v >= 0 && v < 1) {
      const n = Math.round(v * 1440) % 1440;
      return `${String(Math.floor(n / 60)).padStart(2, '0')}:${String(n % 60).padStart(2, '0')}`;
    }
    const m = String(v ?? '')
      .trim()
      .match(/^(\d{1,2})(?::|h)(\d{2})(?::\d{2})?$/i);
    return m && Number(m[1]) < 24 && Number(m[2]) < 60 ? `${m[1].padStart(2, '0')}:${m[2]}` : '';
  };
  function turno(v) {
    const s = normal(v);
    if (!s) return null;
    const tipo = /folga/.test(s)
      ? 'folga'
      : /feriado/.test(s)
        ? 'feriado'
        : /ferias/.test(s)
          ? 'ferias'
          : /atestado/.test(s)
            ? 'atestado'
            : /trabalho|expediente/.test(s)
              ? 'trabalho'
              : null;
    const hs = String(v).match(/\d{1,2}[:h]\d{2}/gi) || [];
    const inicio = hora(typeof v === 'number' ? v : hs[0]),
      fim = hora(hs[1]);
    if (tipo || inicio)
      return {
        tipo: tipo || 'trabalho',
        inicio: tipo && tipo !== 'trabalho' ? '' : inicio,
        fim: tipo && tipo !== 'trabalho' ? '' : fim,
      };
    return null;
  }
  function reconhecer(matrizes, { ano, mes }) {
    if (!Number.isInteger(+ano) || +ano < 2020 || +ano > 2100 || +mes < 1 || +mes > 12)
      throw Error('Informe mês e ano válidos para datas sem ano.');
    const itens = [],
      avisos = [];
    const seen = new Map();
    function add(n, d, t, origem, extra = {}) {
      if (!n || !d || !t) return;
      const item = {
        analista: n,
        data: d,
        ...t,
        observacao: '',
        presenca: 'nao_informada',
        ...extra,
        origem,
      };
      const key = n + '|' + d;
      if (seen.has(key)) {
        const prev = seen.get(key);
        if (['tipo', 'inicio', 'fim', 'presenca', 'observacao'].some((k) => prev[k] !== item[k])) {
          prev.conflito = true;
          avisos.push(`${n}, ${d}: duas informações diferentes. Revise.`);
        }
        return;
      }
      seen.set(key, item);
      itens.push(item);
    }
    for (const { nome, linhas } of matrizes) {
      let cols = null,
        registro = null;
      let mesBloco = +mes,
        anoBloco = +ano;
      for (let i = 0; i < linhas.length; i++) {
        const row = linhas[i] || [];
        const texto = normal(row.join(' '));
        const meses = [
          'janeiro',
          'fevereiro',
          'marco',
          'abril',
          'maio',
          'junho',
          'julho',
          'agosto',
          'setembro',
          'outubro',
          'novembro',
          'dezembro',
        ];
        const mi = meses.findIndex((m) => new RegExp(`\\b${m}\\b`).test(texto));
        if (mi >= 0) {
          mesBloco = mi + 1;
          const y = texto.match(/\b(20\d{2})\b/);
          if (y) anoBloco = +y[1];
        }
        const header = row.map(normal);
        const indexNome = header.findIndex((s) => /^(analista|colaborador|nome)$/.test(s));
        const indexData = header.findIndex((s) => /^(data|dia)$/.test(s));
        if (indexNome >= 0 && indexData >= 0) {
          registro = {
            nome: indexNome,
            data: indexData,
            tipo: header.findIndex((s) => /^(tipo|status|situacao)$/.test(s)),
            inicio: header.findIndex((s) => /^(inicio|entrada|horario)$/.test(s)),
            fim: header.findIndex((s) => /^(fim|saida)$/.test(s)),
            obs: header.findIndex((s) => /^(observacao|obs)$/.test(s)),
          };
          cols = null;
          continue;
        }
        const dates = row.map((v) => data(v, anoBloco, mesBloco));
        if (dates.filter(Boolean).length >= 2 && !row.some(acharNome)) {
          cols = dates;
          registro = null;
          continue;
        }
        if (registro) {
          const n = acharNome(row[registro.nome]);
          if (!n) continue;
          const d = data(row[registro.data], anoBloco, mesBloco);
          let t = turno(row[registro.tipo]);
          if (!t && hora(row[registro.inicio]))
            t = { tipo: 'trabalho', inicio: hora(row[registro.inicio]), fim: hora(row[registro.fim]) };
          if (t?.tipo === 'trabalho') {
            t.inicio = hora(row[registro.inicio]) || t.inicio;
            t.fim = hora(row[registro.fim]) || t.fim;
          }
          if (!d || !t) avisos.push(`${nome}, linha ${i + 1}: data ou turno não reconhecido.`);
          else
            add(n, d, t, `${nome}, linha ${i + 1}`, {
              observacao: String(row[registro.obs] ?? '').slice(0, 500),
            });
          continue;
        }
        const n = row.map(acharNome).find(Boolean);
        if (!n) {
          if (cols && row.some((v) => turno(v)) && String(row[0] ?? '').trim())
            avisos.push(`${nome}, linha ${i + 1}: analista não reconhecido: ${String(row[0]).slice(0, 60)}.`);
          continue;
        }
        if (!cols) {
          avisos.push(`${nome}, linha ${i + 1}: ${n} sem cabeçalho de datas reconhecido.`);
          continue;
        }
        row.forEach((v, j) => {
          if (!cols[j] || v === null || v === undefined || String(v).trim() === '') return;
          const t = turno(v);
          if (t) add(n, cols[j], t, `${nome}, linha ${i + 1}`);
          else avisos.push(`${n}, ${cols[j]}: “${String(v).slice(0, 50)}” não reconhecido.`);
        });
      }
    }
    return {
      itens: itens.sort((a, b) => a.data.localeCompare(b.data) || a.analista.localeCompare(b.analista)),
      avisos: [...new Set(avisos)],
    };
  }
  function matrizPosicoes(items) {
    const rows = [];
    for (const item of items
      .filter((x) => String(x.text ?? '').trim())
      .sort((a, b) => a.y - b.y || a.x - b.x)) {
      let r = rows.find((r) => Math.abs(r.y - item.y) < Math.max(3, item.h * 0.45));
      if (!r) {
        r = { y: item.y, items: [] };
        rows.push(r);
      }
      r.items.push(item);
    }
    // Os centros das datas formam as colunas, sem depender do tamanho do nome.
    const headers = rows.filter(
      (r) =>
        r.items.filter((x) => /^(\d{1,2}(?:[/.\-]\d{1,2}(?:[/.\-]\d{2,4})?)?)$/.test(x.text.trim())).length >=
        2,
    );
    let current = null;
    const out = [];
    for (const row of rows.sort((a, b) => a.y - b.y)) {
      if (headers.includes(row))
        current = row.items
          .filter((x) => /^(\d{1,2}(?:[/.\-]\d{1,2}(?:[/.\-]\d{2,4})?)?)$/.test(x.text.trim()))
          .sort((a, b) => a.x - b.x);
      if (!current) {
        out.push([
          row.items
            .sort((a, b) => a.x - b.x)
            .map((x) => x.text)
            .join(' '),
        ]);
        continue;
      }
      const cells = Array(current.length + 1).fill('');
      for (const t of row.items) {
        let index = 0;
        if (t.x + t.w / 2 >= current[0].x - 10) {
          let dist = Infinity;
          current.forEach((h, j) => {
            const d = Math.abs(t.x + t.w / 2 - (h.x + h.w / 2));
            if (d < dist) {
              dist = d;
              index = j + 1;
            }
          });
        }
        cells[index] += (cells[index] ? ' ' : '') + t.text;
      }
      out.push(cells);
    }
    return out;
  }
  let pdfLibrary;
  async function lerArquivo(file, opcoes, progresso = () => {}, signal) {
    if (!file || file.size > 25 * 1024 * 1024) throw Error('Selecione PDF ou planilha de até 25 MB.');
    const checar = () => {
      if (signal?.aborted) throw new DOMException('Importação cancelada', 'AbortError');
    };
    checar();
    const bytes = await file.arrayBuffer();
    checar();
    const matrizes = [];
    if (/\.(xlsx|xls|csv)$/i.test(file.name)) {
      const wb = window.XLSX.read(new Uint8Array(bytes), {
        type: 'array',
        cellDates: true,
        ...(/\.csv$/i.test(file.name) ? { codepage: 65001, raw: true } : {}),
      });
      for (const nome of wb.SheetNames) {
        const sheet = wb.Sheets[nome];
        const range = window.XLSX.utils.decode_range(sheet['!ref'] || 'A1');
        if (range.e.r > 10000 || range.e.c > 400)
          throw Error('Planilha muito extensa. Use uma aba de escala com até 10.000 linhas e 400 colunas.');
        matrizes.push({
          nome,
          linhas: window.XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', raw: true }),
        });
      }
    } else if (/\.pdf$/i.test(file.name)) {
      pdfLibrary ??= await import('./vendor/pdf.min.mjs');
      pdfLibrary.GlobalWorkerOptions.workerSrc = chrome.runtime.getURL('vendor/pdf.worker.min.mjs');
      const loading = pdfLibrary.getDocument({
        data: new Uint8Array(bytes),
        isEvalSupported: false,
        useSystemFonts: true,
      });
      let pdf, ocr;
      try {
        pdf = await loading.promise;
        if (pdf.numPages > 24) throw Error('Use um PDF de escala com até 24 páginas.');
        for (let p = 1; p <= pdf.numPages; p++) {
          checar();
          progresso(`Lendo PDF: página ${p}/${pdf.numPages}`);
          const page = await pdf.getPage(p),
            viewport = page.getViewport({ scale: 2 });
          const content = await page.getTextContent();
          let items = content.items
            .filter((x) => x.str?.trim())
            .map((x) => ({
              text: x.str,
              x: x.transform[4] * 2,
              y: viewport.height - x.transform[5] * 2,
              w: x.width * 2,
              h: Math.abs(x.transform[3]) * 2,
            }));
          if (items.map((x) => x.text).join('').length < 30) {
            progresso(`Reconhecendo imagem: página ${p}/${pdf.numPages}`);
            ocr ??= await window.Tesseract.createWorker('eng', 1, {
              workerPath: chrome.runtime.getURL('vendor/tesseract-worker.min.js'),
              corePath: chrome.runtime.getURL('vendor/ocr'),
              langPath: chrome.runtime.getURL('vendor/lang'),
              gzip: false,
              workerBlobURL: false,
              logger: (m) => {
                if (m.status === 'recognizing text')
                  progresso(`OCR página ${p}/${pdf.numPages}: ${Math.round(m.progress * 100)}%`);
              },
            });
            const canvas = document.createElement('canvas');
            canvas.width = Math.ceil(viewport.width);
            canvas.height = Math.ceil(viewport.height);
            if (canvas.width * canvas.height > 24000000)
              throw Error('Página de PDF muito grande para reconhecimento.');
            await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
            checar();
            const { data: result } = await ocr.recognize(canvas, {}, { blocks: true, text: true });
            items = (result.blocks || [])
              .flatMap((b) => b.paragraphs || [])
              .flatMap((b) => b.lines || [])
              .flatMap((b) => b.words || [])
              .map((w) => ({
                text: w.text,
                x: w.bbox.x0,
                y: w.bbox.y0,
                w: w.bbox.x1 - w.bbox.x0,
                h: w.bbox.y1 - w.bbox.y0,
              }));
            canvas.width = canvas.height = 0;
          }
          matrizes.push({ nome: `Página ${p}`, linhas: matrizPosicoes(items) });
          page.cleanup();
        }
      } finally {
        await ocr?.terminate();
        if (pdf) await pdf.destroy();
        else await loading.destroy();
      }
    } else throw Error('Formato não suportado. Use PDF, XLSX, XLS ou CSV.');
    checar();
    const resultado = reconhecer(matrizes, opcoes);
    if (!resultado.itens.length)
      throw Error(
        'Nenhum turno reconhecido. Use analistas nas linhas e datas nas colunas, ou colunas Analista, Data, Entrada, Saída e Tipo. Confira mês e ano.',
      );
    return resultado;
  }
  window.FilaImportar = Object.freeze({ reconhecer, matrizPosicoes, lerArquivo, hora, data, turno });
})();
