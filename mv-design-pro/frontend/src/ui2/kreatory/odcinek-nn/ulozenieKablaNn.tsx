/**
 * Warunki ułożenia kabla nN (PN-HD 60364-5-52) — JEDNA sekcja formularza dla dwóch operacji:
 * nowy odcinek (`add_nn_cable_segment`, kreator „Odcinek nN") i zmiana warunków istniejącego
 * odcinka (`set_nn_cable_laying_conditions`, menu kontekstowe kabla na schemacie nN).
 *
 * Opis trafia do operacji jako SUROWY WYBÓR (środowisko, izolacja, temperatura, liczba
 * obwodów, rezystywność gruntu); współczynniki i Iz′ składa backend (`wspolczynniki_nn`).
 */

import { useMemo, useState } from 'react';

import type { NNCableLayingConditionsDescription } from '../../../types/domainOps';
import { KreatorInfo, KreatorSekcja, KreatorSiatka, PanelTeorii, PoleLiczbowe, PolePrzelacznik, PoleWyboru } from '../rama';
import { ODCINEK_NN_STRINGS as T } from './strings';

export type TrybUlozenia = 'katalogowe' | 'wlasne';
type Srodowisko = NNCableLayingConditionsDescription['environment'];
type Izolacja = NNCableLayingConditionsDescription['insulation'];

export interface UlozenieKablaNn {
  readonly tryb: TrybUlozenia;
  readonly setTryb: (v: TrybUlozenia) => void;
  readonly srodowisko: Srodowisko;
  readonly setSrodowisko: (v: Srodowisko) => void;
  readonly izolacja: Izolacja;
  readonly setIzolacja: (v: Izolacja) => void;
  readonly temperaturaC: number | null;
  readonly setTemperaturaC: (v: number | null) => void;
  readonly liczbaObwodow: number | null;
  readonly setLiczbaObwodow: (v: number | null) => void;
  readonly rezystywnoscGruntu: number | null;
  readonly setRezystywnoscGruntu: (v: number | null) => void;
  /** Opis do operacji albo `null` (warunki katalogowe albo opis niekompletny). */
  readonly opis: NNCableLayingConditionsDescription | null;
  /** Tryb „własne" z kompletem pól wymaganych (grunt: także rezystywność). */
  readonly kompletny: boolean;
}

