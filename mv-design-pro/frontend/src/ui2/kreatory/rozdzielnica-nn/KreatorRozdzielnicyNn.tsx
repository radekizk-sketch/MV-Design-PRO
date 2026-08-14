/**
 * Kreator „Rozdzielnica nN" — ui2, framework kreatory/rama. DWA TRYBY (wzorzec
 * `KreatorPolaNn` isSource) na DWÓCH operacjach domenowych:
 *
 * - domyślnie: `add_nn_distribution_board` — nowa rozdzielnica/podrozdzielnica
 *   nN (szyna główna + sekcja 1), opcjonalnie zasilona OD RAZU odcinkiem
 *   kablowym (`payload.supply`, JEDEN zapis — reuse wewnętrznego wywołania
 *   `add_nn_cable_segment` po stronie backendu, zero duplikacji fizyki);
 * - gdy kontekst wskazuje ISTNIEJĄCĄ rozdzielnicę nN (`station_ref` o
 *   `station_type === 'rozdzielnica_nn'`): `add_nn_section_coupler` — nowa
 *   sekcja + sprzęgło sekcyjne w tej rozdzielnicy.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';

import { useAppStateStore } from '../../../ui/app-state';
import { fetchLvApparatusTypes, fetchLvCableTypes, getCatalogErrorMessage } from '../../../ui/catalog/api';
import type { LVApparatusType, LVCableType } from '../../../ui/catalog/types';
import { resolveBusNnRef, resolveStationRef, stationLabel } from '../../../ui/network-build/forms/enmResolvers';
import { validateCatalogFirst } from '../../../ui/network-build/forms/catalogFirstRules';
import { useActiveOperationForm, useNetworkBuildStore } from '../../../ui/network-build/networkBuildStore';
import { useSnapshotStore } from '../../../ui/topology/snapshotStore';
import type { AddNNDistributionBoardPayload, AddNNSectionCouplerPayload } from '../../../types/domainOps';
import {
  KreatorGotowosc,
  KreatorInfo,
  KreatorNastepnyKrok,
  KreatorRama,
  KreatorSekcja,
  KreatorSiatka,
  PoleKatalogu,
  PoleLiczbowe,
  PolePrzelacznikBinarny,
  PoleTekstowe,
  PoleWyboru,
  RzadWartosci,
  useSelekcjaPoOperacjiBezNawigacji,
  type WierszGotowosci,
} from '../rama';
import { rozdzielnicaNnStrings } from './strings';

export function KreatorRozdzielnicyNn() {
  const activeForm = useActiveOperationForm();
  const context = activeForm?.context as Record<string, unknown> | undefined;
  const closeForm = useNetworkBuildStore((s) => s.closeOperationForm);
  const executeDomainOperation = useSnapshotStore((s) => s.executeDomainOperation);
  const snapshot = useSnapshotStore((s) => s.snapshot);
  const activeCaseId = useAppStateStore((s) => s.activeCaseId);
  const selekcja = useSelekcjaPoOperacjiBezNawigacji();

  const stationRef = useMemo(() => resolveStationRef(context, snapshot), [context, snapshot]);
  const station = useMemo(
    () => snapshot?.substations.find((s) => s.ref_id === stationRef || s.id === stationRef) ?? null,
    [snapshot, stationRef],
  );
  const trybSekcja = station?.station_type === 'rozdzielnica_nn';
  const T = useMemo(() => rozdzielnicaNnStrings(trybSekcja), [trybSekcja]);

  const supplyFromBusRef = useMemo(() => resolveBusNnRef(context, snapshot), [context, snapshot]);
  const supplyFromBus = useMemo(
    () => snapshot?.buses.find((b) => b.ref_id === supplyFromBusRef || b.id === supplyFromBusRef) ?? null,
    [snapshot, supplyFromBusRef],
  );

  // --- Tryb A: nowa rozdzielnica ---
  const [napiecieKv, setNapiecieKv] = useState<number | null>(supplyFromBus?.voltage_kv ?? 0.4);
  const [nazwa, setNazwa] = useState('');
  const [oznaczenie, setOznaczenie] = useState('');
  const [konstrukcja, setKonstrukcja] = useState('');
  const [zasilWlaczone, setZasilWlaczone] = useState(false);
  const [kableDlugoscM, setKableDlugoscM] = useState<number | null>(null);
  const [kableCatalogRef, setKableCatalogRef] = useState<string | null>(null);
  const [kable, setKable] = useState<LVCableType[]>([]);
  const [bladKabli, setBladKabli] = useState<string | null>(null);

  useEffect(() => {
    if (trybSekcja) return;
    let anulowane = false;
    fetchLvCableTypes()
      .then((dane) => {
        if (!anulowane) setKable(Array.isArray(dane) ? dane : []);
      })
      .catch((e: unknown) => {
        if (!anulowane) setBladKabli(getCatalogErrorMessage(e));
      });
    return () => {
      anulowane = true;
    };
  }, [trybSekcja]);

  // --- Tryb B: nowa sekcja + sprzęgło ---
  const [sprzegloCatalogRef, setSprzegloCatalogRef] = useState<string | null>(null);
  const [sekcjaNazwa, setSekcjaNazwa] = useState('');
  const [aparaty, setAparaty] = useState<LVApparatusType[]>([]);
  const [bladAparatow, setBladAparatow] = useState<string | null>(null);

  useEffect(() => {
    if (!trybSekcja) return;
    let anulowane = false;
    fetchLvApparatusTypes()
      .then((dane) => {
        if (!anulowane) setAparaty(Array.isArray(dane) ? dane : []);
      })
      .catch((e: unknown) => {
        if (!anulowane) setBladAparatow(getCatalogErrorMessage(e));
      });
    return () => {
      anulowane = true;
    };
  }, [trybSekcja]);

  const [bladGlobalny, setBladGlobalny] = useState<string | null>(null);

  const kompletneA = Boolean(napiecieKv && napiecieKv > 0)
    && (!zasilWlaczone || Boolean(supplyFromBusRef && kableCatalogRef && kableDlugoscM && kableDlugoscM > 0));
  const kompletneB = Boolean(stationRef && sprzegloCatalogRef);
  const kompletne = trybSekcja ? kompletneB : kompletneA;

  const onZapiszRozdzielnica = useCallback(async () => {
    if (!activeCaseId) {
      setBladGlobalny(T.brakZakresu);
      return;
    }
    const payload: AddNNDistributionBoardPayload = {
      voltage_kv: napiecieKv ?? 0,
      name: nazwa.trim() || undefined,
      designation: oznaczenie.trim() || undefined,
      construction_type: konstrukcja || undefined,
      supply: zasilWlaczone
        ? {
            from_bus_ref: supplyFromBusRef,
            length_m: kableDlugoscM ?? 0,
            catalog_ref: kableCatalogRef,
          }
        : undefined,
    };
    if (zasilWlaczone) {
      const catalogError = validateCatalogFirst('add_nn_cable_segment', (payload.supply ?? {}) as unknown as Record<string, unknown>);
      if (catalogError) {
        setBladGlobalny(catalogError);
        return;
      }
    }
    setBladGlobalny(null);
    try {
      const response = await executeDomainOperation(
        activeCaseId,
        'add_nn_distribution_board',
        payload as unknown as Record<string, unknown>,
      );
      if (!response) {
        setBladGlobalny(useSnapshotStore.getState().error ?? T.bladDodania);
        return;
      }
      if (response.error) {
        setBladGlobalny(response.error);
        return;
      }
      closeForm();
      selekcja(response, { type: 'Station', name: nazwa.trim() || 'Rozdzielnica nN' });
    } catch (e) {
      setBladGlobalny(e instanceof Error ? e.message : T.bladDodania);
    }
  }, [activeCaseId, closeForm, executeDomainOperation, kableCatalogRef, kableDlugoscM, konstrukcja, nazwa, napiecieKv, oznaczenie, selekcja, supplyFromBusRef, zasilWlaczone, T]);

  const onZapiszSekcja = useCallback(async () => {
    if (!stationRef) return;
    if (!activeCaseId) {
      setBladGlobalny(T.brakZakresu);
      return;
    }
    const payload: AddNNSectionCouplerPayload = {
      station_ref: stationRef,
      catalog_ref: sprzegloCatalogRef,
      name: sekcjaNazwa.trim() || undefined,
    };
    const catalogError = validateCatalogFirst('add_nn_section_coupler', payload as unknown as Record<string, unknown>);
    if (catalogError) {
      setBladGlobalny(catalogError);
      return;
    }
    setBladGlobalny(null);
    try {
      const response = await executeDomainOperation(
        activeCaseId,
        'add_nn_section_coupler',
        payload as unknown as Record<string, unknown>,
      );
      if (!response) {
        setBladGlobalny(useSnapshotStore.getState().error ?? T.bladDodania);
        return;
      }
      if (response.error) {
        setBladGlobalny(response.error);
        return;
      }
      closeForm();
      selekcja(response, { type: 'Bus', name: sekcjaNazwa.trim() || 'Sekcja nN' });
    } catch (e) {
      setBladGlobalny(e instanceof Error ? e.message : T.bladDodania);
    }
  }, [activeCaseId, closeForm, executeDomainOperation, sekcjaNazwa, selekcja, sprzegloCatalogRef, stationRef, T]);

  const wierszeGotowosciA: WierszGotowosci[] = [
    { etykieta: T.wierszNapiecie, stan: napiecieKv && napiecieKv > 0 ? 'kompletne' : 'brak', wartosc: napiecieKv ? `${napiecieKv} kV` : 'Do wprowadzenia' },
    {
      etykieta: T.wierszZasilenie,
      stan: !zasilWlaczone ? 'kompletne' : kableCatalogRef && kableDlugoscM ? 'kompletne' : 'ostrzezenie',
      wartosc: !zasilWlaczone ? 'Bez zasilenia (dodasz osobno)' : kableCatalogRef ? 'Skonfigurowane' : 'Do skonfigurowania',
    },
  ];
  const wierszeGotowosciB: WierszGotowosci[] = [
    { etykieta: T.stacja, stan: stationRef ? 'kompletne' : 'brak', wartosc: stationLabel(snapshot, stationRef) },
    { etykieta: T.wierszSprzeglo, stan: sprzegloCatalogRef ? 'kompletne' : 'brak', wartosc: aparaty.find((a) => a.id === sprzegloCatalogRef)?.name ?? 'Do wyboru' },
  ];

  const aside = (
    <>
      <KreatorGotowosc
        tytul={T.kontrolaTytul}
        wiersze={trybSekcja ? wierszeGotowosciB : wierszeGotowosciA}
        testid="mvd-kreator-rozdzielnica-nn-gotowosc"
      />
      <KreatorNastepnyKrok eyebrow={T.downstreamTytul} opis={T.downstreamOpis} />
    </>
  );

  if (trybSekcja) {
    return (
      <KreatorRama
        eyebrow={T.eyebrow}
        tytul={T.tytul}
        cel={T.cel}
        odznaka={T.odznaka}
        pelny
        aside={aside}
        bladGlobalny={bladGlobalny}
        walidacja={!kompletne ? T.walidacjaStopka : null}
        akcjaGlowna={{ etykieta: T.zapiszSekcja, onClick: onZapiszSekcja, zablokowana: !kompletne || !activeCaseId, testid: 'mvd-kreator-rozdzielnica-nn-zapisz' }}
        akcjaAnuluj={{ etykieta: T.anuluj, onClick: () => closeForm(), testid: 'mvd-kreator-rozdzielnica-nn-anuluj' }}
        testid="mvd-kreator-rozdzielnica-nn"
      >
        <KreatorSekcja tytul={T.stacjaTytul} nota={stationLabel(snapshot, stationRef)} testid="mvd-kreator-rozdzielnica-nn-stacja">
          <RzadWartosci etykieta={T.stacja} wartosc={stationLabel(snapshot, stationRef)} />
        </KreatorSekcja>
        <KreatorSekcja tytul={T.sekcjaTytul} testid="mvd-kreator-rozdzielnica-nn-sekcja">
          <PoleKatalogu
            etykieta={T.sprzegloTyp}
            wartosc={sprzegloCatalogRef}
            onZmiana={setSprzegloCatalogRef}
            opcje={aparaty.map((a) => ({ id: a.id, etykieta: `${a.name} · ${a.i_n_a} A` }))}
            status={bladAparatow ? 'error' : aparaty.length > 0 ? 'ready' : 'loading'}
            placeholder={T.sprzegloPlaceholder}
            komunikatBledu={bladAparatow ?? T.sprzegloBlad}
            testid="mvd-kreator-rozdzielnica-nn-sprzeglo"
          />
          <PoleTekstowe
            etykieta={T.sekcjaNazwa}
            wartosc={sekcjaNazwa}
            onZmiana={setSekcjaNazwa}
            placeholder={T.sekcjaNazwaPlaceholder}
            testid="mvd-kreator-rozdzielnica-nn-sekcja-nazwa"
          />
        </KreatorSekcja>
      </KreatorRama>
    );
  }

  return (
    <KreatorRama
      eyebrow={T.eyebrow}
      tytul={T.tytul}
      cel={T.cel}
      odznaka={T.odznaka}
      pelny
      aside={aside}
      bladGlobalny={bladGlobalny}
      walidacja={!kompletne ? T.walidacjaStopka : null}
      akcjaGlowna={{ etykieta: T.zapisz, onClick: onZapiszRozdzielnica, zablokowana: !kompletne || !activeCaseId, testid: 'mvd-kreator-rozdzielnica-nn-zapisz' }}
      akcjaAnuluj={{ etykieta: T.anuluj, onClick: () => closeForm(), testid: 'mvd-kreator-rozdzielnica-nn-anuluj' }}
      testid="mvd-kreator-rozdzielnica-nn"
    >
      <KreatorSekcja tytul={T.daneTytul} testid="mvd-kreator-rozdzielnica-nn-dane">
        <KreatorSiatka kolumny={2}>
          <PoleLiczbowe etykieta={T.napiecie} jednostka="kV" wartosc={napiecieKv} onZmiana={setNapiecieKv} wymagane testid="mvd-kreator-rozdzielnica-nn-napiecie" />
          <PoleTekstowe etykieta={T.nazwa} wartosc={nazwa} onZmiana={setNazwa} placeholder={T.nazwaPlaceholder} testid="mvd-kreator-rozdzielnica-nn-nazwa" />
          <PoleTekstowe etykieta={T.oznaczenie} wartosc={oznaczenie} onZmiana={setOznaczenie} placeholder={T.oznaczeniePlaceholder} testid="mvd-kreator-rozdzielnica-nn-oznaczenie" />
          <PoleWyboru etykieta={T.konstrukcja} wartosc={konstrukcja} onZmiana={setKonstrukcja} opcje={T.konstrukcjaOpcje} testid="mvd-kreator-rozdzielnica-nn-konstrukcja" />
        </KreatorSiatka>
      </KreatorSekcja>

      <KreatorSekcja tytul={T.zasilenieTytul} testid="mvd-kreator-rozdzielnica-nn-zasilenie">
        <PolePrzelacznikBinarny etykieta={T.zasilenieWlacz} wlaczone={zasilWlaczone} onZmiana={setZasilWlaczone} opis={T.zasilenieOpis} testid="mvd-kreator-rozdzielnica-nn-zasil-przelacznik" />
        {zasilWlaczone ? (
          !supplyFromBusRef ? (
            <KreatorInfo>{T.brakSzynyZasilajacej}</KreatorInfo>
          ) : (
            <>
              <RzadWartosci etykieta="Szyna źródłowa" wartosc={supplyFromBus?.name ?? supplyFromBusRef} />
              <KreatorSiatka kolumny={2}>
                <PoleKatalogu
                  etykieta={T.kabel}
                  wartosc={kableCatalogRef}
                  onZmiana={setKableCatalogRef}
                  opcje={kable.map((k) => ({ id: k.id, etykieta: `${k.name} · ${k.cross_section_mm2} mm²` }))}
                  status={bladKabli ? 'error' : kable.length > 0 ? 'ready' : 'loading'}
                  placeholder={T.kabelPlaceholder}
                  komunikatBledu={bladKabli ?? T.kabelBlad}
                  testid="mvd-kreator-rozdzielnica-nn-kabel"
                />
                <PoleLiczbowe etykieta={T.dlugosc} jednostka="m" wartosc={kableDlugoscM} onZmiana={setKableDlugoscM} wymagane testid="mvd-kreator-rozdzielnica-nn-dlugosc" />
              </KreatorSiatka>
            </>
          )
        ) : null}
      </KreatorSekcja>
    </KreatorRama>
  );
}
