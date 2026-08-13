/**
 * MINI-RMU-CAD — kontrakt PODGLĄDU pól rozdzielnicy SN (kreator stacji SN/nN).
 *
 * Werdykt właściciela 2026-08-13 (schemat CAD w ręku): „jakość wizualna mini RMU
 * 0/10". Pomiar stanu sprzed karty: cztery pola z CZTEREMA RÓŻNYMI aparatami
 * dawały rysunek bajt w bajt identyczny z rysunkiem pól bez wyboru — bo podgląd
 * rysował każde pole tym samym kwadratem, nie czytając rodzaju aparatu.
 *
 * Testy pokrywają ILOCZYN CECH (reguła KLASA §2), a nie przykład z karty:
 *   {5 ról pola} × {6 rodzajów aparatu katalogu + brak wyboru}
 * plus wyposażenie pola (CT/VT/przekaźnik), odstępy etykiet i determinizm.
 */
import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { renderToStaticMarkup } from 'react-dom/server';

import { PodgladRozdzielnicySn } from '../PodgladRozdzielnicySn';
import {
  RODZAJE_APARATU_KREATORA,
  SYMBOL_RODZAJU_APARATU,
  bboxyEtykiet,
  kolizjeEtykiet,
  sklejJednostki,
  wyjsciaPozaSlot,
  zawinCzesci,
  zawinTekst,
  zbudujPodglad,
  znamionaAparatu,
} from '../podgladRozdzielnicy';
import { SYMBOL_DEFS } from '../../../../ui/sld/v3/symbols/defs';
import type { SnFieldRole, StationSnFieldTemplate } from '../stacjaModel';
import type { MVApparatusCatalogType, TransformerType } from '../../../../ui/catalog/types';

/**
 * Oczekiwany symbol per `device_kind` — tablica NIEZALEŻNA od tablicy produktu
 * (`SYMBOL_RODZAJU_APARATU`). Gdyby test czytał tę samą mapę, iniekcja
 * „wszystkie rodzaje na jeden symbol" przeszłaby na zielono.
 */
const OCZEKIWANY_SYMBOL: Readonly<Record<string, string | null>> = {
  WYLACZNIK: 'breaker',
  REKLOZER: 'recloser',
  ROZLACZNIK: 'loadBreakSwitch',
  ROZLACZNIK_BEZPIECZNIKOWY: 'fuseSwitch',
  ODLACZNIK: 'disconnector',
  UZIEMNIK: 'earthSwitch',
};

const ROLE: readonly SnFieldRole[] = [
  'LINIA_IN',
  'LINIA_OUT',
  'LINIA_ODG',
  'TRANSFORMATOROWE',
  'SPRZEGLO',
];

/** Katalog APARAT_SN w kształcie odpowiedzi backendu (jedna pozycja na rodzaj). */
const KATALOG: readonly MVApparatusCatalogType[] = Object.keys(OCZEKIWANY_SYMBOL).map((kind) => ({
  id: `ap-${kind}`,
  name: `Aparat ${kind}`,
  device_kind: kind,
  u_n_kv: 17.5,
  i_n_a: 630,
  breaking_capacity_ka: 25,
})) as unknown as readonly MVApparatusCatalogType[];

const TRAFO: readonly TransformerType[] = [
  {
    id: 'tr-630',
    name: 'Transformator 630 kVA 15/0,4 kV Dyn11',
    rated_power_mva: 0.63,
    voltage_hv_kv: 15,
    voltage_lv_kv: 0.4,
    uk_percent: 4.5,
  },
] as unknown as readonly TransformerType[];

function pole(
  rola: SnFieldRole,
  aparatRef: string | null,
  equipment?: Record<string, unknown>,
): StationSnFieldTemplate {
  return {
    field_role: rola,
    bay_kind: rola === 'TRANSFORMATOROWE' ? 'transformatorowe' : 'liniowe_odplywowe',
    manufacturer_ref: 'ZPUE_WLOSZCZOWA',
    switchgear_family_ref: 'zpue_rotoblok',
    bay_template_ref: 'tpl-1',
    source_status: 'repo_verified',
    source_refs: [],
    catalog_bindings: null,
    apparatus_catalog_ref: aparatRef,
    ...(equipment ? { equipment } : {}),
  };
}

/**
 * Tekst rysunku sklejony ze WSZYSTKICH wierszy `<text>` spacją. `textContent`
 * kontenera sklejałby wiersze bez separatora („typniewskazany"), bo zawinięta
 * etykieta to osobne elementy — a to jest cecha rysunku, nie defekt.
 */
