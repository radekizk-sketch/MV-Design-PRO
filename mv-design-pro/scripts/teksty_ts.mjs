#!/usr/bin/env node
/**
 * Teksty plików `.ts`/`.tsx` dla `ui_math_guard.py` — parser kompilatora TypeScript z
 * `frontend/node_modules`, nie wyrażenie regularne.
 *
 * Po co: skan wierszy wyrażeniem regularnym nie widzi tekstu wpisanego wprost między znacznikami
 * JSX (`<label>R_f [Ω]</label>`), literału szablonowego zagnieżdżonego w interpolacji
 * (`${ok ? ` · i_b=${x}` : ''}` — wewnętrzny backtick kończy dopasowanie zewnętrznego) ani
 * literału wielowierszowego. Parser widzi każdy z nich jako osobny węzeł.
 *
 * Wejście: ścieżki plików (po jednej w wierszu) na stdin. Wyjście (stdout): JSON — lista wpisów
 * w kolejności plików i pozycji (deterministyczna):
 *   - `{ "rodzaj": "jsx", "plik", "linia", "tekst" }` — węzeł `JsxText`, białe znaki złączone;
 *   - `{ "rodzaj": "literal", "plik", "linia", "wiersz", "przed", "po", "wartosc",
 *       "szablon", "atrybut_jsx" }` — literał łańcuchowy albo szablonowy: `wartosc` to surowy
 *     zapis źródła bez ograniczników (ukośniki jak w pliku), w szablonie same części literalne
 *     (interpolacje `${…}` usunięte, ich literały są osobnymi wpisami); `przed`/`po` — tekst
 *     wiersza przed początkiem i za końcem węzła; `atrybut_jsx` — napis atrybutu JSX
 *     (`latex="…"`), w którym ukośnik jest znakiem dosłownym.
 * Pomijane (kod, nie tekst ekranu): specyfikator modułu importu/eksportu, typ literałowy,
 * nazwa właściwości (`{ 'Load.p_mw': … }`), argument dostępu indeksowego (`obj['a_b']`).
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

function jestKodem(wezel) {
  const rodzic = wezel.parent;
  if (!rodzic) return false;
  switch (rodzic.kind) {
    case ts.SyntaxKind.ImportDeclaration:
    case ts.SyntaxKind.ExportDeclaration:
    case ts.SyntaxKind.ExternalModuleReference:
    case ts.SyntaxKind.LiteralType:
      return true;
    case ts.SyntaxKind.ImportType:
      return true;
    case ts.SyntaxKind.CallExpression:
      // `import('…')`, `require('…')`, `vi.mock('…')` — ścieżka modułu.
      return (
        rodzic.expression.kind === ts.SyntaxKind.ImportKeyword ||
        (ts.isIdentifier(rodzic.expression) && rodzic.expression.text === 'require')
      );
    case ts.SyntaxKind.PropertyAssignment:
    case ts.SyntaxKind.PropertySignature:
    case ts.SyntaxKind.PropertyDeclaration:
    case ts.SyntaxKind.MethodDeclaration:
    case ts.SyntaxKind.EnumMember:
      return rodzic.name === wezel;
    case ts.SyntaxKind.ElementAccessExpression:
      return rodzic.argumentExpression === wezel;
    default:
      return false;
  }
}

function wartoscSzablonu(wezel, zrodlo) {
  // Surowe części literalne szablonu (bez `${…}`): głowa + literał każdego odcinka.
  const surowy = (czesc) => {
    const tekst = czesc.getText(zrodlo);
    // TemplateHead: `…${  · TemplateMiddle: }…${  · TemplateTail: }…`
    const poczatek = tekst.startsWith('`') || tekst.startsWith('}') ? 1 : 0;
    const koniec = tekst.endsWith('${') ? tekst.length - 2 : tekst.endsWith('`') ? tekst.length - 1 : tekst.length;
    return tekst.slice(poczatek, koniec);
  };
  return surowy(wezel.head) + wezel.templateSpans.map((odcinek) => surowy(odcinek.literal)).join('');
}

const wynik = [];
for (const plik of pliki) {
  const tekstPliku = readFileSync(plik, 'utf-8');
  const wiersze = tekstPliku.split('\n');
  const zrodlo = ts.createSourceFile(
    plik,
    tekstPliku,
    ts.ScriptTarget.Latest,
    true,
    plik.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const pozycja = (offset) => zrodlo.getLineAndCharacterOfPosition(offset);
  const odwiedz = (wezel) => {
    if (wezel.kind === ts.SyntaxKind.JsxText) {
      const surowy = wezel.getText(zrodlo);
      const tekst = surowy.replace(/\s+/g, ' ').trim();
      if (tekst.length > 0) {
        const { line } = pozycja(wezel.getStart(zrodlo) + surowy.search(/\S/));
        wynik.push({ rodzaj: 'jsx', plik, linia: line + 1, tekst });
      }
    } else if (
      (ts.isStringLiteral(wezel) ||
        ts.isNoSubstitutionTemplateLiteral(wezel) ||
        ts.isTemplateExpression(wezel)) &&
      !jestKodem(wezel)
    ) {
      const start = pozycja(wezel.getStart(zrodlo));
      const koniec = pozycja(wezel.getEnd());
      const wiersz = wiersze[start.line] ?? '';
      const wartosc = ts.isTemplateExpression(wezel)
        ? wartoscSzablonu(wezel, zrodlo)
        : wezel.getText(zrodlo).slice(1, -1);
      wynik.push({
        rodzaj: 'literal',
        plik,
        linia: start.line + 1,
        wiersz,
        przed: wiersz.slice(0, start.character),
        po: (wiersze[koniec.line] ?? '').slice(koniec.character),
        wartosc,
        szablon: !ts.isStringLiteral(wezel),
        atrybut_jsx: wezel.parent !== undefined && wezel.parent.kind === ts.SyntaxKind.JsxAttribute,
      });
    }
    ts.forEachChild(wezel, odwiedz);
  };
  odwiedz(zrodlo);
}
process.stdout.write(JSON.stringify(wynik));
