/**
 * S9-7 (audyt `docs/sld/AUDYT_JAKOSCI_SLD_2026-08.md` C-4/C-6) — TYPOGRAFIA
 * EKRANOWA i SKRACANIE ZACHOWUJĄCE CZŁON ROZRÓŻNIAJĄCY.
 *
 * CO ORZEKA (i dlaczego nie da się tego udowodnić przykładem z karty):
 *  (a) napis APARATU ARKUSZA ma STAŁY rozmiar ekranowy — sprawdzane jako
 *      ILOCZYN {klasa typograficzna} × {skala kamery od dolnego po górny
 *      kraniec}, bo błąd typu „kompensujemy tylko poniżej 1" schowałby się w
 *      pojedynczym przykładzie;
 *  (b) każdy skrót jest JAWNIE OZNACZONY i preferuje formy zachowujące człon
 *      rozróżniający — sprawdzane jako ILOCZYN {rodzaj etykiety rysunku} ×
 *      {dostępna szerokość od pełnej do jednego piksela}, bo audyt zmierzył
 *      formy („S400", „S630"), które powstają dopiero przy CIASNYCH
 *      szerokościach i wyglądają jak kompletna dana techniczna.
 */
import { describe, expect, it } from 'vitest';

import {
  LABEL_TYPOGRAPHY,
  MIN_READABLE_LABEL_SCREEN_PX,
  MIN_TEXT_SCREEN_PX,
  measureTextWidth,
  minReadableFontSize,
  screenFixedFontSize,
  screenFixedLength,
  shortenPreservingIdentity,
  type LabelClass,
} from '../text';

const KLASY: readonly LabelClass[] = ['t1', 't2', 't3', 't4'];
/** Skale od dolnego krańca kamery (`MIN_SCALE`) po górny (`MAX_SCALE`). */
const SKALE = [0.05, 0.13, 0.51, 1, 2, 8];

describe('S9-7 (a) — aparat arkusza w pikselach EKRANU', () => {
  it('rozmiar EKRANOWY jest stały dla KAŻDEJ klasy i KAŻDEJ skali (iloczyn cech)', () => {
    for (const cls of KLASY) {
      for (const scale of SKALE) {
        const naEkranie = screenFixedFontSize(cls, scale) * scale;
        expect(naEkranie).toBeCloseTo(LABEL_TYPOGRAPHY[cls].fontSize, 9);
      }
    }
  });

  it('każda klasa aparatu arkusza trzyma twardą podłogę odbioru na każdej skali', () => {
    for (const cls of KLASY) {
      for (const scale of SKALE) {
        expect(screenFixedFontSize(cls, scale) * scale).toBeGreaterThanOrEqual(MIN_TEXT_SCREEN_PX);
      }
    }
  });

  it('odstępy aparatu arkusza kompensowane TĄ SAMĄ regułą co pismo (inaczej napis wchodzi na ramkę)', () => {
    for (const scale of SKALE) {
      expect(screenFixedLength(10, scale) * scale).toBeCloseTo(10, 9);
      expect(screenFixedLength(6, scale) * scale).toBeCloseTo(6, 9);
    }
  });

  it('skala niewiarygodna (0/ujemna/NaN) NIE zmienia rozmiaru — brak pomiaru nie jest dowodem', () => {
    for (const zla of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(screenFixedFontSize('t1', zla)).toBe(LABEL_TYPOGRAPHY.t1.fontSize);
      expect(screenFixedLength(10, zla)).toBe(10);
    }
  });

  it('podłoga odbioru (8 px) leży PONIŻEJ progu czytelności (9 px) — zapas, nie tożsamość', () => {
    expect(MIN_TEXT_SCREEN_PX).toBeLessThan(MIN_READABLE_LABEL_SCREEN_PX);
    // Treść rysunku celuje w próg czytelności — więc spełnia podłogę z zapasem.
    for (const cls of KLASY) {
      for (const scale of SKALE) {
        expect(minReadableFontSize(cls, scale) * scale).toBeGreaterThanOrEqual(MIN_TEXT_SCREEN_PX);
      }
    }
  });
});

/** Realne kształty etykiet rysunku v3 (po jednym z każdej rodziny gramatyki). */
const ETYKIETY: readonly { readonly opis: string; readonly text: string }[] = [
  {
    opis: 'przęsło (relacja · typ · Un · długość)',
    text: 'S07 ↔ S08 · Linia napowietrzna Al 120 mm² · Un=20 kV · l = 150 m',
  },
  { opis: 'opis sekcji z identyfikatorem stacji', text: 'S12 · Sekcja 1 · 15 kV' },
  { opis: 'nazwa GPZ z napięciami', text: 'GPZ Referencyjny 15 kV · 110/15 kV' },
  { opis: 'nazwa stacji z numerem na końcu', text: 'Stacja SN-01' },
  { opis: 'rola pola (bez ogona rozróżniającego)', text: 'pole liniowe' },
  { opis: 'kod stacji (jeden wyraz)', text: 'S400' },
  { opis: 'źródło DER (wartość + jednostka na końcu)', text: 'PV 500 kW' },
];

