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
 *     (`latex="…"`), w którym ukośnik jest znakiem dosłownym;
 *   - `{ "rodzaj": "stala", "plik", "linia", "sciezka", "wartosc" }` — literał tekstowy stałej
 *     obiektowej pod ścieżką właściwości (`['ZWARCIA_STRINGS', 'tytul']`) — stała żyje w `strings.ts`,
 *     wyświetlenie w komponencie;
 *   - `{ "rodzaj": "wyswietlenie", "plik", "linia", "wiersz", "miejsce", "sciezka" }` — liść
 *     wyrażenia wstawionego wprost jako dziecko JSX albo do atrybutu opisowego (`title`,
 *     `aria-label`, `placeholder`, `alt`), ścieżka rozwinięta przez aliasy pliku (import,
 *     `const S = T`, `const S = a ? T_SN : T` — wszystkie gałęzie, jeden wpis na wariant);
 *   - `{ "rodzaj": "komponent", "plik", "nazwa", "wlasciwosci" }` — komponent funkcyjny
 *     i jego właściwości wstawiane do JSX wprost;
 *   - `{ "rodzaj": "reeksport", "plik", "nazwa", "modul", "zrodlowa" }` — `export { X } from`;
 *   - `{ "rodzaj": "uzycie", "plik", "linia", "wiersz", "komponent", "modul", "wlasciwosc",
 *       "sciezki", "wartosc" }` — atrybut JSX komponentu (wielka litera) z modułem
 *     rozwiązanym z importu; `sciezki` — liście wyrażenia po aliasach, `wartosc` — literał.
 * Pomijane (kod, nie tekst ekranu): specyfikator modułu importu/eksportu, typ literałowy,
 * nazwa właściwości (`{ 'Load.p_mw': … }`), argument dostępu indeksowego (`obj['a_b']`), wartość
 * klauzuli `case` i operand porównania równości (`rodzaj === 'cosfi'`).
 */
