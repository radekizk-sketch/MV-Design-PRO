/*
 * Testy mapy procesu. Kluczowa asercja karty: DWUSTRONNA RÓWNOŚĆ mapy
 * z kanonem etapów — każdy etap kanonu jest na mapie i nic poza kanonem na
 * mapie nie występuje. Interakcje sprawdzane NATYWNĄ ścieżką klika
 * (`userEvent`), nie syntetycznym zdarzeniem — inaczej martwy przycisk
 * przeszedłby test (CLAUDE.md, Zero-Debt pkt 5).
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MapaProcesu } from '../MapaProcesu';
import { ETAPY, ETAPY_IDS } from '../etapy';
import { PROCES_STRINGS } from '../strings';

function renderuj(over: Partial<Parameters<typeof MapaProcesu>[0]> = {}) {
  const onWybierzEtap = vi.fn();
  render(<MapaProcesu etapBiezacy="E3" onWybierzEtap={onWybierzEtap} {...over} />);
  return { onWybierzEtap };
}

describe('MapaProcesu — równość dwustronna z kanonem etapów', () => {
  it('każdy etap kanonu jest na mapie', () => {
    renderuj();
    const mapa = screen.getByTestId('mvd-proces-mapa');
    for (const etap of ETAPY) {
      expect(within(mapa).getByText(etap.nazwa)).toBeInTheDocument();
      expect(within(mapa).getByTestId(`mvd-proces-krok-${etap.id}`)).toBeInTheDocument();
    }
  });

  it('nic poza kanonem nie występuje na mapie (odwrotny kierunek równości)', () => {
    renderuj();
    const mapa = screen.getByTestId('mvd-proces-mapa');
    const kroki = within(mapa).getAllByRole('button');
    expect(kroki).toHaveLength(ETAPY.length);

    const idNaMapie = kroki.map((krok) => krok.getAttribute('data-testid'));
    expect(idNaMapie).toEqual(ETAPY_IDS.map((id) => `mvd-proces-krok-${id}`));

    // Kolejność renderowania = kolejność kanonu (mapa nie sortuje po swojemu).
    const nazwyNaMapie = kroki.map((krok) => krok.textContent ?? '');
    ETAPY.forEach((etap, indeks) => {
      expect(nazwyNaMapie[indeks]).toContain(etap.nazwa);
    });
  });

  it('cel etapu jest dostępny jako podpowiedź (kontrakt ekranu prowadzącego)', () => {
    renderuj();
    for (const etap of ETAPY) {
      expect(screen.getByTestId(`mvd-proces-krok-${etap.id}`)).toHaveAttribute('title', etap.cel);
    }
  });
});

describe('MapaProcesu — wskazanie etapu bieżącego', () => {
  it('DOKŁADNIE jeden etap jest oznaczony jako bieżący', () => {
    renderuj({ etapBiezacy: 'E5' });
    const biezace = screen
      .getAllByRole('button')
      .filter((krok) => krok.getAttribute('aria-current') === 'step');
    expect(biezace).toHaveLength(1);
    expect(biezace[0]).toHaveAttribute('data-testid', 'mvd-proces-krok-E5');
  });

  it('wskazanie idzie za propsem — dla każdego etapu kanonu z osobna', () => {
    for (const id of ETAPY_IDS) {
      const { unmount } = render(<MapaProcesu etapBiezacy={id} onWybierzEtap={vi.fn()} />);
      expect(screen.getByTestId(`mvd-proces-krok-${id}`)).toHaveAttribute('aria-current', 'step');
      unmount();
    }
  });

  it('etap bieżący ma czytelny opis dla czytnika ekranu', () => {
    renderuj({ etapBiezacy: 'E2' });
    const krok = screen.getByTestId('mvd-proces-krok-E2');
    expect(within(krok).getByText(PROCES_STRINGS.mapaBiezacyOpis)).toBeInTheDocument();
  });
});

describe('MapaProcesu — nawigacja natywnym klikiem', () => {
  it('klik KAŻDEGO etapu prowadzi do przestrzeni z rejestru (zero martwych klików)', async () => {
    const uzytkownik = userEvent.setup();
    const { onWybierzEtap } = renderuj();

    for (const etap of ETAPY) {
      onWybierzEtap.mockClear();
      await uzytkownik.click(screen.getByTestId(`mvd-proces-krok-${etap.id}`));
      expect(onWybierzEtap).toHaveBeenCalledTimes(1);
      expect(onWybierzEtap).toHaveBeenCalledWith(etap.przestrzen, etap.id);
    }
  });

  it('etap bieżący też jest klikalny (mapa nie blokuje powrotu do siebie)', async () => {
    const uzytkownik = userEvent.setup();
    const { onWybierzEtap } = renderuj({ etapBiezacy: 'E3' });
    await uzytkownik.click(screen.getByTestId('mvd-proces-krok-E3'));
    expect(onWybierzEtap).toHaveBeenCalledWith('gotowosc', 'E3');
  });
});