function tekstRysunku(container: HTMLElement): string {
  return Array.from(container.querySelectorAll('text'))
    .map((el) => el.textContent ?? '')
    .join(' ')
    // Spacja nierozdzielająca (liczba↔jednostka) czyta się na rysunku jak
    // zwykła spacja — normalizujemy, żeby asercje mówiły o TREŚCI. Jej
    // obecność bramkuje osobny test niżej („jednostka nie odrywa się").
    .replace(/\u00a0/g, ' ');
}

function symboleWRenderze(snFields: readonly StationSnFieldTemplate[]): string[] {
  const { container } = render(
    <PodgladRozdzielnicySn
      snFields={snFields}
      aparaty={KATALOG}
      transformatory={TRAFO}
      transformatorRef="tr-630"
      snVoltageKv={15}
    />,
  );
  return Array.from(container.querySelectorAll('[data-symbol-canon]')).map(
    (el) => el.getAttribute('data-symbol-canon') ?? '',
  );
}

describe('MINI-RMU-CAD — iloczyn cech: rola pola × rodzaj aparatu', () => {
  for (const rola of ROLE) {
    for (const kind of [...Object.keys(OCZEKIWANY_SYMBOL), 'BRAK']) {
      it(`${rola} × ${kind}: symbol z katalogu, transformator tylko w polu TR`, () => {
        const ref = kind === 'BRAK' ? null : `ap-${kind}`;
        const symbole = symboleWRenderze([pole(rola, ref)]);
        const oczekiwanyAparat = kind === 'BRAK' ? null : OCZEKIWANY_SYMBOL[kind];
        const oczekiwane = [
          ...(oczekiwanyAparat ? [oczekiwanyAparat] : []),
          ...(rola === 'TRANSFORMATOROWE' ? ['transformer2W'] : []),
        ];
        expect(symbole).toEqual(oczekiwane);
      });
    }
  }

  it('sześć rodzajów aparatu ⇒ sześć RÓŻNYCH symboli (defekt sprzed karty: jeden kwadrat na wszystko)', () => {
    const symbole = Object.keys(OCZEKIWANY_SYMBOL).map(
      (kind) => symboleWRenderze([pole('LINIA_ODG', `ap-${kind}`)])[0],
    );
    expect(new Set(symbole).size).toBe(Object.keys(OCZEKIWANY_SYMBOL).length);
  });

  it('rysunki sześciu rodzajów różnią się GEOMETRIĄ, nie tylko atrybutem', () => {
    // Sam inny `data-symbol-canon` nie wystarczy: projektant czyta KSZTAŁT.
    const markup = Object.keys(OCZEKIWANY_SYMBOL).map((kind) =>
      renderToStaticMarkup(
        <PodgladRozdzielnicySn
          snFields={[pole('LINIA_ODG', `ap-${kind}`)]}
          aparaty={KATALOG}
          snVoltageKv={15}
        />,
      ).replace(/data-symbol-canon="[^"]*"/g, ''),
    );
    expect(new Set(markup).size).toBe(Object.keys(OCZEKIWANY_SYMBOL).length);
  });

  it('mapa rodzajów jest ZAMKNIĘTA: każdy rodzaj nazwany przez kreator ma symbol z kanonu', () => {
    for (const kind of RODZAJE_APARATU_KREATORA) {
      const id = SYMBOL_RODZAJU_APARATU[kind];
      expect(id, `brak symbolu dla rodzaju ${kind}`).toBeTruthy();
      expect(SYMBOL_DEFS[id]).toBeTruthy();
    }
    // I odwrotnie: mapa nie wymyśla rodzajów, których kreator nie zna.
    expect(Object.keys(SYMBOL_RODZAJU_APARATU).sort()).toEqual([...RODZAJE_APARATU_KREATORA].sort());
  });
});

