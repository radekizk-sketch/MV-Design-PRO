/**
 * MOTYW KANWY nN — paleta rysunku idzie z motywu powłoki (oba końce
 * łańcucha: komponent honoruje prop motywu; portal SN→nN podaje motyw
 * POWŁOKI — inaczej jasna powłoka pokazywałaby czarny arkusz nN).
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';

import { LvDomainView } from '../LvDomainView';
import { LvDomainPortal } from '../LvDomainPortal';
import { scenariusz } from '../fixtures/scenariusze';
import { paletaNnDlaMotywu } from '../visualGrammar';
import { useThemeModeStore } from '../../../../../ui2/theme/themeMode';

const PROJEKCJA = scenariusz('02_two_tr_qbc_open');

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  useThemeModeStore.setState({ mode: 'dark_scada' });
});

describe('LvDomainView — rysunek honoruje prop motywu', () => {
  for (const mode of ['dark_scada', 'light_technical'] as const) {
    it(`[${mode}] tło kanwy, korzeń i kreska szyny biorą kolor z palety motywu`, () => {
      const paleta = paletaNnDlaMotywu(mode);
      render(<LvDomainView projection={PROJEKCJA} theme={mode} width={1400} height={1000} />);
      const root = screen.getByTestId('lv-domain-view-root');
      expect(root).toHaveAttribute('data-theme-mode', mode);
      expect(screen.getByTestId('lv-domain-svg').querySelector('rect')?.getAttribute('fill')).toBe(paleta.tlo);
      expect(screen.getByTestId('lv-domain-node-RGnN-A').querySelector('line')?.getAttribute('stroke')).toBe(paleta.kreskaBazowa);
    });
  }

  it('brak propu = motyw dyspozytorski (ciemny), zgodnie z kontraktem komponentu', () => {
    render(<LvDomainView projection={PROJEKCJA} width={1400} height={1000} />);
    expect(screen.getByTestId('lv-domain-view-root')).toHaveAttribute('data-theme-mode', 'dark_scada');
  });

  it('zrzuty jasny i ciemny NIE są tym samym rysunkiem (różne tło i tusz)', () => {
    const { container: ciemny } = render(<LvDomainView projection={PROJEKCJA} theme="dark_scada" width={1400} height={1000} />);
    const html1 = ciemny.innerHTML;
    cleanup();
    const { container: jasny } = render(<LvDomainView projection={PROJEKCJA} theme="light_technical" width={1400} height={1000} />);
    expect(jasny.innerHTML).not.toBe(html1);
  });
});

describe('LvDomainPortal — motyw POWŁOKI dociera do rysunku domeny nN', () => {
  function stubProjectionFetch(): void {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(async (input: RequestInfo | URL) => {
        const url = new URL(String(input), 'http://localhost');
        const [, caseId, stationRef] = url.pathname.match(/\/api\/cases\/([^/]+)\/enm\/lv-domain\/([^/]+)\//) ?? [];
        const identity = { case_id: decodeURIComponent(caseId ?? ''), station_ref: decodeURIComponent(stationRef ?? '') };
        const projection = { ...PROJEKCJA, ...identity, model_snapshot: { ...PROJEKCJA.model_snapshot, ...identity } };
        return new Response(JSON.stringify(projection), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }),
    );
  }

  for (const mode of ['light_technical', 'dark_scada'] as const) {
    it(`powłoka w trybie ${mode} → kanwa nN rysuje się paletą tego motywu`, async () => {
      useThemeModeStore.setState({ mode });
      stubProjectionFetch();
      render(<LvDomainPortal caseId="motyw-nn" stationRef="root" width={900} height={700} onClose={() => undefined} />);
      await waitFor(() => expect(screen.getByTestId('lv-domain-view-root')).toBeTruthy());
      expect(screen.getByTestId('lv-domain-view-root')).toHaveAttribute('data-theme-mode', mode);
      expect(screen.getByTestId('lv-domain-svg').querySelector('rect')?.getAttribute('fill')).toBe(paletaNnDlaMotywu(mode).tlo);
      expect(fetch).toHaveBeenCalledTimes(1);
    });
  }
});
