/**
 * MOTYW KANWY nN — paleta rysunku idzie z motywu powłoki.
 *
 * Stan zastany (dług zamknięty tą kartą): kanwa domeny nN miała paletę
 * wypaloną na ciemno, a harness zrzutowy ustawiał `data-theme` na dokumencie
 * bez pokrycia w rysunku — zrzut „jasny" i „ciemny" były BAJTOWO IDENTYCZNE
 * (zmierzone na zastanych plikach `lv_domain_multi_source_dark.png` i
 * `…_light.png`: ten sam rozmiar i ta sama treść). To ten sam defekt, który
 * kanwa SN zamknęła wcześniej: deklaracja motywu bez pokrycia.
 *
 * Pin trzyma OBA końce łańcucha: komponent honoruje prop motywu, a portal
 * SN→nN podaje mu motyw POWŁOKI (inaczej jasna powłoka pokazywałaby czarny
 * arkusz nN).
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';

import { LvDomainView } from '../LvDomainView';
import { LvDomainPortal } from '../LvDomainPortal';
import { MULTI_SOURCE_PROJECTION } from '../fixtures/multiSourceDomain';
import { paletaNnDlaMotywu } from '../visualGrammar';
import { useThemeModeStore } from '../../../../../ui2/theme/themeMode';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  useThemeModeStore.setState({ mode: 'dark_scada' });
});

describe('Paleta domeny nN — wartości dwóch motywów', () => {
  it('tło i tusz bazowy różnią się między motywami (inaczej „jasny" byłby tym samym rysunkiem)', () => {
    const ciemna = paletaNnDlaMotywu('dark_scada');
    const jasna = paletaNnDlaMotywu('light_technical');
    expect(jasna.tlo).not.toBe(ciemna.tlo);
    expect(jasna.kreskaBazowa).not.toBe(ciemna.kreskaBazowa);
    expect(jasna.kreskaKabla).not.toBe(ciemna.kreskaKabla);
    expect(jasna.tlo).toBe('#FFFFFF');
    expect(ciemna.tlo).toBe('#0B0F14');
  });

  it('werdykt trzytonowy ma OSOBNE wartości dla „spełnia/nie spełnia/nierozstrzygalne" w obu motywach', () => {
    for (const mode of ['dark_scada', 'light_technical'] as const) {
      const paleta = paletaNnDlaMotywu(mode);
      expect(new Set([paleta.tonOk, paleta.tonBledu, paleta.tonOstrzegawczy]).size, mode).toBe(3);
    }
  });
});

describe('LvDomainView — rysunek honoruje prop motywu', () => {
  for (const mode of ['dark_scada', 'light_technical'] as const) {
    it(`[${mode}] tło kanwy, korzeń i kreska szyny biorą kolor z palety motywu`, () => {
      const paleta = paletaNnDlaMotywu(mode);
      render(<LvDomainView projection={MULTI_SOURCE_PROJECTION} theme={mode} width={1400} height={1000} />);
      const root = screen.getByTestId('lv-domain-view-root');
      expect(root).toHaveAttribute('data-theme-mode', mode);
      expect(root.style.background).toBeTruthy();
      const tlo = screen.getByTestId('lv-domain-svg').querySelector('rect');
      expect(tlo?.getAttribute('fill')).toBe(paleta.tlo);
      const szyna = screen.getByTestId('lv-domain-node-nn_a').querySelector('line');
      expect(szyna?.getAttribute('stroke')).toBe(paleta.kreskaBazowa);
      cleanup();
    });
  }

  it('brak propu = motyw dyspozytorski (ciemny), zgodnie z kontraktem komponentu', () => {
    render(<LvDomainView projection={MULTI_SOURCE_PROJECTION} width={1400} height={1000} />);
    expect(screen.getByTestId('lv-domain-view-root')).toHaveAttribute('data-theme-mode', 'dark_scada');
  });
});

describe('LvDomainPortal — motyw POWŁOKI dociera do rysunku domeny nN', () => {
  /** Odpowiedź z TOŻSAMOŚCIĄ żądania (kontrakt 2.0.0 — `projectionApi.ts`
   *  odrzuca odpowiedź dla innego przypadku/stacji/scenariusza, więc atrapa
   *  musi odpowiadać tak jak backend: dla tego, o co pytano). */
  function stubProjectionFetch(): void {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(async (input: RequestInfo | URL) => {
        const url = new URL(String(input), 'http://localhost');
        const [, caseId, stationRef] = url.pathname.match(/\/api\/cases\/([^/]+)\/enm\/lv-domain\/([^/]+)\//) ?? [];
        const projection = {
          ...MULTI_SOURCE_PROJECTION,
          case_id: decodeURIComponent(caseId ?? ''),
          station_ref: decodeURIComponent(stationRef ?? ''),
          model_snapshot: {
            ...MULTI_SOURCE_PROJECTION.model_snapshot,
            case_id: decodeURIComponent(caseId ?? ''),
            station_ref: decodeURIComponent(stationRef ?? ''),
          },
        };
        return new Response(JSON.stringify(projection), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }),
    );
  }

  it('powłoka w trybie jasnym → kanwa nN rysuje się paletą jasną (koniec czarnego arkusza na jasnym ekranie)', async () => {
    useThemeModeStore.setState({ mode: 'light_technical' });
    stubProjectionFetch();
    render(
      <LvDomainPortal
        caseId="motyw-nn"
        stationRef="root"
        width={900}
        height={700}
        onClose={() => undefined}
      />,
    );
    await waitFor(() => expect(screen.getByTestId('lv-domain-view-root')).toBeTruthy());
    expect(screen.getByTestId('lv-domain-view-root')).toHaveAttribute('data-theme-mode', 'light_technical');
    const tlo = screen.getByTestId('lv-domain-svg').querySelector('rect');
    expect(tlo?.getAttribute('fill')).toBe(paletaNnDlaMotywu('light_technical').tlo);
  });

  it('powłoka w trybie dyspozytorskim → kanwa nN rysuje się paletą ciemną', async () => {
    useThemeModeStore.setState({ mode: 'dark_scada' });
    stubProjectionFetch();
    render(
      <LvDomainPortal
        caseId="motyw-nn"
        stationRef="root"
        width={900}
        height={700}
        onClose={() => undefined}
      />,
    );
    await waitFor(() => expect(screen.getByTestId('lv-domain-view-root')).toBeTruthy());
    expect(screen.getByTestId('lv-domain-view-root')).toHaveAttribute('data-theme-mode', 'dark_scada');
  });
});
