/**
 * Kreator „Aparat nN" (add_nn_switch_device) — ui2, framework kreatory/rama.
 *
 * Wstawia aparat (wyłącznik/rozłącznik albo bezpiecznik) w torze między DWIEMA
 * ISTNIEJĄCYMI szynami nN — operacja NIE tworzy nowej szyny (w odróżnieniu od
 * `add_nn_cable_segment`), więc szyna docelowa jest wybierana z pełnej listy
 * szyn nN modelu (`listAllNnBusOptions` — płaska, bo backend nie ogranicza
 * pary do jednej stacji, tylko do zgodności napięcia).
 */

import { useCallback, useEffect, useMemo, useState } from 'react';

import { useAppStateStore } from '../../../ui/app-state';
import { fetchLvApparatusTypes, getCatalogErrorMessage } from '../../../ui/catalog/api';
import type { LVApparatusType } from '../../../ui/catalog/types';
import { listAllNnBusOptions, resolveBusNnRef } from '../../../ui/network-build/forms/enmResolvers';
import { validateCatalogFirst } from '../../../ui/network-build/forms/catalogFirstRules';
import { useActiveOperationForm, useNetworkBuildStore } from '../../../ui/network-build/networkBuildStore';
import { useSnapshotStore } from '../../../ui/topology/snapshotStore';
import type { AddNNSwitchDevicePayload, NNSwitchDeviceClass } from '../../../types/domainOps';
import {
  KreatorGotowosc,
  KreatorInfo,
  KreatorNastepnyKrok,
  KreatorRama,
  KreatorSekcja,
  KreatorSiatka,
  PoleKatalogu,
  PolePrzelacznik,
  PoleTekstowe,
  PoleWyboru,
  RzadWartosci,
  useSelekcjaPoOperacjiBezNawigacji,
  type WierszGotowosci,
} from '../rama';
import { APARAT_NN_STRINGS as T } from './strings';

function fmt(n: number | null | undefined, jedn: string, miejsca = 1): string {
  if (n === null || n === undefined || Number.isNaN(n)) return '—';
  return `${n.toFixed(miejsca).replace('.', ',')} ${jedn}`;
}

