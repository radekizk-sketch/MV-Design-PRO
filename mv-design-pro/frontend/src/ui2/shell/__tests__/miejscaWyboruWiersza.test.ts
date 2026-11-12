// @vitest-environment node
/**
 * Inwentarz miejsc wyboru wiersza (karta INSPEKTOR-I-NAWIGACJA, P1 powrót: „wszystkie miejsca
 * wyboru wiersza sprawdzone testem, nie trzy demonstracyjne”).
 *
 * Zachowanie powrotu (wiersz, sortowanie, przewinięcie, zakładka) jest JEDNYM mechanizmem —
 * `useWyborPowrotu` / `useStanPrzywracany` (`powrotZeSchematu.ts`), przypiętym zachowaniowo
 * w `powrotZeSchematu.test.tsx` (w tym sortowanie tabeli wspólnego wzorca). Ten test przypina
 * KLASĘ: każde miejsce, które przekazuje tabeli wybrany wiersz (`wybranyWiersz={…}`), bierze
 * go z tego mechanizmu, a klucze stanu są UNIKALNE (dwa ekrany pod jednym kluczem
 * przywracałyby sobie nawzajem wiersz). Wyjątki są jawne i uzasadnione: komponenty
 * przekazujące wybór z propsów (właściciel stanu jest wyżej) i panel dolny, którego wybranym
 * wierszem jest zaznaczenie modelu (przywraca je selekcja, nie stan ekranu).
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const UI2 = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

function pliki(katalog: string): string[] {
  const wynik: string[] = [];
  for (const nazwa of readdirSync(katalog)) {
    const sciezka = join(katalog, nazwa);
    if (statSync(sciezka).isDirectory()) {
      if (nazwa !== '__tests__') wynik.push(...pliki(sciezka));
    } else if (/\.tsx?$/.test(nazwa)) {
      wynik.push(sciezka);
    }
  }
  return wynik.sort();
}

const bezKomentarzy = (t: string) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');

/** Komponenty przekazujące wybór z propsów — stan trzyma ekran-właściciel (z `useWyborPowrotu`). */
const PRZEKAZUJA_Z_PROPSOW = new Set(['wyniki/wzorzec/EkranAnalizy.tsx', 'wyniki/rozplyw/TabelaSzyn.tsx', 'wyniki/rozplyw/TabelaGalezi.tsx']);
/** Wybrany wiersz = zaznaczenie modelu (store selekcji), przywracane przez selekcję. */
const WYBOR_Z_SELEKCJI = new Set(['shell/panelDolny/ZakladkaWyniki.tsx']);

const ZRODLA = pliki(UI2).map((p) => ({ plik: relative(UI2, p), tresc: bezKomentarzy(readFileSync(p, 'utf8')) }));
const MIEJSCA = ZRODLA.filter((z) => /wybranyWiersz=\{/.test(z.tresc));
const KLUCZE = ZRODLA.flatMap((z) => [...z.tresc.matchAll(/useWyborPowrotu\(\s*'([^']+)'/g)].map((m) => ({ plik: z.plik, klucz: m[1] })));

describe('miejsca wyboru wiersza: jeden mechanizm powrotu, unikalne klucze', () => {
  it('inwentarz niepusty i znany (każde miejsce sklasyfikowane)', () => {
    // Wiązania tabeli (jeden plik może mieć kilka tabel: jakość — pięć sekcji, rozpływ — dwie).
    const wiazania = MIEJSCA.reduce((n, m) => n + [...m.tresc.matchAll(/wybranyWiersz=\{/g)].length, 0);
    expect(wiazania).toBeGreaterThanOrEqual(18);
    for (const wyjatek of [...PRZEKAZUJA_Z_PROPSOW, ...WYBOR_Z_SELEKCJI]) {
      expect(MIEJSCA.map((m) => m.plik), `wyjątek ${wyjatek} nadal istnieje`).toContain(wyjatek);
    }
  });

  it.each(MIEJSCA.map((m) => [m.plik, m] as const))('%s: wybrany wiersz z mechanizmu powrotu', (plik, miejsce) => {
    if (PRZEKAZUJA_Z_PROPSOW.has(plik)) {
      // Przekazuje wybór z propsów — bez własnego stanu wyboru (nie `useState`).
      expect(miejsce.tresc).not.toMatch(/const \[wybranyWiersz,\s*\w+\]\s*=\s*useState\b/);
      return;
    }
    if (WYBOR_Z_SELEKCJI.has(plik)) {
      expect(miejsce.tresc).toMatch(/useSelectionStore\(\(s\) => s\.selectedElement\?\.id/);
      return;
    }
    expect(miejsce.tresc, `${plik} nie używa useWyborPowrotu`).toMatch(/useWyborPowrotu\(\s*'wybor:/);
  });

  it('klucze stanu wyboru są unikalne w całej warstwie', () => {
    const powtorzone = KLUCZE.filter((k, i) => KLUCZE.findIndex((x) => x.klucz === k.klucz) !== i);
    expect(powtorzone).toEqual([]);
    expect(KLUCZE.filter((k) => k.klucz.startsWith('wybor:')).length).toBeGreaterThanOrEqual(18);
  });
});
