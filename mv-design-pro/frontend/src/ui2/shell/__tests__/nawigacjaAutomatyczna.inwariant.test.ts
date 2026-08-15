/*
 * PRZYPIĘCIE DEKLARACJI (reguła KLASA, NIE INSTANCJA §4: „deklaracja bez testu =
 * fałszywa pewność"). Karta S9-11 stawia mocne zdanie:
 *
 *   „Tor wykonania przebiegu NIE nawiguje. Bieg zostawia projektanta tam,
 *    gdzie jest — bez wyjątku."
 *
 * HISTORIA KLASY (W-3 → W-4 audytu `docs/sld/AUDYT_JAKOSCI_SLD_2026-08.md`):
 *  - przed S9-3 tor biegu kończył się bezwarunkowym `navigateToResults` —
 *    odłożony skok depczący nawigację projektanta (W-3, waga 3),
 *  - S9-3 ograniczył skok warunkiem „miejsce pracy niezmienione" — ale w
 *    NAJCZĘSTSZYM scenariuszu (bieg bez ruchu myszy) nadal wyrywał projektanta
 *    ze schematu i odmontowywał kanwę (W-4, waga 2),
 *  - S9-11 usuwa skok w całości: gotowość wyniku sygnalizuje komunikat i
 *    samoodświeżająca się nakładka (most S9-2), a wejście na wyniki jest
 *    wyłącznie JAWNYM klikiem (nawigacja przestrzeni, pas „następny krok",
 *    deep-linki K3).
 *
 * Bez tego testu wystarczy, że ktoś dopisze w torze biegu jedno `navigateTo…`
 * albo `przejdzDoPrzestrzeni`, a pułapka nawigacji wraca w tej samej postaci —
 * i to bez czerwonego testu, bo scenariusz wyścigu przechodziłby przez nową,
 * nieosłoniętą ścieżkę. Test czyta ŹRÓDŁO toru wykonania przebiegu i pilnuje,
 * że nie ma w nim ŻADNEJ formy nawigacji.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const PLIK_TORU = join(process.cwd(), 'src', 'ui2', 'spaces', 'obliczenia', 'uruchomObliczenie.ts');
const ZRODLO = readFileSync(PLIK_TORU, 'utf8');

/** Linie kodu (bez komentarzy) — deklaracje intencji w komentarzach są dozwolone. */
function linieKodu(zrodlo: string): string[] {
  let wBloku = false;
  const wynik: string[] = [];
  for (const linia of zrodlo.split('\n')) {
    const t = linia.trim();
    if (wBloku) {
      if (t.includes('*/')) wBloku = false;
      continue;
    }
    if (t.startsWith('/*')) {
      if (!t.includes('*/')) wBloku = true;
      continue;
    }
    if (t.startsWith('//') || t.startsWith('*')) continue;
    wynik.push(linia);
  }
  return wynik;
}

describe('S9-11 — tor wykonania przebiegu nie nawiguje (W-3/W-4)', () => {
  const kod = linieKodu(ZRODLO);

  it('zero wywołań nawigacji tras (navigateTo…)', () => {
    const wywolania = kod.filter((linia) => /\bnavigateTo\w*\s*\(/.test(linia));
    expect(wywolania).toEqual([]);
  });

  it('zero przejść przestrzeni powłoki (przejdzDoPrzestrzeni / setActiveSpace)', () => {
    const wywolania = kod.filter(
      (linia) => /\bprzejdzDoPrzestrzeni\s*\(/.test(linia) || /\bsetActiveSpace\s*\(/.test(linia),
    );
    expect(wywolania).toEqual([]);
  });

  it('zero zapisu trasy (window.location.hash / history.pushState)', () => {
    const wywolania = kod.filter(
      (linia) => /location\.hash\s*=/.test(linia) || /history\.(push|replace)State/.test(linia),
    );
    expect(wywolania).toEqual([]);
  });

  it('kontrola dodatnia: bieg wiąże świeży przebieg z powłoką (setActiveRun) — jawny klik otwiera JEGO wyniki', () => {
    expect(ZRODLO).toMatch(/setActiveRun\s*\(\s*run\.id\s*\)/);
  });
});
