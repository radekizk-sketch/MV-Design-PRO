import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { KartaTechniczna } from '../KartaTechniczna';
import { poleParametrow } from '../adapters/katalogAdapter';
import {
  FIXTURE_APARATY,
  FIXTURE_FALOWNIKI,
  FIXTURE_TRANSFORMATORY,
} from './fixtures';

describe('KartaTechniczna', () => {
  it('renderuje nagłówek z nazwą, kategorią i producentem', () => {
    const { container } = render(
      <KartaTechniczna
        pozycja={FIXTURE_TRANSFORMATORY[0]}
        kategoria="TRANSFORMATOR"
        poleParametrow={poleParametrow('TRANSFORMATOR')}
      />,
    );
    const text = container.textContent ?? '';
    expect(text).toContain('TOn 630 15,75/0,42 kV Dyn5');
    expect(text).toContain('Transformatory');
    expect(text).toContain('ABB');
  });

  it('renderuje parametry z definicjami i wartościami mono', () => {
    const { container } = render(
      <KartaTechniczna
        pozycja={FIXTURE_TRANSFORMATORY[0]}
        kategoria="TRANSFORMATOR"
        poleParametrow={poleParametrow('TRANSFORMATOR')}
      />,
    );
    const text = container.textContent ?? '';
    expect(text).toContain('Napięcie zwarcia');
    expect(text).toContain('6,00 %');
    expect(text).toContain('Moc znamionowa');
    expect(text).toContain('Grupa połączeń');
    expect(text).toContain('Dyn5');
  });

  it('renderuje sekcję pochodzenia danych ze źródłem i statusem katalogu', () => {
    const { container } = render(
      <KartaTechniczna
        pozycja={FIXTURE_TRANSFORMATORY[0]}
        kategoria="TRANSFORMATOR"
        poleParametrow={poleParametrow('TRANSFORMATOR')}
      />,
    );
    const text = container.textContent ?? '';
    expect(text).toContain('Pochodzenie danych');
    expect(text).toContain('Katalog transformatorow MV-DESIGN-PRO / IEC 60076-1');
    expect(text).toContain('Produkcyjny');
    expect(text).toContain('Częściowo zweryfikowany');
  });

  it('renderuje badge rodzaju aparatu (equipment_kind → PL)', () => {
    const { container } = render(
      <KartaTechniczna
        pozycja={FIXTURE_APARATY[0]}
        kategoria="APARAT"
        poleParametrow={poleParametrow('APARAT')}
      />,
    );
    expect(container.textContent ?? '').toContain('Wyłącznik');
  });

  it('renderuje badge rodzaju falownika (kind → PL) i pomija pola bez wartości', () => {
    const { container } = render(
      <KartaTechniczna
        pozycja={FIXTURE_FALOWNIKI[0]}
        kategoria="FALOWNIK"
        poleParametrow={poleParametrow('FALOWNIK')}
      />,
    );
    const text = container.textContent ?? '';
    expect(text).toContain('Fotowoltaika');
    // e_kwh nie występuje w tej pozycji PV → wiersz „Pojemność energetyczna" pominięty
    expect(text).not.toContain('Pojemność energetyczna magazynu');
  });

  it('pokazuje „wkrótce", gdy brak źródła danych w pozycji', () => {
    const bezZrodla = { id: 'x1', name: 'Typ bez metadanych', uk_percent: 6 };
    const { container } = render(
      <KartaTechniczna pozycja={bezZrodla} kategoria="TRANSFORMATOR" poleParametrow={['uk_percent']} />,
    );
    expect(container.textContent ?? '').toContain('wkrótce');
  });
});
