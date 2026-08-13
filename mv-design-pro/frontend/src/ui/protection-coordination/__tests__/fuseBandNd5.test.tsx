/**
 * Karta N-D5-FUSE — bezpiecznik nie udaje przekaźnika w warstwie UI.
 *
 * TŁO POMIAROWE: preset „Bezpiecznik SN" podawał `standard: 'FUSE', variant: 'EI',
 * time_multiplier: 1.0` — trzy nastawy PRZEKAŹNIKA, których bezpiecznik topikowy
 * nie ma. Backend nie miał dla normy „FUSE" wzoru, więc po cichu liczył krzywą
 * IDMT IEC 60255 i podpisywał ją `FUSE_EI`. Jeden klik w preset dawał projektantowi
 * fabrykat fizyki podpisany jako bezpiecznik.
 *
 * POKRYCIE = ILOCZYN CECH: pozycja z podstawą / bez podstawy × ścieżka
 * (dane presetu, konwersja na wykres, legenda).
 */

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { DEVICE_TEMPLATES, LABELS, maPodstawePrzekaznikowa } from '../types';
import type { TCCCurve } from '../types';
import { TccChart } from '../TccChart';

const KRZYWA_PRZEKAZNIKA: TCCCurve = {
  device_id: 'dev-relay',
  device_name: 'Przekaznik pola',
  curve_type: 'IEC_SI',
  pickup_current_a: 100,
  time_multiplier: 0.2,
  color: '#2563eb',
  podstawa_kod: 'KRZYWA_PRZEKAZNIKOWA',
  powod_pl: null,
  points: [
    { current_a: 110, current_multiple: 1.1, time_s: 7.3 },
    { current_a: 200, current_multiple: 2.0, time_s: 1.2 },
  ],
};

const POWOD_BEZPIECZNIKA =
  'Bezpiecznik topikowy nie ma charakterystyki przekaźnikowej IDMT wg IEC 60255. ' +
  'Jego pasmo topikowe pochodzi z karty katalogowej wg IEC 60282-1.';

const POZYCJA_BEZPIECZNIKA: TCCCurve = {
  device_id: 'dev-fuse',
  device_name: 'Bezpiecznik SN',
  curve_type: 'BRAK_CHARAKTERYSTYKI',
  pickup_current_a: 63,
  time_multiplier: 0,
  color: '#dc2626',
  podstawa_kod: 'BRAK_PASMA_BEZPIECZNIKA',
  powod_pl: POWOD_BEZPIECZNIKA,
  points: [],
};

describe('Karta N-D5-FUSE — preset bezpiecznika', () => {
  const preset = DEVICE_TEMPLATES.find((t) => t.device_type === 'FUSE');

  it('preset bezpiecznika istnieje (projektant nadal może go postawić)', () => {
    expect(preset).toBeDefined();
  });

  it('preset NIE podaje nastaw charakterystyki przekaźnikowej', () => {
    // Bezpiecznik nie ma normy krzywej, wariantu ani mnożnika czasowego TMS.
    // Gdyby preset je podawał, backend znów miałby z czego zbudować fabrykat.
    expect(preset?.settings.stage_51.curve_settings).toBeUndefined();
  });

  it('żaden preset typu FUSE nie deklaruje normy ani TMS', () => {
    // KLASA, nie instancja: sprawdzamy WSZYSTKIE presety bezpiecznikowe,
    // nie tylko ten jeden z karty.
    const bezpieczniki = DEVICE_TEMPLATES.filter((t) => t.device_type === 'FUSE');
    expect(bezpieczniki.length).toBeGreaterThan(0);
    for (const szablon of bezpieczniki) {
      expect(szablon.settings.stage_51.curve_settings).toBeUndefined();
    }
  });

  it('presety przekaźnikowe ZACHOWUJĄ nastawy krzywej', () => {
    // Druga połowa pary — naprawa nie może wyciszyć urządzeń z prawem do IDMT.
    const przekaznikowe = DEVICE_TEMPLATES.filter((t) => t.device_type !== 'FUSE');
    expect(przekaznikowe.length).toBeGreaterThan(0);
    for (const szablon of przekaznikowe) {
      expect(szablon.settings.stage_51.curve_settings).toBeDefined();
      expect(szablon.settings.stage_51.curve_settings?.standard).not.toBe('FUSE');
    }
  });
});

describe('Karta N-D5-FUSE — rozpoznanie podstawy krzywej', () => {
  it('rozpoznaje pozycję z podstawą i bez', () => {
    expect(maPodstawePrzekaznikowa(KRZYWA_PRZEKAZNIKA)).toBe(true);
    expect(maPodstawePrzekaznikowa(POZYCJA_BEZPIECZNIKA)).toBe(false);
  });

  it('starszy ładunek bez pola traktuje jako krzywą przekaźnikową', () => {
    const bezPola = { ...KRZYWA_PRZEKAZNIKA };
    delete (bezPola as Partial<TCCCurve>).podstawa_kod;
    expect(maPodstawePrzekaznikowa(bezPola)).toBe(true);
  });
});

describe('Karta N-D5-FUSE — wykres TCC', () => {
  it('legenda pokazuje bezpiecznik jawnie, bez etykiety wariantu', () => {
    render(<TccChart curves={[KRZYWA_PRZEKAZNIKA, POZYCJA_BEZPIECZNIKA]} faultMarkers={[]} />);

    // Bezpiecznik NIE znika z ekranu — cicha nieobecność byłaby innym kłamstwem.
    expect(screen.getByText('Bezpiecznik SN')).toBeInTheDocument();
    expect(screen.getByText(`(${LABELS.brakCharakterystyki})`)).toBeInTheDocument();

    // Przekaźnik zachowuje swoją etykietę normy.
    expect(screen.getByText('(IEC_SI)')).toBeInTheDocument();

    // Etykieta fabrykatu NIE pojawia się nigdzie.
    expect(screen.queryByText(/FUSE_/)).not.toBeInTheDocument();
  });

  it('powód braku jest dostępny przy pozycji bezpiecznika', () => {
    render(<TccChart curves={[POZYCJA_BEZPIECZNIKA]} faultMarkers={[]} />);
    const pozycja = screen.getByTitle(POWOD_BEZPIECZNIKA);
    expect(pozycja).toBeInTheDocument();
  });
});