export function KreatorAparatuNn() {
  const activeForm = useActiveOperationForm();
  const context = activeForm?.context as Record<string, unknown> | undefined;
  const closeForm = useNetworkBuildStore((s) => s.closeOperationForm);
  const executeDomainOperation = useSnapshotStore((s) => s.executeDomainOperation);
  const snapshot = useSnapshotStore((s) => s.snapshot);
  const activeCaseId = useAppStateStore((s) => s.activeCaseId);
  const selekcja = useSelekcjaPoOperacjiBezNawigacji();

  const fromBusRef = useMemo(() => resolveBusNnRef(context, snapshot), [context, snapshot]);
  const fromBus = useMemo(
    () => snapshot?.buses.find((b) => b.ref_id === fromBusRef || b.id === fromBusRef) ?? null,
    [snapshot, fromBusRef],
  );
  const opcjeDo = useMemo(() => listAllNnBusOptions(snapshot, fromBusRef), [snapshot, fromBusRef]);

  const [toBusRef, setToBusRef] = useState('');
  const [deviceClass, setDeviceClass] = useState<NNSwitchDeviceClass>('switch');
  const [catalogRef, setCatalogRef] = useState<string | null>(null);
  const [nazwa, setNazwa] = useState('');
  const [bladGlobalny, setBladGlobalny] = useState<string | null>(null);

  const [aparaty, setAparaty] = useState<LVApparatusType[]>([]);
  const [bladKatalogu, setBladKatalogu] = useState<string | null>(null);
  useEffect(() => {
    let anulowane = false;
    fetchLvApparatusTypes()
      .then((dane) => {
        if (!anulowane) setAparaty(Array.isArray(dane) ? dane : []);
      })
      .catch((e: unknown) => {
        if (!anulowane) setBladKatalogu(getCatalogErrorMessage(e));
      });
    return () => {
      anulowane = true;
    };
  }, []);

  const wybranyAparat = useMemo(() => aparaty.find((a) => a.id === catalogRef) ?? null, [aparaty, catalogRef]);

  const brakStartu = !fromBusRef;
  const kompletne = Boolean(fromBusRef && toBusRef && catalogRef);

  const onZapisz = useCallback(async () => {
    if (!fromBusRef) {
      setBladGlobalny(T.brakStartuOpis);
      return;
    }
    if (!activeCaseId) {
      setBladGlobalny(T.brakZakresu);
      return;
    }
    const payload: AddNNSwitchDevicePayload = {
      from_bus_ref: fromBusRef,
      to_bus_ref: toBusRef,
      device_class: deviceClass,
      catalog_ref: catalogRef,
      name: nazwa.trim() || undefined,
    };
    const catalogError = validateCatalogFirst('add_nn_switch_device', payload as unknown as Record<string, unknown>);
    if (catalogError) {
      setBladGlobalny(catalogError);
      return;
    }
    setBladGlobalny(null);
    try {
      const response = await executeDomainOperation(
        activeCaseId,
        'add_nn_switch_device',
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
      selekcja(response, { type: 'Switch', name: nazwa.trim() || 'Aparat nN' });
    } catch (e) {
      setBladGlobalny(e instanceof Error ? e.message : T.bladDodania);
    }
  }, [activeCaseId, catalogRef, closeForm, deviceClass, executeDomainOperation, fromBusRef, nazwa, selekcja, toBusRef]);

  const wierszeGotowosci: WierszGotowosci[] = [
    { etykieta: T.wierszOd, stan: fromBusRef ? 'kompletne' : 'brak', wartosc: fromBus?.name ?? fromBusRef ?? '—' },
    { etykieta: T.wierszDo, stan: toBusRef ? 'kompletne' : 'brak', wartosc: opcjeDo.find((b) => b.ref_id === toBusRef)?.name ?? 'Do wyboru' },
    { etykieta: T.wierszTyp, stan: catalogRef ? 'kompletne' : 'brak', wartosc: wybranyAparat?.name ?? 'Do wyboru' },
  ];

  const aside = (
    <>
      <KreatorGotowosc tytul={T.kontrolaTytul} wiersze={wierszeGotowosci} testid="mvd-kreator-aparat-nn-gotowosc" />
      <KreatorNastepnyKrok eyebrow={T.downstreamTytul} opis={T.downstreamOpis} />
    </>
  );

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
      akcjaGlowna={{ etykieta: T.zapisz, onClick: onZapisz, zablokowana: !kompletne || !activeCaseId, testid: 'mvd-kreator-aparat-nn-zapisz' }}
      akcjaAnuluj={{ etykieta: T.anuluj, onClick: () => closeForm(), testid: 'mvd-kreator-aparat-nn-anuluj' }}
      testid="mvd-kreator-aparat-nn"
    >
      {brakStartu ? (
        <KreatorSekcja tytul={T.brakStartuTytul} testid="mvd-kreator-aparat-nn-brak-startu">
          <KreatorInfo>{T.brakStartuOpis}</KreatorInfo>
        </KreatorSekcja>
      ) : null}

      <KreatorSekcja tytul={T.rodzajTytul} testid="mvd-kreator-aparat-nn-rodzaj">
        <KreatorInfo>{T.rodzajPomoc}</KreatorInfo>
        <PolePrzelacznik
          opcje={[
            { id: 'switch', etykieta: T.rodzajSwitch },
            { id: 'fuse', etykieta: T.rodzajFuse },
          ]}
          wartosc={deviceClass}
          onZmiana={(v) => setDeviceClass(v as NNSwitchDeviceClass)}
          testid="mvd-kreator-aparat-nn-rodzaj-przelacznik"
        />
      </KreatorSekcja>

      <KreatorSekcja tytul={T.torTytul} nota={fromBus?.name ?? undefined} testid="mvd-kreator-aparat-nn-tor">
        <KreatorSiatka kolumny={2}>
          <RzadWartosci etykieta={T.szynaOd} wartosc={fromBus?.name ?? fromBusRef ?? '—'} />
          <PoleWyboru
            etykieta={T.szynaDo}
            wartosc={toBusRef}
            onZmiana={setToBusRef}
            opcje={[
              { id: '', etykieta: T.szynaDoPlaceholder },
              ...opcjeDo.map((b) => ({ id: b.ref_id, etykieta: `${b.name} (${b.voltage_kv} kV)` })),
            ]}
            wymagane
            pomoc={T.szynaDoPomoc}
            testid="mvd-kreator-aparat-nn-szyna-do"
          />
        </KreatorSiatka>
        {opcjeDo.length === 0 ? <KreatorInfo>{T.brakSzynDo}</KreatorInfo> : null}
      </KreatorSekcja>

      <KreatorSekcja tytul={T.typTytul} testid="mvd-kreator-aparat-nn-typ">
        <PoleKatalogu
          etykieta={T.typ}
          wartosc={catalogRef}
          onZmiana={setCatalogRef}
          opcje={aparaty.map((a) => ({ id: a.id, etykieta: `${a.name} · ${a.i_n_a} A` }))}
          status={bladKatalogu ? 'error' : aparaty.length > 0 ? 'ready' : 'loading'}
          placeholder={T.typPlaceholder}
          komunikatBledu={bladKatalogu ?? T.typBlad}
          testid="mvd-kreator-aparat-nn-katalog"
        />
        <PoleTekstowe
          etykieta={T.nazwa}
          wartosc={nazwa}
          onZmiana={setNazwa}
          placeholder={T.nazwaPlaceholder}
          testid="mvd-kreator-aparat-nn-nazwa"
        />
        {wybranyAparat ? (
          <>
            <KreatorInfo>{T.paramSekcjaNormowa}</KreatorInfo>
            <KreatorSiatka kolumny={3}>
              <RzadWartosci etykieta={T.paramIn} wartosc={fmt(wybranyAparat.i_n_a, 'A', 0)} />
              <RzadWartosci etykieta={T.paramUn} wartosc={fmt(wybranyAparat.u_n_kv, 'kV', 2)} />
              <RzadWartosci
                etykieta={T.paramZdolnoscWylaczania}
                wartosc={fmt(wybranyAparat.i_cu_ka ?? wybranyAparat.breaking_capacity_ka, 'kA', 1)}
              />
            </KreatorSiatka>
          </>
        ) : null}
      </KreatorSekcja>
    </KreatorRama>
  );
}
