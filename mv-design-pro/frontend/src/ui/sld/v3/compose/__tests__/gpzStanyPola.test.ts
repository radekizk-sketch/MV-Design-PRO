/**
 * Karta GPZ-H5-SLD pkt 3c (R13) i 3b (R15) — cztery stany „brak" pola GPZ oraz kontekst
 * rodziny rozpływu bloku GPZ.
 *
 * Iloczyn 3c: stan danych pola {rezerwowe, bez odpływu, bez aparatu, kompletne} × bieg
 * rozpływu {brak, jest} × wartości pola w wyniku {brak, są}. Reguła: wartości z wyniku mają
 * pierwszeństwo; bez wartości — stan danych pola; bez stanu danych i bez biegu — „obliczenie
 * niewykonane"; bieg jest, wartości brak, pole kompletne — kolumny „brak" (null). Stan
 * „bez aparatu" nie daje napisu wiersza (etap 2, wymaganie 7 — zbiorczo w karcie GPZ).
 *
 * Iloczyn 3b: payload schematu {brak, rozpływ, zwarcie} × payload rodziny rozpływu {brak,
 * rozpływ}: blok GPZ czyta rozpływ schematu, a gdy schemat pokazuje inny bieg — aktywny
 * bieg rodziny rozpływu, oznaczony w tytule tabeli.
 */
import { describe, expect, it } from 'vitest';

import type { RawOverlayPayload } from '../../../../sld-overlay/rawResultOverlayStore';
import { buildGpzWynikiOverlay, payloadWynikowGpz } from '../../canvas/gpzWyniki';
import {
  stanDanychPolaGpz,
  TEKST_STANU_POLA_GPZ,
  tekstStanuWartosciPolaGpz,
  tekstTytuluTabeliGpz,
} from '../gpzAdnotacje';

const POLA = {
  rezerwowe: { reserve: 'rezerwowe' as const, primaryDevices: [{}] },
  bez_odplywu: { reserve: 'wolne' as const, primaryDevices: [{}] },
  bez_aparatu: { primaryDevices: [] },
  kompletne: { primaryDevices: [{}] },
};

describe('stan danych pola GPZ × bieg × wartości (3c)', () => {
  it('stan danych z rekordu pola; brak `primaryDevices` = bez aparatu', () => {
    expect(stanDanychPolaGpz(POLA.rezerwowe)).toBe('rezerwowe');
    expect(stanDanychPolaGpz(POLA.bez_odplywu)).toBe('bez_odplywu');
    expect(stanDanychPolaGpz(POLA.bez_aparatu)).toBe('bez_aparatu');
    expect(stanDanychPolaGpz({})).toBe('bez_aparatu');
    expect(stanDanychPolaGpz(POLA.kompletne)).toBeNull();
  });

  for (const [nazwa, pole] of Object.entries(POLA)) {
    for (const maWynik of [false, true]) {
      for (const maWartosci of maWynik ? [false, true] : [false]) {
        it(`${nazwa} · bieg ${maWynik ? 'jest' : 'brak'} · wartości ${maWartosci ? 'są' : 'brak'}`, () => {
          const stan = stanDanychPolaGpz(pole);
          const napis = tekstStanuWartosciPolaGpz(stan, maWynik, maWartosci);
          if (maWartosci) expect(napis).toBeNull();
          // Etap 2, wymaganie 7: „bez aparatu" raz przy obiekcie i raz zbiorczo w karcie GPZ,
          // nie w każdym wierszu — wiersz takiego pola mówi o stanie obliczenia.
          else if (stan !== null && stan !== 'bez_aparatu') expect(napis).toBe(TEKST_STANU_POLA_GPZ[stan]);
          else if (!maWynik) expect(napis).toBe(TEKST_STANU_POLA_GPZ.niewykonane);
          else expect(napis).toBeNull();
        });
      }
    }
  }

  it('cztery stany mają cztery RÓŻNE napisy, żaden nie jest gołym „brak"', () => {
    const napisy = Object.values(TEKST_STANU_POLA_GPZ);
    expect(new Set(napisy).size).toBe(4);
    expect(napisy).not.toContain('brak');
  });
});