describe('S9-7 (b) — skracanie zachowujące człon rozróżniający', () => {
  it('ILOCZYN {rodzaj etykiety} × {dostępna szerokość}: nigdy nie przekracza szerokości, każdy skrót jawnie oznaczony', () => {
    for (const { opis, text } of ETYKIETY) {
      const fontSize = 11;
      const pelna = measureTextWidth(text, fontSize);
      // Szerokość ≤ 0 jest pomiarem NIEWIARYGODNYM (osobna asercja niżej),
      // więc iloczyn cech idzie po szerokościach realnych.
      for (let w = pelna + 20; w >= 1; w -= 3) {
        const wynik = shortenPreservingIdentity(text, fontSize, w);
        if (wynik.length === 0) continue;
        expect(measureTextWidth(wynik, fontSize), `${opis} @${w}`).toBeLessThanOrEqual(w);
        // Nigdy fragment wyrazu BEZ znaku skrócenia: każdy wynik krótszy od
        // pełnego tekstu musi nieść wielokropek (jawny znak, że to skrót).
        if (wynik !== text) expect(wynik, `${opis} @${w}`).toContain('…');
        // Skrót nigdy nie kończy się urwanym wyrazem BEZ wielokropka —
        // dokładnie ta forma („S400" z „S4001") jest wadą nazwaną w audycie.
        expect(/[^…\s]$/.test(wynik) && wynik !== text && !wynik.includes('…')).toBe(false);
      }
    }
  });

  it('tekst mieszczący się w całości NIE jest ruszany (skracanie jest awaryjne, nie domyślne)', () => {
    for (const { text } of ETYKIETY) {
      expect(shortenPreservingIdentity(text, 11, measureTextWidth(text, 11))).toBe(text);
      expect(shortenPreservingIdentity(text, 11, 10_000)).toBe(text);
    }
  });

  it('człony odpadają od KOŃCA — pierwszy człon (rozróżniający) przeżywa najdłużej', () => {
    const text = 'S07 ↔ S08 · Linia napowietrzna Al 120 mm² · Un=20 kV · l = 150 m';
    // Szerokość na dokładnie pierwszy człon + znak skrócenia.
    const w = measureTextWidth('S07 ↔ S08 …', 11);
    expect(shortenPreservingIdentity(text, 11, w)).toBe('S07 ↔ S08 …');
    // Szerokość na dwa człony — drugi też zostaje.
    const w2 = measureTextWidth('S07 ↔ S08 · Linia napowietrzna Al 120 mm² …', 11);
    expect(shortenPreservingIdentity(text, 11, w2)).toBe('S07 ↔ S08 · Linia napowietrzna Al 120 mm² …');
  });

  it('nazwa z numerem na końcu zachowuje OGON rozróżniający („Stacja SN-…" ×20 to nie jest rozróżnienie)', () => {
    const text = 'Stacja SN-01';
    // Ciasno: nie mieści się całość, ale mieści się głowa + ogon.
    const wynik = shortenPreservingIdentity(text, 11, measureTextWidth('S…SN-01', 11));
    expect(wynik).toContain('SN-01');
    expect(wynik).toContain('…');
  });

  it('sam ogon „wartość + jednostka" NIE jest pokazywany (czyta się jak dana techniczna, nie jak nazwa)', () => {
    const text = 'PV 500 kW';
    // Szerokość, na której zmieściłoby się „…500 kW", ale nie „P…500 kW".
    const w = measureTextWidth('…500 kW', 11);
    const wynik = shortenPreservingIdentity(text, 11, w);
    expect(wynik.startsWith('…5')).toBe(false);
    // Zamiast tego forma z wyrazów wiodących albo uczciwy brak.
    expect(wynik === '' || wynik.startsWith('PV')).toBe(true);
  });

  it('człon JEDNOWYRAZOWY skraca się WYŁĄCZNIE ze znakiem („S4…"), nigdy do formy udającej całość („S400")', () => {
    // Wadą z audytu nie jest sam fragment, tylko fragment BEZ ZNAKU: „S400"
    // (z „S4001") czyta się jak moc transformatora. Ten sam fragment ze
    // znakiem („S4…") mówi wprost, że jest skrótem.
    const wynik = shortenPreservingIdentity('S4001', 11, measureTextWidth('S40', 11));
    expect(wynik).toBe('S4…');
    expect(wynik).not.toBe('S400');
    // Poniżej szerokości JEDNEGO znaku z wielokropkiem — uczciwy brak.
    expect(shortenPreservingIdentity('S4001', 11, 1)).toBe('');
  });

  it('szerokość niewiarygodna (0/ujemna/NaN) zwraca tekst pełny — brak pomiaru nie skraca', () => {
    for (const zla of [0, -5, Number.NaN]) {
      expect(shortenPreservingIdentity('Stacja SN-01', 11, zla)).toBe('Stacja SN-01');
    }
  });
});
