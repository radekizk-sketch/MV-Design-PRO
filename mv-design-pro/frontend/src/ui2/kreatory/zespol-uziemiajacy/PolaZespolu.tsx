/**
 * Pola zespołu uziemiającego SN wspólne dla dwóch kreatorów (karta
 * UX-04/POLE-ZU-SKLADOWA-ZEROWA): kreatora „Zespół uziemiający SN" (operacja
 * `add_zespol_uziemiajacy_sn`) i kreatora GPZ (wpisy `add_grid_source_sn.zespoly_uziemiajace`
 * — ładunek tej samej operacji). Jeden formularz, jeden model (`zespolModel.ts`), te same
 * trzy przestrzenie katalogu — bez drugiej kopii pól w kreatorze GPZ.
 *
 * ZERO fizyki: pola pokazują wartości katalogu (z oznaczeniem wartości roboczych), nie liczą
 * impedancji; dopuszczalność ocenia próba `dry_run` operacji.
 */

import { useEffect, useMemo, useState } from 'react';

import {
  fetchArcSuppressionCoilTypes,
  fetchEarthingTransformerTypes,
  fetchNeutralEarthingResistorTypes,
  getCatalogErrorMessage,
} from '../../../ui/catalog/api';
import type {
  ArcSuppressionCoilCatalogType,
  EarthingTransformerCatalogType,
  NeutralEarthingResistorCatalogType,
} from '../../../ui/catalog/types';
import {
  KreatorInfo,
  KreatorSiatka,
  PoleKatalogu,
  PoleLiczbowe,
  PolePrzelacznik,
  PolePrzelacznikBinarny,
  PoleWyboru,
  RzadWartosci,
  bladPola,
  type BladPola,
  type OpcjaWyboru,
} from '../rama';
import {
  fmtLiczba,
  maDlawik,
  maRezystor,
  type StanOdlacznika,
  type StronaAwsc,
  type WariantZespolu,
  type ZespolFormData,
} from './zespolModel';
import { ZESPOL_UZIEMIAJACY_STRINGS as T } from './strings';

export const OPCJE_WARIANTU: readonly OpcjaWyboru[] = [
  { id: 'dlawik', etykieta: T.wariantDlawik },
  { id: 'dlawik_rezystor', etykieta: T.wariantDlawikRezystor },
  { id: 'rezystor', etykieta: T.wariantRezystor },
  { id: 'bezposrednie', etykieta: T.wariantBezposrednie },
];

const OPCJE_ODLACZNIKA: readonly OpcjaWyboru[] = [
  { id: 'zamkniety', etykieta: T.stanZamkniety },
  { id: 'otwarty', etykieta: T.stanOtwarty },
];

const OPCJE_STRONY: readonly OpcjaWyboru[] = [
  { id: '', etykieta: '—' },
  { id: 'pierwotna', etykieta: T.stronaPierwotna },
  { id: 'wtorna', etykieta: T.stronaWtorna },
];

export type Katalog<T> = {
  readonly typy: readonly T[];
  readonly blad: string | null;
  readonly ladowanie: boolean;
};

export interface KatalogiZespolu {
  readonly tu: Katalog<EarthingTransformerCatalogType>;
  readonly dl: Katalog<ArcSuppressionCoilCatalogType>;
  readonly rz: Katalog<NeutralEarthingResistorCatalogType>;
  readonly ladowanie: boolean;
}

function useKatalog<T>(pobierz: () => Promise<T[]>): Katalog<T> {
  const [stan, setStan] = useState<Katalog<T>>({ typy: [], blad: null, ladowanie: true });
  useEffect(() => {
    let cancelled = false;
    pobierz()
      .then((typy) => {
        if (!cancelled) setStan({ typy: Array.isArray(typy) ? typy : [], blad: null, ladowanie: false });
      })
      .catch((e: unknown) => {
        if (!cancelled) setStan({ typy: [], blad: getCatalogErrorMessage(e), ladowanie: false });
      });
    return () => {
      cancelled = true;
    };
  }, [pobierz]);
  return stan;
}

/** Trzy przestrzenie katalogu zespołu: transformator uziemiający, dławik, rezystor. */
export function useKatalogiZespolu(): KatalogiZespolu {
  const tu = useKatalog<EarthingTransformerCatalogType>(fetchEarthingTransformerTypes);
  const dl = useKatalog<ArcSuppressionCoilCatalogType>(fetchArcSuppressionCoilTypes);
  const rz = useKatalog<NeutralEarthingResistorCatalogType>(fetchNeutralEarthingResistorTypes);
  return { tu, dl, rz, ladowanie: tu.ladowanie || dl.ladowanie || rz.ladowanie };
}

