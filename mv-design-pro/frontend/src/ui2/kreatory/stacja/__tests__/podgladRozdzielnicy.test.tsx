/**
 * SLD-GEN-POLA — kontrakt PODGLĄDU rozdzielnicy SN (kreator stacji SN/nN).
 *
 * Historia werdyktów właściciela: 2026-08-13 „jakość wizualna mini RMU 0/10"
 * (każde pole tym samym kwadratem), 2026-08-14 „3/10 — cztery identyczne ikony
 * różniące się podpisem" (rysunek czytał rolę pola i JEDEN wybrany aparat,
 * a nie kompozycję aparatów rodziny). Ta karta wprowadza generator pola z BOM;
 * testy poniżej pilnują OBU warstw: składania rozdzielnicy i renderu.
 *
 * Testy pokrywają ILOCZYN CECH (reguła KLASA §2), a nie przykład z karty:
 *   {5 ról pola} × {6 rodzajów aparatu katalogu + brak wyboru}
 *   × {z kompozycją rodziny / bez niej} × {wyposażenie pola}
 * plus nagłówek pakietu, odstępy etykiet, zasięg slotów i determinizm.
 *
 * Kompozycje pól pochodzą z fikstur przepisanych 1:1 z odpowiedzi backendu
 * (`fixturySzablonowPol.ts`), a nie z atrap wygodnych dla testu.
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
import { roznicaBomScena, symbolRodzajuAparatu } from '../generatorSldPola';
import { SYMBOL_DEFS } from '../../../../ui/sld/v3/symbols/defs';
import type { SnFieldRole, StationSnFieldTemplate } from '../stacjaModel';
import type { MVApparatusCatalogType, TransformerType } from '../../../../ui/catalog/types';
import {
  BLOK_RMU_K_K_T,
  RODZINA_SAFERING,
  RODZINA_UNIGEAR,
  SZABLON_SAFERING_LINE_IN,
  SZABLON_SAFERING_LINE_OUT,
  SZABLON_SAFERING_TRANSFORMER,
  SZABLON_UNIGEAR_COUPLER,
  SZABLON_UNIGEAR_LINE_OUT,
  SZABLON_UNIGEAR_MEASUREMENT,
  SZABLON_UNIGEAR_TRANSFORMER,
} from './fixturySzablonowPol';

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

/**
 * Katalog o REALNYCH nazwach pozycji (kształt odpowiedzi backendu z katalogu
 * kanonicznego). Testy układu muszą stać na tekstach tej długości, co żywa
 * aplikacja — na krótkich atrapach każdy układ wygląda na czysty, także ten
 * sprzed karty (stała szerokość slotu 96 px).
 */