describe('MINI-RMU-CAD — etykieta pola czyta dane katalogu', () => {
  it('opis pola = nazwa katalogowa + rodzaj + znamiona (17,5 kV · 630 A · 25 kA)', () => {
    const { container } = render(
      <PodgladRozdzielnicySn
        snFields={[pole('LINIA_IN', 'ap-WYLACZNIK')]}
        aparaty={KATALOG}
        snVoltageKv={15}
      />,
    );
    const tekst = tekstRysunku(container);
    expect(tekst).toContain('Aparat WYLACZNIK');
    expect(tekst).toContain('wyłącznik');
    expect(tekst).toContain('17,5 kV');
    expect(tekst).toContain('630 A');
    expect(tekst).toContain('25 kA');
  });

  it('zmiana pozycji katalogowej zmienia etykietę (etykieta nie jest zaszyta)', () => {
    const inny: MVApparatusCatalogType[] = [
      {
        ...(KATALOG[0] as MVApparatusCatalogType),
        name: 'Wyłącznik próżniowy VD4 12 kV',
        u_n_kv: 12,
        i_n_a: 400,
        breaking_capacity_ka: 20,
      },
    ];
    const { container } = render(
      <PodgladRozdzielnicySn
        snFields={[pole('LINIA_IN', 'ap-WYLACZNIK')]}
        aparaty={inny}
        snVoltageKv={15}
      />,
    );
    const tekst = tekstRysunku(container);
    expect(tekst).toContain('Wyłącznik próżniowy VD4 12 kV');
    expect(tekst).toContain('12 kV');
    expect(tekst).toContain('400 A');
    expect(tekst).not.toContain('630 A');
  });

  it('wiersz opisu nigdy nie kończy się ani nie zaczyna wiszącym separatorem', () => {
    // Zawijanie gotowego łańcucha „rodzaj · 17,5 kV · 630 A · 25 kA" zostawiało
    // wiersz zakończony „·" — na rysunku technicznym to błąd zapisu.
    const wiersze = zawinCzesci(['wyłącznik', '17,5 kV', '630 A', '25 kA'], 8, 104);
    expect(wiersze.length).toBeGreaterThan(1);
    for (const w of wiersze) {
      expect(w.trim().endsWith('·')).toBe(false);
      expect(w.trim().startsWith('·')).toBe(false);
    }
    // Człony, których katalog nie niesie (puste), nie tworzą pustych wierszy.
    expect(zawinCzesci(['', '  '], 8, 104)).toEqual([]);
  });

  it('jednostka NIE odrywa się od liczby przy zawijaniu (spacja nierozdzielająca)', () => {
    // Zapis „…17,5" / „kV" w nowym wierszu jest w rysunku technicznym błędem
    // czytelności; pilnuje tego skleja jednostek, nie szczęśliwa długość slotu.
    expect(sklejJednostki('Rozłącznik LBS 17,5 kV')).toBe('Rozłącznik LBS 17,5\u00a0kV');
    const wiersze = zawinTekst('Rozłącznik bezpiecznikowy ETI VV 17,5 kV', 8, 60);
    expect(wiersze.some((w) => w.trim() === 'kV')).toBe(false);
    expect(wiersze.join(' ')).toContain('17,5\u00a0kV');
  });

  it('znamiona pomijają wielkość, której pozycja katalogowa nie niesie (zero domysłu)', () => {
    const bezWylaczalnego = {
      ...(KATALOG[0] as MVApparatusCatalogType),
      breaking_capacity_ka: undefined,
    } as MVApparatusCatalogType;
    expect(znamionaAparatu(bezWylaczalnego)).toBe('17,5 kV · 630 A');
  });

  it('opis transformatora pola TR pochodzi z pozycji TRAFO_SN_NN, a jego brak jest nazwany', () => {
    const zTypem = render(
      <PodgladRozdzielnicySn
        snFields={[pole('TRANSFORMATOROWE', 'ap-WYLACZNIK')]}
        aparaty={KATALOG}
        transformatory={TRAFO}
        transformatorRef="tr-630"
        snVoltageKv={15}
      />,
    );
    expect(tekstRysunku(zTypem.container)).toContain('630 kVA');
    expect(tekstRysunku(zTypem.container)).toContain('15/0,4 kV');

    const bezTypu = render(
      <PodgladRozdzielnicySn
        snFields={[pole('TRANSFORMATOROWE', 'ap-WYLACZNIK')]}
        aparaty={KATALOG}
        transformatory={TRAFO}
        transformatorRef={null}
        snVoltageKv={15}
      />,
    );
    expect(tekstRysunku(bezTypu.container)).toContain('typ niewskazany');
    // Symbol transformatora zostaje — stacja go tworzy niezależnie od doboru typu.
    expect(bezTypu.container.querySelector('[data-symbol-canon="transformer2W"]')).toBeTruthy();
  });

  it('brak wskazanego aparatu = uczciwy komunikat i ZERO symbolu łącznika', () => {
    const { container } = render(
      <PodgladRozdzielnicySn snFields={[pole('LINIA_IN', null)]} aparaty={KATALOG} snVoltageKv={15} />,
    );
    expect(tekstRysunku(container)).toContain('aparat pola niewskazany');
    expect(container.querySelectorAll('[data-symbol-canon]').length).toBe(0);
  });

  it('napięcie szyny z kontekstu; bez kontekstu — bez zmyślonej liczby', () => {
    const z = render(<PodgladRozdzielnicySn snFields={[pole('LINIA_IN', 'ap-WYLACZNIK')]} aparaty={KATALOG} snVoltageKv={15} />);
    expect(tekstRysunku(z.container)).toContain('Szyna SN 15 kV');
    const bez = render(<PodgladRozdzielnicySn snFields={[pole('LINIA_IN', 'ap-WYLACZNIK')]} aparaty={KATALOG} />);
    expect(tekstRysunku(bez.container)).toContain('Szyna SN');
    expect(tekstRysunku(bez.container)).not.toMatch(/Szyna SN \d/);
  });
});