function czyRobocza(wartosci: Readonly<Record<string, string>> | null | undefined, pole: string): boolean {
  return Boolean(wartosci && pole in wartosci);
}

function statusKatalogu(k: Katalog<unknown>): 'error' | 'loading' | 'ready' {
  return k.blad ? 'error' : k.ladowanie ? 'loading' : 'ready';
}

export type ZmianaZespolu = <K extends keyof ZespolFormData>(pole: K, wartosc: ZespolFormData[K]) => void;

export interface PolaZespoluProps {
  readonly dane: ZespolFormData;
  readonly zmien: ZmianaZespolu;
  readonly katalogi: KatalogiZespolu;
  readonly bledy: readonly BladPola[];
  /** Przedrostek identyfikatorów testowych (`mvd-kreator-zu` albo `mvd-kreator-zrodlo-zu`). */
  readonly prefiks: string;
}

/** Układ punktu neutralnego (Z.13 / Z.14 / Z.15 / bezpośrednie) i transformator uziemiający. */
export function PolaUkladuZespolu({ dane, zmien, katalogi, bledy, prefiks }: PolaZespoluProps) {
  const opcjeTu = useMemo(
    () => katalogi.tu.typy.map((t) => ({ id: t.id, etykieta: t.name })),
    [katalogi.tu.typy],
  );
  const tu = katalogi.tu.typy.find((t) => t.id === dane.catalog_ref) ?? null;
  return (
    <>
      <PolePrzelacznik
        etykieta={T.wariant}
        opcje={OPCJE_WARIANTU}
        wartosc={dane.wariant}
        onZmiana={(id) => zmien('wariant', id as WariantZespolu)}
        testid={`${prefiks}-wariant`}
      />
      <KreatorInfo>{T.wariantPomoc}</KreatorInfo>
      {dane.wariant === 'bezposrednie' ? <KreatorInfo>{T.bezposrednie}</KreatorInfo> : null}
      <PoleKatalogu
        etykieta={T.typTransformatora}
        wartosc={dane.catalog_ref}
        onZmiana={(v) => zmien('catalog_ref', v)}
        opcje={opcjeTu}
        status={statusKatalogu(katalogi.tu)}
        placeholder={T.typTransformatoraPlaceholder}
        komunikatBledu={katalogi.tu.blad ?? T.typTransformatoraBlad}
        wymagane
        blad={bladPola(bledy, 'catalog_ref')}
        testid={`${prefiks}-transformator`}
      />
      {tu ? (
        <KreatorSiatka kolumny={2}>
          <RzadWartosci etykieta={T.paramUn} wartosc={fmtLiczba(tu.u_n_kv, 'kV', 0)} />
          <RzadWartosci
            etykieta={T.paramZ0}
            wartosc={`${fmtLiczba(tu.r0_ohm, 'Ω', 2)} + j${fmtLiczba(tu.x0_ohm, 'Ω', 2)}${
              czyRobocza(tu.wartosci_robocze, 'r0_ohm') ? ` (${T.wartoscRobocza})` : ''
            }`}
          />
        </KreatorSiatka>
      ) : null}
    </>
  );
}