import { existsSync, readFileSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
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
    case ts.SyntaxKind.CaseClause:
      // `case 'cosfi':` — wartość dyskryminatora, nie tekst ekranu.
      return rodzic.expression === wezel;
    case ts.SyntaxKind.BinaryExpression:
      // `rodzaj === 'cosfi'` — porównanie z wartością kodu.
      return [
        ts.SyntaxKind.EqualsEqualsEqualsToken,
        ts.SyntaxKind.ExclamationEqualsEqualsToken,
        ts.SyntaxKind.EqualsEqualsToken,
        ts.SyntaxKind.ExclamationEqualsToken,
      ].includes(rodzic.operatorToken.kind);
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

/** Atrybuty opisowe JSX, których wartość projektant widzi jako tekst (dymek, czytnik ekranu). */
const ATRYBUTY_OPISOWE = new Set(['title', 'aria-label', 'placeholder', 'alt']);

/** Wartość tekstowa inicjalizatora: literał, szablon (części literalne) albo `+` literałów. */
function wartoscTekstowa(wezel, zrodlo) {
  if (ts.isParenthesizedExpression(wezel)) return wartoscTekstowa(wezel.expression, zrodlo);
  if (ts.isStringLiteral(wezel) || ts.isNoSubstitutionTemplateLiteral(wezel)) {
    return wezel.getText(zrodlo).slice(1, -1);
  }
  if (ts.isTemplateExpression(wezel)) return wartoscSzablonu(wezel, zrodlo);
  if (ts.isBinaryExpression(wezel) && wezel.operatorToken.kind === ts.SyntaxKind.PlusToken) {
    const lewa = wartoscTekstowa(wezel.left, zrodlo);
    const prawa = wartoscTekstowa(wezel.right, zrodlo);
    if (lewa !== null || prawa !== null) return (lewa ?? '') + (prawa ?? '');
  }
  return null;
}

function nazwaWlasciwosci(nazwa) {
  if (ts.isIdentifier(nazwa) || ts.isStringLiteral(nazwa) || ts.isNumericLiteral(nazwa)) return nazwa.text;
  if (ts.isComputedPropertyName(nazwa)) return '*';
  return null;
}

/** Ścieżka stałej tekstowej: `[ZMIENNA, klucz, podklucz…]` dla wartości w literale obiektu
 *  przypisanym do `const ZMIENNA` (także pod `as const` / `satisfies` / wywołaniem `Object.freeze`). */
function sciezkaWlasciwosci(wezel) {
  const sciezka = [];
  let biezacy = wezel;
  while (biezacy) {
    if (ts.isPropertyAssignment(biezacy)) {
      const nazwa = nazwaWlasciwosci(biezacy.name);
      if (nazwa === null) return null;
      sciezka.unshift(nazwa);
      biezacy = biezacy.parent;
    } else if (
      ts.isObjectLiteralExpression(biezacy) ||
      ts.isAsExpression(biezacy) ||
      ts.isSatisfiesExpression?.(biezacy) ||
      ts.isParenthesizedExpression(biezacy) ||
      ts.isCallExpression(biezacy)
    ) {
      biezacy = biezacy.parent;
    } else if (ts.isVariableDeclaration(biezacy) && ts.isIdentifier(biezacy.name)) {
      sciezka.unshift(biezacy.name.text);
      return sciezka;
    } else {
      return null;
    }
  }
  return null;
}

/** Liście wyrażenia wstawionego do JSX: dostęp do właściwości / identyfikator jako ścieżka
 *  (`T.qu.tytul` → `['T','qu','tytul']`, `NAZWY[k]` → `['NAZWY','*']`). Wywołanie funkcji
 *  (`tekstBezWzorow(x)`) nie jest liściem — jego wynik jest już tekstem bez wzorów. */
function lisciWyrazenia(wezel, wynik) {
  if (!wezel) return wynik;
  if (ts.isParenthesizedExpression(wezel) || ts.isNonNullExpression(wezel) || ts.isAsExpression(wezel)) {
    return lisciWyrazenia(wezel.expression, wynik);
  }
  if (ts.isConditionalExpression(wezel)) {
    lisciWyrazenia(wezel.whenTrue, wynik);
    return lisciWyrazenia(wezel.whenFalse, wynik);
  }
  if (ts.isBinaryExpression(wezel)) {
    const op = wezel.operatorToken.kind;
    if (op === ts.SyntaxKind.QuestionQuestionToken || op === ts.SyntaxKind.BarBarToken) {
      lisciWyrazenia(wezel.left, wynik);
      return lisciWyrazenia(wezel.right, wynik);
    }
    if (op === ts.SyntaxKind.AmpersandAmpersandToken) return lisciWyrazenia(wezel.right, wynik);
    if (op === ts.SyntaxKind.PlusToken) {
      lisciWyrazenia(wezel.left, wynik);
      return lisciWyrazenia(wezel.right, wynik);
    }
    return wynik;
  }
  if (ts.isTemplateExpression(wezel)) {
    for (const odcinek of wezel.templateSpans) lisciWyrazenia(odcinek.expression, wynik);
    return wynik;
  }
  const sciezka = [];
  let biezacy = wezel;
  while (true) {
    if (ts.isPropertyAccessExpression(biezacy)) {
      sciezka.unshift(biezacy.name.text);
      biezacy = biezacy.expression;
    } else if (ts.isElementAccessExpression(biezacy)) {
      const argument = biezacy.argumentExpression;
      sciezka.unshift(ts.isStringLiteral(argument) || ts.isNumericLiteral(argument) ? argument.text : '*');
      biezacy = biezacy.expression;
    } else if (ts.isParenthesizedExpression(biezacy) || ts.isNonNullExpression(biezacy)) {
      biezacy = biezacy.expression;
    } else if (ts.isIdentifier(biezacy)) {
      sciezka.unshift(biezacy.text);
      wynik.push(sciezka);
      return wynik;
    } else {
      return wynik;
    }
  }
}

/** Aliasy lokalne pliku: `import { A as T }` → T→A; `const T = A` / `const T = A.b` → T→A.b. */
function aliasyPliku(zrodlo) {
  // Alias -> LISTA ścieżek: `const T = poziom === 'sn' ? ODBIOR_SN_STRINGS : ODBIOR_STRINGS`
  // wskazuje obie stałe (gałęzie warunku, `??`, `||`); ta sama nazwa lokalna w kilku
  // komponentach pliku sumuje cele (nadmiar po stronie wykrycia, nigdy przeoczenie).
  const aliasy = {};
  const dodaj = (nazwa, sciezka) => {
    const lista = (aliasy[nazwa] ??= []);
    if (!lista.some((s) => s.join('.') === sciezka.join('.'))) lista.push(sciezka);
  };
  const odwiedz = (wezel) => {
    if (ts.isImportSpecifier(wezel)) {
      dodaj(wezel.name.text, [(wezel.propertyName ?? wezel.name).text]);
    } else if (ts.isVariableDeclaration(wezel) && ts.isIdentifier(wezel.name) && wezel.initializer) {
      let inicjator = wezel.initializer;
      while (ts.isParenthesizedExpression(inicjator) || ts.isAsExpression(inicjator) || ts.isNonNullExpression(inicjator)) {
        inicjator = inicjator.expression;
      }
      const prosty = ts.isIdentifier(inicjator) || ts.isPropertyAccessExpression(inicjator) || ts.isElementAccessExpression(inicjator);
      const wyborStalej =
        ts.isConditionalExpression(inicjator) ||
        (ts.isBinaryExpression(inicjator) &&
          (inicjator.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken ||
            inicjator.operatorToken.kind === ts.SyntaxKind.BarBarToken));
      if (prosty || wyborStalej) {
        for (const sciezka of lisciWyrazenia(inicjator, [])) dodaj(wezel.name.text, sciezka);
      }
    }
    ts.forEachChild(wezel, odwiedz);
  };
  odwiedz(zrodlo);
  return aliasy;
}

/** Rozwinięcie ścieżki przez aliasy pliku — wszystkie warianty (do 5 kroków, bez cykli). */
function rozwinAlias(sciezka, aliasy) {
  let biezace = [sciezka];
  for (let krok = 0; krok < 5; krok += 1) {
    let zmiana = false;
    const nastepne = [];
    for (const s of biezace) {
      const cele = aliasy[s[0]];
      if (!cele || cele.every((c) => c.length === 1 && c[0] === s[0])) {
        nastepne.push(s);
        continue;
      }
      for (const cel of cele) {
        if (cel.length === 1 && cel[0] === s[0]) nastepne.push(s);
        else {
          nastepne.push([...cel, ...s.slice(1)]);
          zmiana = true;
        }
      }
    }
    biezace = nastepne;
    if (!zmiana) break;
  }
  return biezace;
}

/** Ścieżka pliku modułu względnego (`./KreatorInfo` → `…/KreatorInfo.tsx`); obcy pakiet → null. */
function rozwiazModul(plik, specyfikator) {
  if (!specyfikator.startsWith('.')) return null;
  const baza = resolve(dirname(plik), specyfikator);
  for (const kandydat of [
    baza,
    `${baza}.tsx`,
    `${baza}.ts`,
    join(baza, 'index.tsx'),
    join(baza, 'index.ts'),
  ]) {
    if (existsSync(kandydat) && statSync(kandydat).isFile()) return kandydat;
  }
  return null;
}

/** Komponent funkcyjny: nazwa + mapa nazw lokalnych → nazwa właściwości (z destrukturyzacji
 *  pierwszego parametru albo `props.x`). */
function parametryKomponentu(funkcja) {
  const parametr = funkcja.parameters?.[0];
  if (!parametr) return null;
  if (ts.isObjectBindingPattern(parametr.name)) {
    const lokalne = {};
    for (const element of parametr.name.elements) {
      if (!ts.isIdentifier(element.name)) continue;
      const wlasciwosc = element.propertyName ? element.propertyName.getText() : element.name.text;
      lokalne[element.name.text] = wlasciwosc;
    }
    return { lokalne, obiekt: null };
  }
  if (ts.isIdentifier(parametr.name)) return { lokalne: {}, obiekt: parametr.name.text };
  return null;
}

/** Miejsce wyświetlenia wyrażenia JSX: dziecko elementu (`tekst`) albo atrybut opisowy. */
function miejsceWyswietlenia(wyrazenie, zrodlo) {
  const rodzic = wyrazenie.parent;
  if (rodzic && (ts.isJsxElement(rodzic) || ts.isJsxFragment(rodzic))) return 'tekst';
  if (rodzic && ts.isJsxAttribute(rodzic) && ATRYBUTY_OPISOWE.has(rodzic.name.getText(zrodlo))) {
    return `atrybut ${rodzic.name.getText(zrodlo)}`;
  }
  return null;
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
  const aliasy = aliasyPliku(zrodlo);
  // Importy nazwane pliku: nazwa lokalna → { nazwa eksportu, plik modułu }.
  const importyPliku = {};
  for (const instrukcja of zrodlo.statements) {
    if (!ts.isImportDeclaration(instrukcja) || !instrukcja.importClause) continue;
    const modul = rozwiazModul(plik, instrukcja.moduleSpecifier.text);
    const { name: domyslny, namedBindings } = instrukcja.importClause;
    if (domyslny) importyPliku[domyslny.text] = { nazwa: 'default', modul };
    if (namedBindings && ts.isNamedImports(namedBindings)) {
      for (const element of namedBindings.elements) {
        importyPliku[element.name.text] = { nazwa: (element.propertyName ?? element.name).text, modul };
      }
    }
  }
  const odwiedz = (wezel) => {
    if (ts.isPropertyAssignment(wezel) || (ts.isVariableDeclaration(wezel) && wezel.initializer)) {
      const wartosc = wartoscTekstowa(wezel.initializer, zrodlo);
      const sciezka = wartosc === null ? null : sciezkaWlasciwosci(wezel);
      if (wartosc !== null && sciezka !== null) {
        wynik.push({
          rodzaj: 'stala',
          plik,
          linia: pozycja(wezel.getStart(zrodlo)).line + 1,
          sciezka,
          wartosc,
        });
      }
    }
    // Komponent funkcyjny pliku: właściwości wyświetlane wprost (`{tytul}`, `{props.opis}`).
    const funkcja =
      ts.isFunctionDeclaration(wezel) && wezel.name
        ? { nazwa: wezel.name.text, cialo: wezel }
        : ts.isVariableDeclaration(wezel) &&
            ts.isIdentifier(wezel.name) &&
            wezel.initializer &&
            (ts.isArrowFunction(wezel.initializer) || ts.isFunctionExpression(wezel.initializer))
          ? { nazwa: wezel.name.text, cialo: wezel.initializer }
          : null;
    if (funkcja && /^[A-Z]/.test(funkcja.nazwa)) {
      const parametry = parametryKomponentu(funkcja.cialo);
      if (parametry) {
        const surowe = new Set();
        const przegladaj = (dziecko) => {
          if (ts.isJsxExpression(dziecko) && dziecko.expression && miejsceWyswietlenia(dziecko, zrodlo)) {
            for (const sciezka of lisciWyrazenia(dziecko.expression, [])) {
              if (sciezka.length === 1 && parametry.lokalne[sciezka[0]] !== undefined) {
                surowe.add(parametry.lokalne[sciezka[0]]);
              } else if (sciezka.length === 2 && sciezka[0] === parametry.obiekt) {
                surowe.add(sciezka[1]);
              }
            }
          }
          ts.forEachChild(dziecko, przegladaj);
        };
        ts.forEachChild(funkcja.cialo, przegladaj);
        if (surowe.size > 0) {
          wynik.push({ rodzaj: 'komponent', plik, nazwa: funkcja.nazwa, wlasciwosci: [...surowe].sort() });
        }
      }
    }
    // Reeksport (`export { KreatorInfo } from './KreatorInfo'`) — droga do definicji komponentu.
    if (ts.isExportDeclaration(wezel) && wezel.moduleSpecifier && wezel.exportClause && ts.isNamedExports(wezel.exportClause)) {
      const modul = rozwiazModul(plik, wezel.moduleSpecifier.text);
      for (const element of wezel.exportClause.elements) {
        wynik.push({
          rodzaj: 'reeksport',
          plik,
          nazwa: element.name.text,
          zrodlowa: (element.propertyName ?? element.name).text,
          modul,
        });
      }
    }
    // Użycie komponentu z właściwością: `<StanPanel komunikat={T.idle} />`.
    if (ts.isJsxAttribute(wezel) && wezel.initializer) {
      const otwarcie = wezel.parent?.parent;
      if (otwarcie && (ts.isJsxOpeningElement(otwarcie) || ts.isJsxSelfClosingElement(otwarcie)) && ts.isIdentifier(otwarcie.tagName) && /^[A-Z]/.test(otwarcie.tagName.text)) {
        const znacznik = otwarcie.tagName.text;
        const import_ = importyPliku[znacznik];
        const sciezki = ts.isJsxExpression(wezel.initializer) && wezel.initializer.expression
          ? lisciWyrazenia(wezel.initializer.expression, []).flatMap((s) => rozwinAlias(s, aliasy))
          : [];
        const wartosc = ts.isStringLiteral(wezel.initializer) ? wezel.initializer.text : null;
        if (sciezki.length > 0 || wartosc !== null) {
          const start = pozycja(wezel.getStart(zrodlo));
          wynik.push({
            rodzaj: 'uzycie',
            plik,
            linia: start.line + 1,
            wiersz: wiersze[start.line] ?? '',
            komponent: import_ ? import_.nazwa : znacznik,
            modul: import_ ? import_.modul : plik,
            wlasciwosc: wezel.name.getText(zrodlo),
            sciezki,
            wartosc,
          });
        }
      }
    }
    if (ts.isJsxExpression(wezel) && wezel.expression) {
      const miejsce = miejsceWyswietlenia(wezel, zrodlo);
      if (miejsce !== null) {
        const start = pozycja(wezel.getStart(zrodlo));
        for (const sciezka of lisciWyrazenia(wezel.expression, []).flatMap((s) => rozwinAlias(s, aliasy))) {
          wynik.push({
            rodzaj: 'wyswietlenie',
            plik,
            linia: start.line + 1,
            wiersz: wiersze[start.line] ?? '',
            miejsce,
            sciezka,
          });
        }
      }
    }
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