describe('MINI-RMU-CAD — wyposażenie pola rysowane TYLKO z danych formularza', () => {
  it('bez wyposażenia: żadnych przekładników ani przekaźnika (zero fabrykacji)', () => {
    const symbole = symboleWRenderze([pole('LINIA_IN', 'ap-WYLACZNIK')]);
    expect(symbole).toEqual(['breaker']);
  });

  it('CT wskazany w kroku pomiarów ⇒ przekładnik prądowy NA TORZE', () => {
    const symbole = symboleWRenderze([
      pole('LINIA_IN', 'ap-WYLACZNIK', { ct: { catalog_ref: 'ct-1' } }),
    ]);
    expect(symbole).toEqual(['breaker', 'currentTransformer']);
  });

  it('VT wskazany ⇒ przekładnik napięciowy na odgałęzieniu BOCZNYM', () => {
    const symbole = symboleWRenderze([
      pole('LINIA_IN', 'ap-ODLACZNIK', { vt: { catalog_ref: 'vt-1' } }),
    ]);
    expect(symbole).toEqual(['disconnector', 'voltageTransformer']);
  });

  it('przekaźnik wskazany ⇒ adnotacja przekaźnika obok toru', () => {
    const symbole = symboleWRenderze([
      pole('LINIA_IN', 'ap-WYLACZNIK', { relay: { catalog_ref: 'rel-1' } }),
    ]);
    expect(symbole).toEqual(['breaker', 'protectionRelay']);
  });

  it('pełne wyposażenie pola pomiarowego: odłącznik + VT + przekaźnik', () => {
    const symbole = symboleWRenderze([
      pole('LINIA_ODG', 'ap-ODLACZNIK', {
        vt: { catalog_ref: 'vt-1' },
        relay: { catalog_ref: 'rel-1' },
      }),
    ]);
    expect(symbole).toEqual(['disconnector', 'voltageTransformer', 'protectionRelay']);
  });

  it('pozycja wyposażenia bez referencji katalogowej nic nie rysuje (pusty wpis ≠ element)', () => {
    const symbole = symboleWRenderze([
      pole('LINIA_IN', 'ap-WYLACZNIK', { ct: {}, vt: { catalog_ref: '  ' } }),
    ]);
    expect(symbole).toEqual(['breaker']);
  });
});

describe('MINI-RMU-CAD — sprzęgło przerywa szynę (łącznik SZYN, nie odpływ)', () => {
  it('stacja bez sprzęgła: szyna jednym odcinkiem', () => {
    const podglad = zbudujPodglad({
      snFields: [pole('LINIA_IN', 'ap-WYLACZNIK'), pole('TRANSFORMATOROWE', 'ap-ROZLACZNIK_BEZPIECZNIKOWY')],
      aparaty: KATALOG,
      transformatory: TRAFO,
      transformatorRef: 'tr-630',
      snVoltageKv: 15,
    });
    expect(podglad.odcinkiSzyny).toHaveLength(1);
    expect(podglad.sloty.every((s) => s.przerwaSzyny === null)).toBe(true);
  });

  it('stacja ze sprzęgłem: szyna w dwóch sekcjach, tor sprzęgła wraca do prawej sekcji', () => {
    const podglad = zbudujPodglad({
      snFields: [
        pole('LINIA_IN', 'ap-WYLACZNIK'),
        pole('SPRZEGLO', 'ap-WYLACZNIK'),
        pole('TRANSFORMATOROWE', 'ap-WYLACZNIK'),
      ],
      aparaty: KATALOG,
      transformatory: TRAFO,
      transformatorRef: 'tr-630',
      snVoltageKv: 15,
    });
    expect(podglad.odcinkiSzyny).toHaveLength(2);
    const sprzeglo = podglad.sloty[1];
    expect(sprzeglo.przerwaSzyny).not.toBeNull();
    // Tor wraca na poziom szyny po prawej stronie przerwy (kształt „U").
    const powrot = sprzeglo.tor.filter((t) => t[3] === podglad.szynaY && t[1] !== podglad.szynaY);
    expect(powrot.length).toBe(1);
    expect(powrot[0][2]).toBeCloseTo(sprzeglo.przerwaSzyny?.[1] ?? -1, 6);
  });
});