const KATALOG_REALNY: readonly MVApparatusCatalogType[] = [
  { id: 'ap-WYLACZNIK', name: 'Wyłącznik próżniowy VD4 17,5 kV', device_kind: 'WYLACZNIK', u_n_kv: 17.5, i_n_a: 630, breaking_capacity_ka: 25 },
  { id: 'ap-REKLOZER', name: 'ABB REC615 17,5 kV 630 A', device_kind: 'REKLOZER', u_n_kv: 17.5, i_n_a: 630, breaking_capacity_ka: 12.5 },
  { id: 'ap-ROZLACZNIK', name: 'Rozłącznik LBS 17,5 kV', device_kind: 'ROZLACZNIK', u_n_kv: 17.5, i_n_a: 630, breaking_capacity_ka: 20 },
  { id: 'ap-ROZLACZNIK_BEZPIECZNIKOWY', name: 'Rozłącznik bezpiecznikowy ETI VV 17,5 kV', device_kind: 'ROZLACZNIK_BEZPIECZNIKOWY', u_n_kv: 17.5, i_n_a: 63 },
  { id: 'ap-ODLACZNIK', name: 'Odłącznik OJS 17,5 kV', device_kind: 'ODLACZNIK', u_n_kv: 17.5, i_n_a: 630 },
  { id: 'ap-UZIEMNIK', name: 'Uziemnik pola OJS-U 17,5 kV', device_kind: 'UZIEMNIK', u_n_kv: 17.5, i_n_a: 630 },
] as unknown as readonly MVApparatusCatalogType[];

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
  szablonRef?: string,
): StationSnFieldTemplate {
  return {
    field_role: rola,
    bay_kind: rola === 'TRANSFORMATOROWE' ? 'transformatorowe' : 'liniowe_odplywowe',
    manufacturer_ref: 'ABB',
    switchgear_family_ref: 'ABB__UNIGEAR_ZS1',
    bay_template_ref: szablonRef ?? 'tpl-1',
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

function symboleWRenderze(
  snFields: readonly StationSnFieldTemplate[],
  szablonyPol: Parameters<typeof PodgladRozdzielnicySn>[0]['szablonyPol'] = [],
): string[] {
  const { container } = render(
    <PodgladRozdzielnicySn
      snFields={snFields}
      aparaty={KATALOG}
      transformatory={TRAFO}
      transformatorRef="tr-630"
      snVoltageKv={15}
      szablonyPol={szablonyPol}
    />,
  );
  return Array.from(container.querySelectorAll('[data-symbol-canon]')).map(
    (el) => el.getAttribute('data-symbol-canon') ?? '',
  );
}

describe('SLD-GEN-POLA — iloczyn cech: rola pola × rodzaj aparatu', () => {
  for (const rola of ROLE) {
    for (const kind of [...Object.keys(OCZEKIWANY_SYMBOL), 'BRAK']) {
      it(`${rola} × ${kind}: symbol z katalogu, transformator tylko w polu TR`, () => {
        // Bez kompozycji rodziny (pole bez dobranego szablonu) rysunek pokazuje
        // WYŁĄCZNIE to, co niesie formularz: aparat główny i transformator
        // stacji w polu transformatorowym. Zero domysłu o składzie celki.
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

  it('sześć rodzajów aparatu ⇒ sześć RÓŻNYCH symboli (defekt: jeden kwadrat na wszystko)', () => {
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

describe('SLD-GEN-POLA — pole rysuje KOMPOZYCJĘ APARATÓW swojej rodziny', () => {
  it('pole z kompozycją UniGear: pełny skład celki z oznaczeniami operatorskimi', () => {
    const { container } = render(
      <PodgladRozdzielnicySn
        snFields={[pole('LINIA_OUT', 'ap-WYLACZNIK', undefined, SZABLON_UNIGEAR_LINE_OUT.template_ref)]}
        aparaty={KATALOG}
        snVoltageKv={15}
        szablonyPol={[SZABLON_UNIGEAR_LINE_OUT]}
      />,
    );
    const symbole = Array.from(container.querySelectorAll('[data-symbol-canon]')).map((el) =>
      el.getAttribute('data-symbol-canon'),
    );
    expect(symbole).toEqual([
      'disconnector',
      'breaker',
      'currentTransformer',
      'disconnector',
      'earthSwitch',
      'cableHead',
    ]);
    // Oznaczenia operatorskie stoją przy symbolach — projektant czyta pole tak
    // samo jak na schemacie wykonawczym.
    const oznaczenia = Array.from(container.querySelectorAll('[data-oznaczenie]')).map((el) =>
      el.getAttribute('data-oznaczenie'),
    );
    expect(oznaczenia).toEqual(['Q1', 'Q0', 'T1', 'Q2', 'Q9', 'GK']);
    expect(tekstRysunku(container)).toContain('Q9');
  });

  it('rodzina RMU i rodzina wnętrzowa dają RÓŻNE rysunki tej samej roli pola', () => {
    // SafeRing (RMU) nie ma w słowniku rodziny przekładnika prądowego, UniGear ma.
    const rmu = symboleWRenderze(
      [pole('LINIA_OUT', 'ap-ROZLACZNIK', undefined, SZABLON_SAFERING_LINE_OUT.template_ref)],
      [SZABLON_SAFERING_LINE_OUT],
    );
    const wnetrzowa = symboleWRenderze(
      [pole('LINIA_OUT', 'ap-WYLACZNIK', undefined, SZABLON_UNIGEAR_LINE_OUT.template_ref)],
      [SZABLON_UNIGEAR_LINE_OUT],
    );
    expect(rmu).not.toEqual(wnetrzowa);
    expect(rmu).not.toContain('currentTransformer');
    expect(wnetrzowa).toContain('currentTransformer');
  });

  it('każde pole rozdzielnicy rysuje DOKŁADNIE swój BOM (wyrocznia dwustronna)', () => {
    const podglad = zbudujPodglad({
      snFields: [
        pole('LINIA_IN', 'ap-ROZLACZNIK', undefined, SZABLON_SAFERING_LINE_IN.template_ref),
        pole('LINIA_OUT', 'ap-ROZLACZNIK', undefined, SZABLON_SAFERING_LINE_OUT.template_ref),
        pole('TRANSFORMATOROWE', 'ap-ROZLACZNIK_BEZPIECZNIKOWY', undefined, SZABLON_SAFERING_TRANSFORMER.template_ref),
      ],
      aparaty: KATALOG,
      transformatory: TRAFO,
      transformatorRef: 'tr-630',
      snVoltageKv: 15,
      szablonyPol: BLOK_RMU_K_K_T,
    });
    for (const slot of podglad.sloty) {
      const aparat = KATALOG.find((a) => a.id === `ap-${slot.rola === 'TRANSFORMATOROWE' ? 'ROZLACZNIK_BEZPIECZNIKOWY' : 'ROZLACZNIK'}`);
      expect(
        roznicaBomScena(slot.bom, slot.scena, {
          symbolAparatuGlownego: symbolRodzajuAparatu(aparat?.device_kind),
        }),
        `pole ${slot.numer}`,
      ).toEqual([]);
    }
  });

  it('przedział kablowy i kreska nN pojawiają się wyłącznie tam, gdzie mają podstawę', () => {
    const { container } = render(
      <PodgladRozdzielnicySn
        snFields={[
          pole('LINIA_IN', 'ap-ROZLACZNIK', undefined, SZABLON_SAFERING_LINE_IN.template_ref),
          pole('TRANSFORMATOROWE', 'ap-ROZLACZNIK_BEZPIECZNIKOWY', undefined, SZABLON_SAFERING_TRANSFORMER.template_ref),
        ]}
        aparaty={KATALOG}
        transformatory={TRAFO}
        transformatorRef="tr-630"
        snVoltageKv={15}
        szablonyPol={BLOK_RMU_K_K_T}
      />,
    );
    // Pole 1 (kablowe) ma przedział kablowy i nie ma strony nN.
    expect(container.querySelector('[data-testid="mvd-podglad-przedzial-1"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="mvd-podglad-nn-1"]')).toBeNull();
    // Pole 2 (transformatorowe) odwrotnie.
    expect(container.querySelector('[data-testid="mvd-podglad-przedzial-2"]')).toBeNull();
    expect(container.querySelector('[data-testid="mvd-podglad-nn-2"]')).toBeTruthy();
    expect(tekstRysunku(container)).toContain('nN');
  });

  it('pole pomiarowe: tor napięciowy z boku, bez toru mocy w dół', () => {
    const symbole = symboleWRenderze(
      [pole('LINIA_ODG', 'ap-ODLACZNIK', undefined, SZABLON_UNIGEAR_MEASUREMENT.template_ref)],
      [SZABLON_UNIGEAR_MEASUREMENT],
    );
    expect(symbole).toEqual(['disconnector', 'voltageTransformer', 'earthSwitch']);
  });
});

describe('SLD-GEN-POLA — nagłówek pakietu rozdzielnicy', () => {
  const snFields = [
    pole('LINIA_IN', 'ap-ROZLACZNIK', undefined, SZABLON_SAFERING_LINE_IN.template_ref),
    pole('LINIA_OUT', 'ap-ROZLACZNIK', undefined, SZABLON_SAFERING_LINE_OUT.template_ref),
    pole('TRANSFORMATOROWE', 'ap-ROZLACZNIK_BEZPIECZNIKOWY', undefined, SZABLON_SAFERING_TRANSFORMER.template_ref),
  ];

  it('nagłówek czyta dane RODZINY: napięcie, prąd szyn, prąd zwarciowy, konstrukcja', () => {
    const podglad = zbudujPodglad({
      snFields,
      aparaty: KATALOG,
      transformatory: TRAFO,
      transformatorRef: 'tr-630',
      snVoltageKv: 15,
      szablonyPol: BLOK_RMU_K_K_T,
      rodzina: RODZINA_SAFERING,
      producent: 'ABB',
    });
    expect(podglad.naglowek.producent).toBe('ABB');
    expect(podglad.naglowek.rodzina).toBe('SafeRing');
    expect(podglad.naglowek.konstrukcja).toBe('RMU');
    // Nagłówek rysunku nazywa wielkość, którą deklaruje karta rodziny —
    // SafeRing podaje wyłącznie klasy urządzenia (rated voltage).
    expect(podglad.naglowek.klasaNapiecia).toBe('urządzenie 12 / 17,5 / 24 kV');
    expect(podglad.naglowek.pradSzyn).toBe('630 A');
    expect(podglad.naglowek.pradZwarciowy).toBe('16 / 20 / 21 kA');
    expect(podglad.naglowek.liczbaJednostek).toBe(3);
  });

  it('inna rodzina ⇒ inne wartości nagłówka (nagłówek nie jest zaszyty)', () => {
    const unigear = zbudujPodglad({
      snFields,
      aparaty: KATALOG,
      transformatory: TRAFO,
      transformatorRef: 'tr-630',
      snVoltageKv: 15,
      rodzina: RODZINA_UNIGEAR,
    });
    expect(unigear.naglowek.rodzina).toBe('UniGear ZS1');
    expect(unigear.naglowek.pradSzyn).toBe('1250 / 2500 / 4000 A');
    expect(unigear.naglowek.pradZwarciowy).toBe('25 / 31 / 50 / 63 kA');
    expect(unigear.naglowek.konstrukcja).toBe('Wysuwna');
  });

  it('szerokość całkowita jest JAWNYM BRAKIEM — katalog nie niesie wymiaru pola', () => {
    // Uczciwy stan zerowy zamiast liczby „typowej": wymiar wchodzi razem z
    // encją katalogowego pola. Zmyślona szerokość trafiłaby do dokumentacji.
    const podglad = zbudujPodglad({
      snFields,
      aparaty: KATALOG,
      transformatory: TRAFO,
      transformatorRef: 'tr-630',
      snVoltageKv: 15,
      rodzina: RODZINA_SAFERING,
    });
    expect(podglad.naglowek.szerokoscCalkowita).toBeNull();
    const { container } = render(
      <PodgladRozdzielnicySn
        snFields={snFields}
        aparaty={KATALOG}
        snVoltageKv={15}
        rodzina={RODZINA_SAFERING}
      />,
    );
    expect(container.querySelector('[data-testid="mvd-podglad-naglowek"]')?.textContent).toContain(
      'brak w karcie katalogowej',
    );
  });

  it('werdykt konfiguracji pochodzi z WEJŚCIA (walidator backendu), nie z UI', () => {
    // Cztery stany odczytu, każdy z własną prezentacją; UI nie ma trybu, w
    // którym sam orzeka o poprawności.
    for (const [status, tekst] of [
      ['VALID', 'przyjęta'],
      ['INVALID', 'odrzucona'],
      ['NIESPRAWDZONA', 'niesprawdzona'],
      ['SPRAWDZANIE', 'sprawdza'],
    ] as const) {
      const { container } = render(
        <PodgladRozdzielnicySn
          snFields={snFields}
          aparaty={KATALOG}
          snVoltageKv={15}
          rodzina={RODZINA_SAFERING}
          statusKonfiguracji={status}
          komunikatStatusu={status === 'INVALID' ? 'Pole transformatorowe bez aparatu.' : null}
        />,
      );
      const badge = container.querySelector('[data-testid="mvd-podglad-status"]');
      expect(badge?.getAttribute('data-status')).toBe(status);
      expect(badge?.textContent?.toLowerCase()).toContain(tekst);
    }
  });

  it('komunikat odrzucenia pokazywany jest BEZ tłumaczenia w UI', () => {
    const { container } = render(
      <PodgladRozdzielnicySn
        snFields={snFields}
        aparaty={KATALOG}
        snVoltageKv={15}
        rodzina={RODZINA_SAFERING}
        statusKonfiguracji="INVALID"
        komunikatStatusu="Pole transformatorowe wymaga wskazania aparatu."
      />,
    );
    expect(container.textContent).toContain('Pole transformatorowe wymaga wskazania aparatu.');
  });

  it('bez rodziny nagłówek pokazuje braki, a nie zera', () => {
    const podglad = zbudujPodglad({
      snFields,
      aparaty: KATALOG,
      transformatory: TRAFO,
      transformatorRef: null,
      snVoltageKv: 15,
    });
    expect(podglad.naglowek.rodzina).toBeNull();
    expect(podglad.naglowek.klasaNapiecia).toBeNull();
    expect(podglad.naglowek.pradSzyn).toBeNull();
    expect(podglad.naglowek.pradZwarciowy).toBeNull();
  });
});

describe('SLD-GEN-POLA — etykieta pola czyta dane katalogu', () => {
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

  it('opis pola niesie RODZINĘ i KOD KATALOGOWY pola, gdy pakiet jest dobrany', () => {
    const { container } = render(
      <PodgladRozdzielnicySn
        snFields={[pole('LINIA_OUT', 'ap-ROZLACZNIK', undefined, SZABLON_SAFERING_LINE_OUT.template_ref)]}
        aparaty={KATALOG}
        snVoltageKv={15}
        szablonyPol={[SZABLON_SAFERING_LINE_OUT]}
        rodzina={RODZINA_SAFERING}
      />,
    );
    const tekst = tekstRysunku(container);
    expect(tekst).toContain('SafeRing');
    expect(tekst).toContain('ABB__SAFERING__LINE_OUT');
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

  it('brak aparatu jest ZNACZONY jako usterka, nie zwykly opis (kolor bledu)', () => {
    // Znalezisko odbioru nadzoru (2026-08-13, karta MINI-RMU-CAD): sam komunikat
    // „aparat pola niewskazany" byl przypiety, ale FLAGA `brakAparatu` — jedyne,
    // co odrozni ten stan wizualnie (kolor bledu etykiety) — juz nie:
    // podmiana `brakAparatu` na stale `false` NIE czerwienila zadnego testu.
    // Deklaracja bez testu (KLASA-NIE-INSTANCJA §4): stan niekompletny musi byc
    // WIDOCZNY jako niekompletny, inaczej czyta sie jak poprawna konfiguracja.
    const bez = zbudujPodglad({
      snFields: [pole('LINIA_IN', null)],
      aparaty: KATALOG,
      transformatory: [],
      transformatorRef: null,
      snVoltageKv: 15,
    });
    const zAparatem = zbudujPodglad({
      snFields: [pole('LINIA_IN', 'ap-WYLACZNIK')],
      aparaty: KATALOG,
      transformatory: [],
      transformatorRef: null,
      snVoltageKv: 15,
    });

    expect(bez.sloty[0].brakAparatu).toBe(true);
    expect(zAparatem.sloty[0].brakAparatu).toBe(false);

    const { container } = render(
      <PodgladRozdzielnicySn snFields={[pole('LINIA_IN', null)]} aparaty={KATALOG} snVoltageKv={15} />,
    );
    const wErr = Array.from(container.querySelectorAll('text')).filter(
      (t) => (t.getAttribute('fill') ?? '').includes('--mvd-err'),
    );
    expect(wErr.length).toBeGreaterThan(0);
  });

  it('napięcie szyny z kontekstu; bez kontekstu — bez zmyślonej liczby', () => {
    const z = render(<PodgladRozdzielnicySn snFields={[pole('LINIA_IN', 'ap-WYLACZNIK')]} aparaty={KATALOG} snVoltageKv={15} />);
    expect(tekstRysunku(z.container)).toContain('Szyna SN 15 kV');
    const bez = render(<PodgladRozdzielnicySn snFields={[pole('LINIA_IN', 'ap-WYLACZNIK')]} aparaty={KATALOG} />);
    expect(tekstRysunku(bez.container)).toContain('Szyna SN');
    expect(tekstRysunku(bez.container)).not.toMatch(/Szyna SN \d/);
  });
});

describe('SLD-GEN-POLA — wyposażenie pola rysowane TYLKO z danych formularza', () => {
  it('bez wyposażenia i bez pakietu: sam aparat główny (zero fabrykacji)', () => {
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
    expect(symbole).toEqual(['protectionRelay', 'breaker']);
  });

  it('pełne wyposażenie pola pomiarowego: odłącznik + VT + przekaźnik', () => {
    const symbole = symboleWRenderze([
      pole('LINIA_ODG', 'ap-ODLACZNIK', {
        vt: { catalog_ref: 'vt-1' },
        relay: { catalog_ref: 'rel-1' },
      }),
    ]);
    expect(symbole).toEqual(['protectionRelay', 'disconnector', 'voltageTransformer']);
  });

  it('pozycja wyposażenia bez referencji katalogowej nic nie rysuje (pusty wpis ≠ element)', () => {
    const symbole = symboleWRenderze([
      pole('LINIA_IN', 'ap-WYLACZNIK', { ct: {}, vt: { catalog_ref: '  ' } }),
    ]);
    expect(symbole).toEqual(['breaker']);
  });

  it('wyposażenie NIE dubluje pozycji, którą rodzina już ma w składzie', () => {
    const symbole = symboleWRenderze(
      [pole('LINIA_OUT', 'ap-WYLACZNIK', { ct: { catalog_ref: 'ct-1' } }, SZABLON_UNIGEAR_LINE_OUT.template_ref)],
      [SZABLON_UNIGEAR_LINE_OUT],
    );
    expect(symbole.filter((s) => s === 'currentTransformer')).toHaveLength(1);
  });
});

describe('SLD-GEN-POLA — sprzęgło przerywa szynę (łącznik SZYN, nie odpływ)', () => {
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
        pole('SPRZEGLO', 'ap-WYLACZNIK', undefined, SZABLON_UNIGEAR_COUPLER.template_ref),
        pole('TRANSFORMATOROWE', 'ap-WYLACZNIK'),
      ],
      aparaty: KATALOG,
      transformatory: TRAFO,
      transformatorRef: 'tr-630',
      snVoltageKv: 15,
      szablonyPol: [SZABLON_UNIGEAR_COUPLER],
    });
    expect(podglad.odcinkiSzyny).toHaveLength(2);
    const sprzeglo = podglad.sloty[1];
    expect(sprzeglo.przerwaSzyny).not.toBeNull();
    // Tor wraca na poziom szyny po prawej stronie przerwy (kształt „U").
    const powrot = sprzeglo.scena.tor.filter((t) => t[3] === podglad.szynaY && t[1] !== podglad.szynaY);
    expect(powrot.length).toBe(1);
    expect(powrot[0][2]).toBeCloseTo(sprzeglo.przerwaSzyny?.[1] ?? -1, 6);
  });
});

describe('SLD-GEN-POLA — zejścia pól liniowych w jednej linii', () => {
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
    const gornySymbol = podglad.sloty.map((s) => s.scena.symbole[0].y);
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

describe('SLD-GEN-POLA — układ: etykiety nie stykają się, rysunek nie wychodzi ze slotu', () => {
  const dlugieRole: readonly SnFieldRole[] = [
    'LINIA_IN',
    'LINIA_OUT',
    'LINIA_ODG',
    'SPRZEGLO',
    'TRANSFORMATOROWE',
  ];
  const SZABLONY = [
    SZABLON_UNIGEAR_LINE_OUT,
    SZABLON_UNIGEAR_TRANSFORMER,
    SZABLON_UNIGEAR_COUPLER,
    SZABLON_UNIGEAR_MEASUREMENT,
    SZABLON_SAFERING_LINE_OUT,
  ];

  // ILOCZYN CECH układu: liczba pól × obecność wyposażenia × obecność
  // kompozycji rodziny. Kompozycja POGŁĘBIA i POSZERZA rysunek (pełny skład
  // celki + odgałęzienia + oznaczenia Q), więc wariant bez niej maskowałby
  // układ, w którym szerokość slotu nie wynika z tego, co w nim stoi.
  for (const liczba of [3, 4, 5, 6, 7, 8]) {
    for (const zWyposazeniem of [false, true]) {
      for (const zKompozycja of [false, true]) {
        it(`${liczba} pól (${zWyposazeniem ? 'z wyposażeniem' : 'bez'}, ${zKompozycja ? 'z kompozycją' : 'bez kompozycji'}): zero kolizji i zero wyjść poza slot`, () => {
          const wyposazenie = zWyposazeniem
            ? {
                ct: { catalog_ref: 'ct-1' },
                vt: { catalog_ref: 'vt-1' },
                relay: { catalog_ref: 'rel-1' },
              }
            : undefined;
          const snFields = Array.from({ length: liczba }, (_, i) =>
            pole(
              dlugieRole[i % dlugieRole.length],
              `ap-${Object.keys(OCZEKIWANY_SYMBOL)[i % 6]}`,
              wyposazenie,
              zKompozycja ? SZABLONY[i % SZABLONY.length].template_ref : 'brak-pakietu',
            ),
          );
          const podglad = zbudujPodglad({
            snFields,
            aparaty: KATALOG_REALNY,
            transformatory: TRAFO,
            transformatorRef: 'tr-630',
            snVoltageKv: 15,
            szablonyPol: zKompozycja ? SZABLONY : [],
            rodzina: RODZINA_UNIGEAR,
          });
          expect(kolizjeEtykiet(podglad)).toEqual([]);
          expect(wyjsciaPozaSlot(podglad)).toEqual([]);
        });
      }
    }
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

  it('wyrocznia zasięgu faktycznie łapie rysunek wychodzący poza slot', () => {
    const podglad = zbudujPodglad({
      snFields: [
        pole('LINIA_IN', 'ap-WYLACZNIK', undefined, SZABLON_UNIGEAR_LINE_OUT.template_ref),
        pole('LINIA_OUT', 'ap-WYLACZNIK', undefined, SZABLON_UNIGEAR_LINE_OUT.template_ref),
      ],
      aparaty: KATALOG,
      transformatory: TRAFO,
      transformatorRef: 'tr-630',
      snVoltageKv: 15,
      szablonyPol: [SZABLON_UNIGEAR_LINE_OUT],
    });
    const zwezony = {
      ...podglad,
      sloty: podglad.sloty.map((s) => ({ ...s, szerokosc: 4 })),
    };
    expect(wyjsciaPozaSlot(zwezony).length).toBeGreaterThan(0);
  });
});

describe('SLD-GEN-POLA — determinizm rysunku', () => {
  it('ta sama konfiguracja ⇒ bajt-identyczny SVG', () => {
    const snFields = [
      pole('LINIA_IN', 'ap-REKLOZER', undefined, SZABLON_UNIGEAR_LINE_OUT.template_ref),
      pole('LINIA_OUT', 'ap-ROZLACZNIK', undefined, SZABLON_SAFERING_LINE_OUT.template_ref),
      pole('LINIA_ODG', 'ap-WYLACZNIK'),
      pole('TRANSFORMATOROWE', 'ap-ROZLACZNIK_BEZPIECZNIKOWY', undefined, SZABLON_UNIGEAR_TRANSFORMER.template_ref),
    ];
    const el = (
      <PodgladRozdzielnicySn
        snFields={snFields}
        aparaty={KATALOG}
        transformatory={TRAFO}
        transformatorRef="tr-630"
        snVoltageKv={15}
        szablonyPol={[SZABLON_UNIGEAR_LINE_OUT, SZABLON_SAFERING_LINE_OUT, SZABLON_UNIGEAR_TRANSFORMER]}
        rodzina={RODZINA_UNIGEAR}
      />
    );
    expect(renderToStaticMarkup(el)).toBe(renderToStaticMarkup(el));
  });

  it('struktura rysunku stacji 4-polowej BEZ pakietów: symbole per pole w kolejności listy', () => {
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
      (s) => `${s.numer}:${s.rola}:${s.scena.symbole.map((sym) => sym.id).join('+')}`,
    );
    expect(struktura).toEqual([
      '1:LINIA_IN:recloser',
      '2:LINIA_OUT:loadBreakSwitch',
      '3:LINIA_ODG:breaker+currentTransformer',
      '4:TRANSFORMATOROWE:fuseSwitch+transformer2W',
    ]);
  });

  it('struktura rysunku stacji RMU K-K-T (blok fabryczny kabel–kabel–transformator)', () => {
    const podglad = zbudujPodglad({
      snFields: [
        pole('LINIA_IN', 'ap-ROZLACZNIK', undefined, SZABLON_SAFERING_LINE_IN.template_ref),
        pole('LINIA_OUT', 'ap-ROZLACZNIK', undefined, SZABLON_SAFERING_LINE_OUT.template_ref),
        pole('TRANSFORMATOROWE', 'ap-ROZLACZNIK_BEZPIECZNIKOWY', undefined, SZABLON_SAFERING_TRANSFORMER.template_ref),
      ],
      aparaty: KATALOG_REALNY,
      transformatory: TRAFO,
      transformatorRef: 'tr-630',
      snVoltageKv: 15,
      szablonyPol: BLOK_RMU_K_K_T,
      rodzina: RODZINA_SAFERING,
      producent: 'ABB',
    });
    const struktura = podglad.sloty.map(
      (s) =>
        `${s.numer}:${s.rola}:${s.scena.symbole.map((sym) => `${sym.oznaczenie}=${sym.id}`).join('>')}`,
    );
    expect(struktura).toEqual([
      '1:LINIA_IN:Q1=disconnector>Q0=loadBreakSwitch>Q2=disconnector>Q9=earthSwitch>GK=cableHead',
      '2:LINIA_OUT:Q1=disconnector>Q0=loadBreakSwitch>Q2=disconnector>Q9=earthSwitch>GK=cableHead',
      '3:TRANSFORMATOROWE:Q1=disconnector>Q0=fuseSwitch>Q2=disconnector>Q9=earthSwitch>TR=transformer2W',
    ]);
    // Jednostki kablowe pierścienia mają przedział kablowy, transformatorowa —
    // stronę nN. Blok K-K-T czyta się z rysunku, nie z podpisów.
    expect(podglad.sloty.map((s) => s.scena.strefaKablowa !== null)).toEqual([true, true, false]);
    expect(podglad.sloty.map((s) => s.scena.kreskaNn !== null)).toEqual([false, false, true]);
    expect(kolizjeEtykiet(podglad)).toEqual([]);
    expect(wyjsciaPozaSlot(podglad)).toEqual([]);
  });

  it('struktura rysunku stacji sekcyjnej z pomiarem: sprzęgło, VT na odgałęzieniu, TR', () => {
    const podglad = zbudujPodglad({
      snFields: [
        pole('LINIA_IN', 'ap-WYLACZNIK', { ct: { catalog_ref: 'ct-1' }, relay: { catalog_ref: 'rel-1' } }),
        pole('LINIA_ODG', 'ap-ODLACZNIK', { vt: { catalog_ref: 'vt-1' } }),
        pole('SPRZEGLO', 'ap-ROZLACZNIK'),
        pole('TRANSFORMATOROWE', 'ap-ROZLACZNIK_BEZPIECZNIKOWY', { ct: { catalog_ref: 'ct-1' } }),
      ],
      aparaty: KATALOG_REALNY,
      transformatory: TRAFO,
      transformatorRef: 'tr-630',
      snVoltageKv: 15,
    });
    expect(
      podglad.sloty.map((s) => `${s.numer}:${s.rola}:${s.scena.symbole.map((sym) => sym.id).join('+')}`),
    ).toEqual([
      '1:LINIA_IN:protectionRelay+breaker+currentTransformer',
      '2:LINIA_ODG:disconnector+voltageTransformer',
      '3:SPRZEGLO:loadBreakSwitch',
      '4:TRANSFORMATOROWE:fuseSwitch+currentTransformer+transformer2W',
    ]);
    // Szyna w dwóch sekcjach WYŁĄCZNIE z powodu sprzęgła.
    expect(podglad.odcinkiSzyny).toHaveLength(2);
    expect(kolizjeEtykiet(podglad)).toEqual([]);
  });

  it('dwa pola tej samej roli mają ROZŁĄCZNE identyfikatory (numer w testid)', () => {
    const { container } = render(
      <PodgladRozdzielnicySn
        snFields={[pole('LINIA_ODG', 'ap-WYLACZNIK'), pole('LINIA_ODG', 'ap-ROZLACZNIK')]}
        aparaty={KATALOG}
        snVoltageKv={15}
      />,
    );
    const ids = Array.from(container.querySelectorAll('[data-testid^="mvd-podglad-pole-"]')).map(
      (el) => el.getAttribute('data-testid'),
    );
    expect(ids).toEqual(['mvd-podglad-pole-1-LINIA_ODG', 'mvd-podglad-pole-2-LINIA_ODG']);
  });

  it('rozdzielnica bez pól nie wywraca rysunku (uczciwy stan pusty)', () => {
    const { container } = render(<PodgladRozdzielnicySn snFields={[]} aparaty={KATALOG} />);
    expect(container.querySelector('svg')).toBeTruthy();
    expect(container.querySelectorAll('[data-symbol-canon]').length).toBe(0);
    expect(container.querySelector('[data-testid="mvd-podglad-naglowek"]')).toBeTruthy();
  });
});
