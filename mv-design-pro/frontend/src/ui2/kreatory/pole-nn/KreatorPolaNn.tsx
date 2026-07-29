/**
 * Kreator „Pole odpływowe nN" (add_nn_outgoing_field) — ui2, kreatory/rama.
 *
 * Jedyny publiczny write-path pola nN: odpływ (FEEDER, domyślnie) albo pole źródłowe
 * (SOURCE, gdy kontekst tak wskazuje). Zapis = operacja domenowa `add_nn_outgoing_field`.
 *
 * ZERO fabrykacji: operacja przyjmuje wyłącznie `station_ref`, `bus_nn_ref`, `field_name`,
 * `field_role` (+ `source_field_kind` dla SOURCE) — dlatego kreator NIE pokazuje pickera
 * katalogu (backend go dla tej operacji nie honoruje). Zabezpieczenie odpływu przypisuje się
 * osobną operacją; teoria selektywności jest tu wykładem, nie polem formularza.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';

import { useAppStateStore } from '../../../ui/app-state';
import {
  listNnBusOptions,
  resolveBusNnRef,
  resolveStationRef,
  stationLabel,
} from '../../../ui/network-build/forms/enmResolvers';
import { useActiveOperationForm, useNetworkBuildStore } from '../../../ui/network-build/networkBuildStore';
import { useSnapshotStore } from '../../../ui/topology/snapshotStore';
import {
  KreatorGotowosc,
  KreatorInfo,
  KreatorNastepnyKrok,
  KreatorRama,
  KreatorSekcja,
  KreatorSiatka,
  PanelTeorii,
  PoleTekstowe,
  PoleWyboru,
  RzadWartosci,
  useSelekcjaPoOperacji,
  type WierszGotowosci,
} from '../rama';
import { poleNnStrings } from './strings';

function readString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

export function KreatorPolaNn() {
  const activeForm = useActiveOperationForm();
  const context = activeForm?.context as Record<string, unknown> | undefined;
  const closeForm = useNetworkBuildStore((s) => s.closeOperationForm);
  const executeDomainOperation = useSnapshotStore((s) => s.executeDomainOperation);
  const snapshot = useSnapshotStore((s) => s.snapshot);
  const activeCaseId = useAppStateStore((s) => s.activeCaseId);
  const selekcjaPoOperacji = useSelekcjaPoOperacji();

  const isSource = context?.field_role === 'SOURCE';
  const T = useMemo(() => poleNnStrings(isSource), [isSource]);
  const sourceFieldKind = useMemo(() => readString(context?.source_field_kind) || 'PV', [context]);

  const stationRef = useMemo(() => resolveStationRef(context, snapshot), [context, snapshot]);
  const busOptions = useMemo(() => listNnBusOptions(snapshot, stationRef), [snapshot, stationRef]);
  const resolvedBusRef = useMemo(() => resolveBusNnRef(context, snapshot), [context, snapshot]);

  const [busNnRef, setBusNnRef] = useState(resolvedBusRef ?? busOptions[0]?.ref_id ?? '');
  const [nazwa, setNazwa] = useState(isSource ? 'Pole przyłączeniowe nN' : 'Odpływ nN');
  const [bladGlobalny, setBladGlobalny] = useState<string | null>(null);

  useEffect(() => {
    setBusNnRef(resolvedBusRef ?? busOptions[0]?.ref_id ?? '');
  }, [resolvedBusRef, busOptions]);

  useEffect(() => {
    setNazwa(isSource ? 'Pole przyłączeniowe nN' : 'Odpływ nN');
  }, [isSource]);

  const selectedBus = useMemo(
    () => busOptions.find((b) => b.ref_id === busNnRef) ?? null,
    [busOptions, busNnRef],
  );

  const brakStacji = !stationRef;
  const brakSzyn = Boolean(stationRef) && busOptions.length === 0;
  const kompletne = Boolean(stationRef && busNnRef);

  const onZapisz = useCallback(async () => {
    if (!activeCaseId) {
      setBladGlobalny(T.brakZakresu);
      return;
    }
    if (!stationRef) {
      setBladGlobalny(T.brakStacjiWalid);
      return;
    }
    if (!busNnRef) {
      setBladGlobalny(T.brakSzynyWalid);
      return;
    }
    const payload = isSource
      ? {
          station_ref: stationRef,
          bus_nn_ref: busNnRef,
          field_role: 'SOURCE',
          source_field_kind: sourceFieldKind,
          field_name: nazwa.trim() || undefined,
        }
      : {
          station_ref: stationRef,
          bus_nn_ref: busNnRef,
          field_role: 'FEEDER',
          field_name: nazwa.trim() || undefined,
        };
    setBladGlobalny(null);
    try {
      const response = await executeDomainOperation(activeCaseId, 'add_nn_outgoing_field', payload);
      if (!response) {
        setBladGlobalny(useSnapshotStore.getState().error ?? T.bladDodania);
        return;
      }
      if (response.error) {
        setBladGlobalny(response.error);
        return;
      }
      closeForm();
      selekcjaPoOperacji(response, {
        type: isSource ? 'SourceFieldNN' : 'FeederNN',
        name: nazwa.trim() || (isSource ? 'Pole przyłączeniowe nN' : 'Odpływ nN'),
      });
    } catch (e) {
      setBladGlobalny(e instanceof Error ? e.message : T.bladDodania);
    }
  }, [activeCaseId, busNnRef, closeForm, executeDomainOperation, isSource, nazwa, selekcjaPoOperacji, sourceFieldKind, stationRef, T]);

  const wierszeGotowosci: WierszGotowosci[] = [
    { etykieta: T.wierszStacja, stan: stationRef ? 'kompletne' : 'brak', wartosc: stationLabel(snapshot, stationRef) },
    { etykieta: T.wierszSzyna, stan: busNnRef ? 'kompletne' : 'brak', wartosc: selectedBus?.name || (busNnRef ? 'Wskazana' : 'Brak') },
    { etykieta: T.wierszRola, stan: 'kompletne', wartosc: isSource ? T.rolaSource : T.rolaFeeder },
  ];

  const aside = (
    <>
      <KreatorGotowosc tytul={T.kontrolaTytul} wiersze={wierszeGotowosci} testid="mvd-kreator-pole-nn-gotowosc" />
      <KreatorNastepnyKrok
        eyebrow={T.downstreamTytul}
        opis={isSource ? T.downstreamOpisSource : T.downstreamOpisFeeder}
      />
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
      akcjaGlowna={{ etykieta: T.zapisz, onClick: onZapisz, zablokowana: !kompletne || !activeCaseId, testid: 'mvd-kreator-pole-nn-zapisz' }}
      akcjaAnuluj={{ etykieta: T.anuluj, onClick: () => closeForm(), testid: 'mvd-kreator-pole-nn-anuluj' }}
      testid="mvd-kreator-pole-nn"
    >
      {brakStacji ? (
        <KreatorSekcja tytul={T.brakStacjiTytul} testid="mvd-kreator-pole-nn-brak-stacji">
          <KreatorInfo>{T.brakStacjiOpis}</KreatorInfo>
        </KreatorSekcja>
      ) : null}

      {brakSzyn ? (
        <KreatorSekcja tytul={T.brakSzynTytul} testid="mvd-kreator-pole-nn-brak-szyn">
          <KreatorInfo>{T.brakSzynOpis}</KreatorInfo>
        </KreatorSekcja>
      ) : null}

      <KreatorSekcja tytul={T.poleTytul} nota={stationLabel(snapshot, stationRef)} testid="mvd-kreator-pole-nn-pole">
        <KreatorInfo>{T.polePomoc}</KreatorInfo>
        <KreatorSiatka kolumny={2}>
          <PoleWyboru
            etykieta={T.szyna}
            wartosc={busNnRef}
            onZmiana={setBusNnRef}
            opcje={[
              { id: '', etykieta: T.szynaPlaceholder },
              ...busOptions.map((b) => ({ id: b.ref_id, etykieta: `${b.name} (${b.voltage_kv} kV)` })),
            ]}
            wymagane
            testid="mvd-kreator-pole-nn-szyna"
          />
          <PoleTekstowe
            etykieta={T.nazwa}
            wartosc={nazwa}
            onZmiana={setNazwa}
            placeholder={isSource ? T.nazwaPlaceholderSource : T.nazwaPlaceholderFeeder}
            testid="mvd-kreator-pole-nn-nazwa"
          />
        </KreatorSiatka>

        {isSource ? (
          <RzadWartosci etykieta={T.rodzinaZrodla} wartosc={sourceFieldKind} testid="mvd-kreator-pole-nn-rodzina" />
        ) : null}

        <PanelTeorii
          tytul={T.teoriaTytul}
          opis={T.teoriaOpis}
          wymog={T.teoriaWymog}
          podstawa={T.teoriaPodstawa}
          testid="mvd-kreator-pole-nn-teoria"
        />
      </KreatorSekcja>
    </KreatorRama>
  );
}