describe('MINI-RMU-CAD — zejścia pól liniowych w jednej linii', () => {
  it('pola liniowe z aparatami o RÓŻNEJ wysokości symbolu kończą tor na tym samym poziomie', () => {
    // Wyłącznik 16, reklozer 24, rozłącznik bezpiecznikowy 32 px kanonu —
    // bez wyrównania dół rysunku był „strzępiasty" (trzy różne poziomy).
    const podglad = zbudujPodglad({
      snFields: [
        pole('LINIA_IN', 'ap-WYLACZNIK'),
        pole('LINIA_OUT', 'ap-REKLOZER'),
        pole('LINIA_ODG', 'ap-ROZLACZNIK_BEZPIECZNIKOWY'),
      ],
      aparaty: KATALOG,
      transformatory: TRAFO,
      transformatorRef: 'tr-630',
      snVoltageKv: 15,
    });
    const poziomy = new Set(podglad.sloty.map((s) => s.dol));
    expect(poziomy.size).toBe(1);
    // Wyrównanie działa przez WYDŁUŻENIE toru, nie przez przesunięcie symbolu:
    // aparat zostaje tuż pod szyną w każdym polu.
    const gornySymbol = podglad.sloty.map((s) => s.symbole[0].y);
    expect(new Set(gornySymbol).size).toBe(1);
  });

  it('pole transformatorowe i sprzęgłowe mają zakończenie z TOPOLOGII (nie są wyrównywane)', () => {
    const podglad = zbudujPodglad({
      snFields: [
        pole('LINIA_IN', 'ap-WYLACZNIK'),
        pole('TRANSFORMATOROWE', 'ap-WYLACZNIK'),
        // Sprzęgło z aparatem WYŻSZYM niż w polach liniowych: gdyby podlegało
        // wyrównaniu, zostałoby przycięte do poziomu wyprowadzeń.
        pole('SPRZEGLO', 'ap-ROZLACZNIK_BEZPIECZNIKOWY'),
      ],
      aparaty: KATALOG,
      transformatory: TRAFO,
      transformatorRef: 'tr-630',
      snVoltageKv: 15,
    });
    const [liniowe, transformatorowe, sprzeglo] = podglad.sloty;
    // Transformator schodzi GŁĘBIEJ niż wyprowadzenie pola liniowego.
    expect(transformatorowe.dol).toBeGreaterThan(liniowe.dol);
    // Sprzęgło wraca na szynę na SWOIM poziomie (wyższy aparat = głębsze „U").
    expect(sprzeglo.dol).toBeGreaterThan(liniowe.dol);
  });
});