function liczba(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

/** Stan sekcji; `poczatkowe` = zapisane warunki odcinka (`meta.cable_laying_conditions`). */
export function useUlozenieKablaNn(poczatkowe?: Readonly<Record<string, unknown>> | null): UlozenieKablaNn {
  const zapisane = poczatkowe && typeof poczatkowe === 'object' ? poczatkowe : null;
  const [tryb, setTryb] = useState<TrybUlozenia>(zapisane ? 'wlasne' : 'katalogowe');
  const [srodowisko, setSrodowisko] = useState<Srodowisko>(
    zapisane?.environment === 'grunt' ? 'grunt' : 'powietrze',
  );
  const [izolacja, setIzolacja] = useState<Izolacja>(zapisane?.insulation === 'XLPE' ? 'XLPE' : 'PVC');
  const [temperaturaC, setTemperaturaC] = useState<number | null>(liczba(zapisane?.ambient_temperature_c) ?? 25);
  const [liczbaObwodow, setLiczbaObwodow] = useState<number | null>(liczba(zapisane?.circuit_count) ?? 1);
  const [rezystywnoscGruntu, setRezystywnoscGruntu] = useState<number | null>(
    liczba(zapisane?.soil_thermal_resistivity_km_w),
  );

  const kompletny =
    tryb === 'wlasne'
    && temperaturaC !== null
    && liczbaObwodow !== null
    && (srodowisko !== 'grunt' || rezystywnoscGruntu !== null);

  const opis = useMemo<NNCableLayingConditionsDescription | null>(
    () =>
      tryb === 'wlasne' && temperaturaC !== null && liczbaObwodow !== null
        ? {
            environment: srodowisko,
            insulation: izolacja,
            ambient_temperature_c: temperaturaC,
            circuit_count: liczbaObwodow,
            ...(srodowisko === 'grunt' ? { soil_thermal_resistivity_km_w: rezystywnoscGruntu ?? undefined } : {}),
          }
        : null,
    [izolacja, liczbaObwodow, rezystywnoscGruntu, srodowisko, temperaturaC, tryb],
  );

  return {
    tryb,
    setTryb,
    srodowisko,
    setSrodowisko,
    izolacja,
    setIzolacja,
    temperaturaC,
    setTemperaturaC,
    liczbaObwodow,
    setLiczbaObwodow,
    rezystywnoscGruntu,
    setRezystywnoscGruntu,
    opis,
    kompletny,
  };
}

export function SekcjaUlozeniaKablaNn({
  ulozenie,
  testid,
}: {
  readonly ulozenie: UlozenieKablaNn;
  /** Prefiks identyfikatorów testowych pól (np. `mvd-kreator-odcinek-nn`). */
  readonly testid: string;
}) {
  const u = ulozenie;
  return (
    <KreatorSekcja tytul={T.sekcjaUlozenieTytul} testid={`${testid}-ulozenie`}>
      <KreatorInfo>{T.ulozeniePomoc}</KreatorInfo>
      <PolePrzelacznik
        opcje={[
          { id: 'katalogowe', etykieta: T.ulozenieKatalogowe },
          { id: 'wlasne', etykieta: T.ulozenieWlasne },
        ]}
        wartosc={u.tryb}
        onZmiana={(v) => u.setTryb(v as TrybUlozenia)}
        testid={`${testid}-tryb-ulozenia`}
      />
      {u.tryb === 'wlasne' ? (
        <KreatorSiatka kolumny={2}>
          <PoleWyboru
            etykieta={T.srodowisko}
            wartosc={u.srodowisko}
            onZmiana={(v) => u.setSrodowisko(v as Srodowisko)}
            opcje={[
              { id: 'powietrze', etykieta: T.srodowiskoPowietrze },
              { id: 'grunt', etykieta: T.srodowiskoGrunt },
            ]}
            testid={`${testid}-srodowisko`}
          />
          <PoleWyboru
            etykieta={T.izolacja}
            wartosc={u.izolacja}
            onZmiana={(v) => u.setIzolacja(v as Izolacja)}
            opcje={[
              { id: 'PVC', etykieta: 'PVC' },
              { id: 'XLPE', etykieta: 'XLPE' },
            ]}
            testid={`${testid}-izolacja`}
          />
          <PoleLiczbowe
            etykieta={T.temperatura}
            jednostka="°C"
            wartosc={u.temperaturaC}
            onZmiana={u.setTemperaturaC}
            testid={`${testid}-temperatura`}
          />
          <PoleLiczbowe
            etykieta={T.liczbaObwodow}
            wartosc={u.liczbaObwodow}
            onZmiana={u.setLiczbaObwodow}
            min={1}
            krok={1}
            testid={`${testid}-liczba-obwodow`}
          />
          {u.srodowisko === 'grunt' ? (
            <PoleLiczbowe
              etykieta={T.rezystywnoscGruntu}
              jednostka="K·m/W"
              wartosc={u.rezystywnoscGruntu}
              onZmiana={u.setRezystywnoscGruntu}
              wymagane
              testid={`${testid}-rezystywnosc`}
            />
          ) : null}
        </KreatorSiatka>
      ) : null}
      <KreatorInfo>{T.izPrimaBrak}</KreatorInfo>
      <PanelTeorii
        tytul={T.teoriaTytul}
        opis={T.teoriaOpis}
        wymog={T.teoriaWymog}
        podstawa={T.teoriaPodstawa}
        testid={`${testid}-teoria`}
      />
    </KreatorSekcja>
  );
}
