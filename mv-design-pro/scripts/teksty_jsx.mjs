#!/usr/bin/env node
/**
 * Teksty JSX (węzły `JsxText`) plików `.tsx` — parser kompilatora TypeScript z
 * `frontend/node_modules`, nie wyrażenie regularne.
 *
 * Po co: `ui_math_guard.py` skanuje literały łańcuchowe wyrażeniem regularnym, a tekst
 * wpisany wprost między znacznikami JSX (`<label>R_f [Ω]</label>`) nie jest literałem —
 * bez tego skanu strażnik nie widziałby tekstu, który projektant czyta na ekranie.
 *
 * Wejście: ścieżki plików (po jednej w wierszu) na stdin. Wyjście (stdout): JSON
 * `[{ "plik": ścieżka, "linia": numer od 1, "tekst": tekst ze złączonymi białymi znakami }]`
 * w kolejności plików i pozycji — deterministyczne.
 */
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const katalogSkryptu = dirname(fileURLToPath(import.meta.url));
const require = createRequire(join(katalogSkryptu, '..', 'frontend', 'package.json'));
const ts = require('typescript');

const pliki = readFileSync(0, 'utf-8')
  .split('\n')
  .map((wiersz) => wiersz.trim())
  .filter((wiersz) => wiersz.length > 0);

const wynik = [];
for (const plik of pliki) {
  const zrodlo = ts.createSourceFile(
    plik,
    readFileSync(plik, 'utf-8'),
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  const odwiedz = (wezel) => {
    if (wezel.kind === ts.SyntaxKind.JsxText) {
      const surowy = wezel.getText(zrodlo);
      const tekst = surowy.replace(/\s+/g, ' ').trim();
      if (tekst.length > 0) {
        const przesuniecie = wezel.getStart(zrodlo) + surowy.search(/\S/);
        const { line } = zrodlo.getLineAndCharacterOfPosition(przesuniecie);
        wynik.push({ plik, linia: line + 1, tekst });
      }
    }
    ts.forEachChild(wezel, odwiedz);
  };
  odwiedz(zrodlo);
}
process.stdout.write(JSON.stringify(wynik));