describe('MINI-RMU-CAD — układ: etykiety nie stykają się, rysunek nie wychodzi ze slotu', () => {
  const dlugieRole: readonly SnFieldRole[] = [
    'LINIA_IN',
    'LINIA_OUT',
    'LINIA_ODG',
    'SPRZEGLO',
    'TRANSFORMATOROWE',
  ];

  for (const liczba of [3, 4, 5, 6, 7, 8]) {
    it(`${liczba} pól: zero kolizji etykiet i zero wyjść poza slot`, () => {
      const snFields = Array.from({ length: liczba }, (_, i) =>
        pole(dlugieRole[i % dlugieRole.length], `ap-${Object.keys(OCZEKIWANY_SYMBOL)[i % 6]}`, {
          ct: { catalog_ref: 'ct-1' },
          vt: { catalog_ref: 'vt-1' },
          relay: { catalog_ref: 'rel-1' },
        }),
      );
      const podglad = zbudujPodglad({
        snFields,
        aparaty: KATALOG,
        transformatory: TRAFO,
        transformatorRef: 'tr-630',
        snVoltageKv: 15,
      });
      expect(kolizjeEtykiet(podglad)).toEqual([]);
      expect(wyjsciaPozaSlot(podglad)).toEqual([]);
    });
  }

  it('bardzo długa nazwa katalogowa POSZERZA slot zamiast wchodzić w sąsiada', () => {
    const dlugi = [
      {
        ...(KATALOG[0] as MVApparatusCatalogType),
        name: 'Rozłącznik bezpiecznikowy napowietrzny w izolacji gazowej seria specjalna',
      },
    ];
    const podglad = zbudujPodglad({
      snFields: [pole('LINIA_IN', 'ap-WYLACZNIK'), pole('LINIA_OUT', 'ap-WYLACZNIK')],
      aparaty: dlugi as unknown as MVApparatusCatalogType[],
      transformatory: TRAFO,
      transformatorRef: 'tr-630',
      snVoltageKv: 15,
    });
    expect(kolizjeEtykiet(podglad)).toEqual([]);
    // Sloty nie nachodzą na siebie (suma szerokości = rozstaw osi).
    const [a, b] = podglad.sloty;
    expect(b.x - a.x).toBeCloseTo(a.szerokosc / 2 + b.szerokosc / 2, 6);
  });

  it('wyrocznia odstępów faktycznie łapie nachodzenie (test wyroczni, nie tylko układu)', () => {
    const podglad = zbudujPodglad({
      snFields: [pole('LINIA_IN', 'ap-WYLACZNIK'), pole('LINIA_OUT', 'ap-WYLACZNIK')],
      aparaty: KATALOG,
      transformatory: TRAFO,
      transformatorRef: 'tr-630',
      snVoltageKv: 15,
    });
    // Sztucznie ściśnięte sloty (osie na tej samej pozycji) MUSZĄ dać kolizję.
    const scisniety = {
      ...podglad,
      sloty: podglad.sloty.map((s) => ({ ...s, x: podglad.sloty[0].x })),
    };
    expect(kolizjeEtykiet(scisniety).length).toBeGreaterThan(0);
    expect(bboxyEtykiet(podglad).length).toBeGreaterThan(0);
  });
});

describe('MINI-RMU-CAD — determinizm rysunku', () => {
  it('ta sama konfiguracja ⇒ bajt-identyczny SVG', () => {
    const snFields = [
      pole('LINIA_IN', 'ap-REKLOZER'),
      pole('LINIA_OUT', 'ap-ROZLACZNIK'),
      pole('LINIA_ODG', 'ap-WYLACZNIK'),
      pole('TRANSFORMATOROWE', 'ap-ROZLACZNIK_BEZPIECZNIKOWY'),
    ];
    const el = (
      <PodgladRozdzielnicySn
        snFields={snFields}
        aparaty={KATALOG}
        transformatory={TRAFO}
        transformatorRef="tr-630"
        snVoltageKv={15}
      />
    );
    expect(renderToStaticMarkup(el)).toBe(renderToStaticMarkup(el));
  });

  it('struktura rysunku stacji 4-polowej: symbole per pole w kolejności listy pól', () => {
    // Snapshot STRUKTURY (nie pikseli): co stoi w którym polu i w jakiej kolejności.
    const podglad = zbudujPodglad({
      snFields: [
        pole('LINIA_IN', 'ap-REKLOZER'),
        pole('LINIA_OUT', 'ap-ROZLACZNIK'),
        pole('LINIA_ODG', 'ap-WYLACZNIK', { ct: { catalog_ref: 'ct-1' } }),
        pole('TRANSFORMATOROWE', 'ap-ROZLACZNIK_BEZPIECZNIKOWY'),
      ],
      aparaty: KATALOG,
      transformatory: TRAFO,
      transformatorRef: 'tr-630',
      snVoltageKv: 15,
    });
    const struktura = podglad.sloty.map(
      (s) => `${s.numer}:${s.rola}:${s.symbole.map((sym) => sym.id).join('+')}`,
    );
    expect(struktura).toEqual([
      '1:LINIA_IN:recloser',
      '2:LINIA_OUT:loadBreakSwitch',
      '3:LINIA_ODG:breaker+currentTransformer',
      '4:TRANSFORMATOROWE:fuseSwitch+transformer2W',
    ]);
  });

  it('rozdzielnica bez pól nie wywraca rysunku (uczciwy stan pusty)', () => {
    const { container } = render(<PodgladRozdzielnicySn snFields={[]} aparaty={KATALOG} />);
    expect(container.querySelector('svg')).toBeTruthy();
    expect(container.querySelectorAll('[data-symbol-canon]').length).toBe(0);
  });
});
