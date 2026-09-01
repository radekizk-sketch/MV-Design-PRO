/**
 * ENERGIZACJA I WYSPY w projekcji nN — kontrakt `LvDomainBus.energized/
 * supply_refs/der_only` + `LvDomainGraphView.islands`.
 *
 * Dowód obejmuje ILOCZYN CECH, w którym defekt mógłby się schować:
 * [szyna z własnymi polami × szyna opisana wyłącznie wyspą × szyna bez
 * żadnych danych] × [wyspa bez napięcia × wyspa zasilana z DER × wyspa
 * normalna] × [odcinek w całości bez napięcia × odcinek MIESZANY (jeden
 * koniec pod napięciem) × odcinek za otwartym łącznikiem] × [oba motywy].
 *
 * Kluczowa reguła, którą ten plik przypina (predykaty parami): kreska szyny
 * i kreski jej odpływów biorą stan z JEDNEGO rozstrzygnięcia
 * (`stanZasilaniaSzyn`), a odcinek MIESZANY nie udaje martwego — jego jeden
 * koniec jest pod napięciem.
 */
import { describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';

import { LvDomainView } from '../LvDomainView';
import { stanZasilaniaSzyn } from '../composeLvDomainScene';
import { buildLvDomainProjectionFixture } from '../fixtures/projectionFixture';
import { ISLAND_DOMAIN_PROJECTION, ISLAND_DOMAIN_REFS, ISLAND_DOMAIN_VIEW } from '../fixtures/islandDomain';
import { MULTI_SOURCE_DOMAIN_VIEW, MULTI_SOURCE_PROJECTION } from '../fixtures/multiSourceDomain';
import { STATION_BOARD_DOMAIN_VIEW, STATION_BOARD_PROJECTION } from '../fixtures/stationBoardDomain';
import { LINE_DASH_SCREEN_PX, paletaNnDlaMotywu } from '../visualGrammar';
import type { LvDomainGraphView } from '../types';

const refs = ISLAND_DOMAIN_REFS;

describe('Fixtura wysp — dwa niezależne opisy tego samego faktu MUSZĄ się zgadzać (kształt backendu)', () => {
  it('pola na szynach zgadzają się z opisem wysp (fixtura, która by kłamała, dowodziłaby czegoś, czego nie ma w sieci)', () => {
    for (const island of ISLAND_DOMAIN_VIEW.islands) {
      for (const busRef of island.bus_refs) {
        const bus = ISLAND_DOMAIN_VIEW.buses.find((b) => b.ref_id === busRef);
        expect(bus, `wyspa ${island.island_ref} wskazuje nieistniejącą szynę ${busRef}`).toBeDefined();
        expect(bus?.energized, busRef).toBe(island.energized);
        expect(bus?.der_only, busRef).toBe(island.der_only);
        expect([...(bus?.supply_refs ?? [])], busRef).toEqual([...island.supply_refs]);
      }
    }
  });

  it('każda szyna domeny należy do DOKŁADNIE jednej wyspy (inwariant kontraktu 2.0.0 — `energization.py` grupuje wszystkie szyny domeny)', () => {
    for (const view of [ISLAND_DOMAIN_VIEW, MULTI_SOURCE_DOMAIN_VIEW, STATION_BOARD_DOMAIN_VIEW]) {
      const liczbaWysp = new Map<string, number>();
      for (const island of view.islands) {
        for (const busRef of island.bus_refs) liczbaWysp.set(busRef, (liczbaWysp.get(busRef) ?? 0) + 1);
      }
      for (const bus of view.buses) expect(liczbaWysp.get(bus.ref_id), `${view.station_ref}:${bus.ref_id}`).toBe(1);
      expect(liczbaWysp.size).toBe(view.buses.length);
      // `stanZasilaniaSzyn` przepisuje wyspę 1:1 (zero własnego BFS).
      const stan = stanZasilaniaSzyn(view);
      for (const island of view.islands) {
        for (const busRef of island.bus_refs) expect(stan.get(busRef)?.islandRef).toBe(island.island_ref);
      }
    }
  });

  it('fixtura niesie OBA stany brzegowe naraz: szynę bez napięcia i wyspę zasilaną wyłącznie z DER', () => {
    const stan = stanZasilaniaSzyn(ISLAND_DOMAIN_VIEW);
    expect(stan.get(refs.podrozdzielniaCBusRef)?.energized).toBe(false);
    expect(stan.get(refs.podrozdzielniaDBusRef)?.energized).toBe(true);
    expect(stan.get(refs.podrozdzielniaDBusRef)?.derOnly).toBe(true);
    expect(stan.get(refs.sekcjaABusRef)?.energized).toBe(true);
    expect(stan.get(refs.sekcjaABusRef)?.derOnly).toBe(false);
  });
});

describe('stanZasilaniaSzyn — JEDNO rozstrzygnięcie dla sceny, przepisane Z DANYCH backendu', () => {
  it('stan szyny = pola NA SZYNIE (energized/der_only/supply_refs) — nic nie jest wyprowadzane z topologii', () => {
    const rozjazd: LvDomainGraphView = {
      ...ISLAND_DOMAIN_VIEW,
      buses: ISLAND_DOMAIN_VIEW.buses.map((b) =>
        b.ref_id === refs.podrozdzielniaCBusRef ? { ...b, energized: true, supply_refs: ['stnW/TA'] } : b,
      ),
    };
    // Rozjazd danych (szyna mówi „pod napięciem", wyspa „bez") NIE jest cicho
    // uśredniany ani „naprawiany" BFS-em: scena rysuje to, co niesie szyna.
    const stan = stanZasilaniaSzyn(rozjazd).get(refs.podrozdzielniaCBusRef)!;
    expect(stan.energized).toBe(true);
    expect([...stan.supplyRefs]).toEqual(['stnW/TA']);
    expect(stan.islandRef).toBe('stnW/wyspa_C');
  });

  it('każda szyna grafu ma stan (kontrakt 2.0.0: pola wymagane) — także w domenach bez wysp odciętych', () => {
    for (const view of [MULTI_SOURCE_DOMAIN_VIEW, STATION_BOARD_DOMAIN_VIEW]) {
      const stan = stanZasilaniaSzyn(view);
      expect(stan.size).toBe(view.buses.length);
      for (const bus of view.buses) {
        expect(stan.get(bus.ref_id)?.energized).toBe(true);
        expect(stan.get(bus.ref_id)?.derOnly).toBe(false);
        expect(stan.get(bus.ref_id)?.islandRef).toBe('island-1');
      }
    }
  });

  it('szyna, której backend nie przypisał do żadnej wyspy, dostaje islandRef=undefined (niespójna odpowiedź nie jest łatana domysłem)', () => {
    const bezWyspy: LvDomainGraphView = { ...ISLAND_DOMAIN_VIEW, islands: [] };
    const stan = stanZasilaniaSzyn(bezWyspy);
    expect(stan.size).toBe(ISLAND_DOMAIN_VIEW.buses.length);
    expect(stan.get(refs.podrozdzielniaCBusRef)?.islandRef).toBeUndefined();
    expect(stan.get(refs.podrozdzielniaCBusRef)?.energized).toBe(false);
  });
});

describe('Rysunek stanu zasilania — szyna, jej odpływy, odcinek mieszany', () => {
  const paleta = paletaNnDlaMotywu('dark_scada');

  function renderujWyspy(): void {
    render(<LvDomainView projection={ISLAND_DOMAIN_PROJECTION} width={1400} height={1000} />);
  }

  it('szyna bez napięcia: kreska wygaszona i przerywana + jawna etykieta „bez napięcia"', () => {
    renderujWyspy();
    const szyna = screen.getByTestId(`lv-domain-node-${refs.podrozdzielniaCBusRef}`);
    expect(szyna).toHaveAttribute('data-energized', 'false');
    const kreska = szyna.querySelector('line');
    expect(kreska?.getAttribute('stroke')).toBe(paleta.bezNapiecia);
    expect(kreska?.getAttribute('stroke-dasharray')).not.toBeNull();
    expect(screen.getByTestId(`lv-domain-bus-bez-napiecia-${refs.podrozdzielniaCBusRef}`).textContent).toContain('bez napięcia');
    cleanup();
  });

  it('ODPŁYW szyny bez napięcia dziedziczy ten sam stan (kreska szyny i jej odpływów z jednego rozstrzygnięcia)', () => {
    renderujWyspy();
    const odplyw = screen.getByTestId('lv-domain-edge-stnW/odbior_C#feeder-drop');
    expect(odplyw).toHaveAttribute('data-energized', 'false');
    expect(odplyw.querySelector('line')?.getAttribute('stroke')).toBe(paleta.bezNapiecia);
    cleanup();
  });

  it('odcinek MIESZANY (żywa sekcja → martwa podrozdzielnica za otwartym łącznikiem) NIE jest wygaszony — jeden koniec jest pod napięciem', () => {
    renderujWyspy();
    const odcinek = screen.getByTestId(`lv-domain-edge-${refs.qfB1Ref}`);
    expect(odcinek).toHaveAttribute('data-energized', 'true');
    const kreska = odcinek.querySelector('line');
    expect(kreska?.getAttribute('stroke')).not.toBe(paleta.bezNapiecia);
    // …ale stan ŁĄCZNIKA (otwarty) nadal widać wzorem kreski — dwa niezależne
    // kanały informacji, nie jeden zlany.
    expect(kreska?.getAttribute('stroke-dasharray')).not.toBeNull();
    cleanup();
  });

  it('wzór kreski „bez napięcia" jest INNY niż wzór „łącznik otwarty" (dwa różne fakty ruchowe)', () => {
    expect([...LINE_DASH_SCREEN_PX.bezNapiecia]).not.toEqual([...LINE_DASH_SCREEN_PX.open]);
  });

  it('wyspa zasilana wyłącznie z DER jest oznaczona przy swojej szynie', () => {
    renderujWyspy();
    const szyna = screen.getByTestId(`lv-domain-node-${refs.podrozdzielniaDBusRef}`);
    expect(szyna).toHaveAttribute('data-der-only', 'true');
    expect(szyna).toHaveAttribute('data-energized', 'true');
    expect(screen.getByTestId(`lv-domain-bus-wyspa-der-${refs.podrozdzielniaDBusRef}`).textContent).toContain('wyspa DER');
    // Źródło wyspy (PV) i jego tor zostają narysowane — „odcięte" nie znaczy
    // „bezpieczne", więc źródła nie wolno ukryć.
    expect(screen.getByTestId(`lv-domain-node-${refs.pvDRef}`)).toBeTruthy();
    expect(screen.getByTestId(`lv-domain-edge-${refs.pvDRef}#source-drop`)).toBeTruthy();
    cleanup();
  });

  it('sekcja pod napięciem nie dostaje ŻADNEGO z tych oznaczeń', () => {
    renderujWyspy();
    expect(screen.getByTestId(`lv-domain-node-${refs.sekcjaABusRef}`)).toHaveAttribute('data-energized', 'true');
    expect(screen.queryByTestId(`lv-domain-bus-bez-napiecia-${refs.sekcjaABusRef}`)).toBeNull();
    expect(screen.queryByTestId(`lv-domain-bus-wyspa-der-${refs.sekcjaABusRef}`)).toBeNull();
    cleanup();
  });

  it('oznaczenia stanu zasilania działają w OBU motywach (kolor z palety motywu, nie z literału)', () => {
    for (const theme of ['dark_scada', 'light_technical'] as const) {
      render(<LvDomainView projection={ISLAND_DOMAIN_PROJECTION} theme={theme} width={1400} height={1000} />);
      const oczekiwany = paletaNnDlaMotywu(theme).bezNapiecia;
      const kreska = screen.getByTestId(`lv-domain-node-${refs.podrozdzielniaCBusRef}`).querySelector('line');
      expect(kreska?.getAttribute('stroke')).toBe(oczekiwany);
      cleanup();
    }
    expect(paletaNnDlaMotywu('dark_scada').bezNapiecia).not.toBe(paletaNnDlaMotywu('light_technical').bezNapiecia);
  });
});

describe('Domena w całości pod napięciem = ZERO oznaczeń stanu wyjątkowego (stan niesiony w danych, nie domyślany)', () => {
  for (const wariant of [
    { nazwa: 'dwie sekcje ze sprzęgłem', projection: MULTI_SOURCE_PROJECTION },
    { nazwa: 'rozdzielnica z incomerem', projection: STATION_BOARD_PROJECTION },
  ]) {
    it(`[${wariant.nazwa}] każda szyna deklaruje stan zasilania z danych, ale żadna nie jest „bez napięcia" ani „wyspą DER"`, () => {
      const { container } = render(<LvDomainView projection={wariant.projection} width={1400} height={1000} />);
      const szyny = container.querySelectorAll('[data-testid^="lv-domain-node-"][data-bus-tier]');
      expect(szyny.length).toBeGreaterThan(0);
      for (const szyna of szyny) {
        expect(szyna).toHaveAttribute('data-energized', 'true');
        expect(szyna.getAttribute('data-der-only')).not.toBe('true');
      }
      expect(container.innerHTML).not.toContain('bez napięcia');
      expect(container.innerHTML).not.toContain('wyspa DER');
      cleanup();
    });
  }
});

describe('Projekcja z wyspami przechodzi te same wymagania co pozostałe fixtury', () => {
  it('renderuje się bez wyjątku, ze statusem ok i pełnym kompletem sekcji', () => {
    render(<LvDomainView projection={ISLAND_DOMAIN_PROJECTION} width={1400} height={1000} />);
    expect(screen.getByTestId('lv-domain-view-root')).toHaveAttribute('data-status', 'ok');
    for (const busRef of [refs.sekcjaABusRef, refs.sekcjaBBusRef, refs.podrozdzielniaCBusRef, refs.podrozdzielniaDBusRef]) {
      expect(screen.getByTestId(`lv-domain-node-${busRef}`)).toBeTruthy();
    }
    expect(screen.getByTestId(`lv-domain-node-${refs.couplerRef}`).querySelector('rect')?.getAttribute('fill')).toBe('none');
  });

  it('podrozdzielnice są rysowane jako szyny podrzędne, sekcje główne jako magistrale (hierarchia nietknięta przez stan zasilania)', () => {
    render(<LvDomainView projection={ISLAND_DOMAIN_PROJECTION} width={1400} height={1000} />);
    expect(screen.getByTestId(`lv-domain-node-${refs.sekcjaABusRef}`)).toHaveAttribute('data-bus-tier', 'main');
    expect(screen.getByTestId(`lv-domain-node-${refs.podrozdzielniaCBusRef}`)).toHaveAttribute('data-bus-tier', 'sub');
  });
});