/** Elementy punktu neutralnego: dławik (nastawa, odłącznik, AWSC) i rezystor (odłącznik). */
export function PolaElementowZespolu({ dane, zmien, katalogi, bledy, prefiks }: PolaZespoluProps) {
  const opcjeDl = useMemo(
    () => katalogi.dl.typy.map((t) => ({ id: t.id, etykieta: t.name })),
    [katalogi.dl.typy],
  );
  const opcjeRz = useMemo(
    () => katalogi.rz.typy.map((t) => ({ id: t.id, etykieta: t.name })),
    [katalogi.rz.typy],
  );
  const dl = katalogi.dl.typy.find((t) => t.id === dane.dlawik_catalog_ref) ?? null;
  const rz = katalogi.rz.typy.find((t) => t.id === dane.rezystor_catalog_ref) ?? null;
  return (
    <>
      {maDlawik(dane.wariant) ? (
        <>
          <PoleKatalogu
            etykieta={T.typDlawika}
            wartosc={dane.dlawik_catalog_ref}
            onZmiana={(v) => zmien('dlawik_catalog_ref', v)}
            opcje={opcjeDl}
            status={statusKatalogu(katalogi.dl)}
            placeholder={T.typDlawikaPlaceholder}
            komunikatBledu={katalogi.dl.blad ?? T.typDlawikaBlad}
            wymagane
            blad={bladPola(bledy, 'dlawik.catalog_ref')}
            testid={`${prefiks}-dlawik`}
          />
          {dl ? <RzadWartosci etykieta={T.paramZakres} wartosc={`${dl.i_min_a}–${dl.i_max_a} A`} /> : null}
          <KreatorSiatka kolumny={2}>
            <PoleWyboru
              etykieta={T.odlacznikDlawika}
              wartosc={dane.dlawik_stan_odlacznika}
              onZmiana={(v) => zmien('dlawik_stan_odlacznika', v as StanOdlacznika)}
              opcje={OPCJE_ODLACZNIKA}
              testid={`${prefiks}-dlawik-odlacznik`}
            />
            <PoleLiczbowe
              etykieta={T.nastawaDlawika}
              wartosc={dane.dlawik_i_nastawy_a}
              onZmiana={(v) => zmien('dlawik_i_nastawy_a', v)}
              min={0}
              pomoc={T.nastawaDlawikaPomoc}
              testid={`${prefiks}-dlawik-nastawa`}
            />
          </KreatorSiatka>
          {dane.wariant === 'dlawik' ? (
            <>
              <PolePrzelacznikBinarny
                etykieta={T.awsc}
                wlaczone={dane.awsc}
                onZmiana={(v) => zmien('awsc', v)}
                opis={T.awscOpis}
                testid={`${prefiks}-awsc`}
              />
              {dane.awsc ? (
                <KreatorSiatka kolumny={2}>
                  <PoleLiczbowe
                    etykieta={T.pradAwsc}
                    wartosc={dane.awsc_i_wymuszany_a}
                    onZmiana={(v) => zmien('awsc_i_wymuszany_a', v)}
                    min={0}
                    testid={`${prefiks}-awsc-prad`}
                  />
                  <PoleLiczbowe
                    etykieta={T.czasZalaczeniaAwsc}
                    wartosc={dane.awsc_czas_zalaczenia_s}
                    onZmiana={(v) => zmien('awsc_czas_zalaczenia_s', v)}
                    min={0}
                    testid={`${prefiks}-awsc-czas`}
                  />
                  <PoleLiczbowe
                    etykieta={T.zwlokaAwsc}
                    wartosc={dane.awsc_czas_zwloki_s}
                    onZmiana={(v) => zmien('awsc_czas_zwloki_s', v)}
                    min={0}
                    testid={`${prefiks}-awsc-zwloka`}
                  />
                  <PoleWyboru
                    etykieta={T.stronaAwsc}
                    wartosc={dane.awsc_strona ?? ''}
                    onZmiana={(v) => zmien('awsc_strona', v ? (v as StronaAwsc) : null)}
                    opcje={OPCJE_STRONY}
                    testid={`${prefiks}-awsc-strona`}
                  />
                </KreatorSiatka>
              ) : null}
            </>
          ) : null}
        </>
      ) : null}
      {maRezystor(dane.wariant) ? (
        <>
          <PoleKatalogu
            etykieta={T.typRezystora}
            wartosc={dane.rezystor_catalog_ref}
            onZmiana={(v) => zmien('rezystor_catalog_ref', v)}
            opcje={opcjeRz}
            status={statusKatalogu(katalogi.rz)}
            placeholder={T.typRezystoraPlaceholder}
            komunikatBledu={katalogi.rz.blad ?? T.typRezystoraBlad}
            wymagane
            blad={bladPola(bledy, 'rezystor.catalog_ref')}
            testid={`${prefiks}-rezystor`}
          />
          {rz ? (
            <KreatorSiatka kolumny={2}>
              <RzadWartosci etykieta={T.paramR} wartosc={fmtLiczba(rz.r_ohm, 'Ω', 2)} />
              <RzadWartosci
                etykieta={T.paramIn}
                wartosc={`${fmtLiczba(rz.i_n_a, 'A', 0)}${
                  czyRobocza(rz.wartosci_robocze, 'i_n_a') ? ` (${T.wartoscRobocza})` : ''
                }`}
              />
            </KreatorSiatka>
          ) : null}
          <PoleWyboru
            etykieta={T.odlacznikRezystora}
            wartosc={dane.rezystor_stan_odlacznika}
            onZmiana={(v) => zmien('rezystor_stan_odlacznika', v as StanOdlacznika)}
            opcje={OPCJE_ODLACZNIKA}
            testid={`${prefiks}-rezystor-odlacznik`}
          />
        </>
      ) : null}
    </>
  );
}