function payload(run: string, analysis: string): RawOverlayPayload {
  return {
    run_id: run,
    analysis_type: analysis,
    elements: {
      'gpz/bay/1': {
        ref_id: 'gpz/bay/1',
        kind: 'bay',
        badges: [],
        severity: 'INFO',
        metrics: { P_MW: { code: 'P_MW', value: 2.5, unit: 'MW', format_hint: 'fixed2' } },
      },
    },
  };
}

describe('kontekst rodziny rozpływu bloku GPZ (3b)', () => {
  const rozplywA = payload('rozplyw-A', 'load_flow');
  const rozplywRodziny = payload('rozplyw-rodziny', 'load_flow');
  const zwarcieB = payload('zwarcie-B', 'short_circuit');

  it.each([
    ['schemat: brak · rodzina: brak', null, null, null, false],
    ['schemat: brak · rodzina: rozpływ', null, rozplywRodziny, 'rozplyw-rodziny', false],
    ['schemat: rozpływ · rodzina: brak', rozplywA, null, 'rozplyw-A', false],
    ['schemat: rozpływ · rodzina: rozpływ', rozplywA, rozplywRodziny, 'rozplyw-A', false],
    ['schemat: zwarcie · rodzina: brak', zwarcieB, null, null, false],
    ['schemat: zwarcie · rodzina: rozpływ', zwarcieB, rozplywRodziny, 'rozplyw-rodziny', true],
  ] as const)('%s', (_n, schemat, rodzina, oczekiwanyBieg, innyBieg) => {
    const wybor = payloadWynikowGpz(schemat, rodzina);
    expect(wybor.payload?.run_id ?? null).toBe(oczekiwanyBieg);
    expect(wybor.zBieguSpozaWidoku).toBe(innyBieg);
    const overlay = buildGpzWynikiOverlay(wybor.payload, wybor.zBieguSpozaWidoku);
    expect(overlay === null).toBe(oczekiwanyBieg === null);
    if (overlay) {
      expect(overlay.pola['gpz/bay/1'].p).not.toBeNull();
      expect(overlay.zBieguSpozaWidoku).toBe(innyBieg);
    }
    const tytul = tekstTytuluTabeliGpz(overlay !== null, false, overlay?.zBieguSpozaWidoku ?? false);
    expect(tytul.includes('z innego biegu')).toBe(innyBieg);
    expect(tytul.includes('brak wyniku rozpływu mocy')).toBe(oczekiwanyBieg === null);
  });
});

describe('tytuł karty pól GPZ — iloczyn maWynik × nieaktualny × innyBieg', () => {
  // Karta GPZ-H5-SLD etap 2: tytuł stoi w karcie GPZ inspektora, nie w geometrii ramy, więc
  // dawny limit szerokości (wariant „inny bieg" poszerzał ramę) nie ma już przedmiotu. Zostaje
  // treść: stan wyniku jawnie w tytule.
  it.each([
    [false, false, false],
    [false, false, true],
    [false, true, false],
    [false, true, true],
    [true, false, false],
    [true, false, true],
    [true, true, false],
    [true, true, true],
  ] as const)('maWynik=%s nieaktualny=%s innyBieg=%s', (maWynik, nieaktualny, innyBieg) => {
    const tytul = tekstTytuluTabeliGpz(maWynik, nieaktualny, innyBieg);
    expect(tytul.includes('nieaktualny')).toBe(maWynik && nieaktualny);
    expect(tytul.includes('z innego biegu')).toBe(maWynik && innyBieg);
    expect(tytul.includes('brak wyniku rozpływu mocy')).toBe(!maWynik);
  });
});
