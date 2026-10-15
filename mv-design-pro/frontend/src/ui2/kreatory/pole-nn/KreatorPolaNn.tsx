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
  jedynaZgodna,
  pierwszyBrak,
  useDecyzjeProjektanta,
  useProwadzenie,
  useSelekcjaPoOperacji,
  type WierszGotowosci,
} from '../rama';
import { poleNnStrings } from './strings';

/** Rodziny pola przyłączeniowego nN przyjmowane przez operację (`source_field_kind`). */
const RODZINY_ZRODLA: readonly string[] = ['PV', 'BESS', 'FW', 'AGREGAT', 'UPS'];

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
  // Rodzina źródła WYŁĄCZNIE z kontekstu wywołania albo od projektanta (dawniej cicho „PV”).
  const rodzinaZKontekstu = useMemo(() => {
    const raw = readString(context?.source_field_kind).toUpperCase();
    return RODZINY_ZRODLA.includes(raw) ? raw : '';
  }, [context]);
  const [sourceFieldKind, setSourceFieldKind] = useState(rodzinaZKontekstu);
  useEffect(() => setSourceFieldKind(rodzinaZKontekstu), [rodzinaZKontekstu]);

  const stationRef = useMemo(() => resolveStationRef(context, snapshot), [context, snapshot]);
  const busOptions = useMemo(() => listNnBusOptions(snapshot, stationRef), [snapshot, stationRef]);
  const resolvedBusRef = useMemo(() => resolveBusNnRef(context, snapshot), [context, snapshot]);
  // Szyna: wskazana w kontekście albo JEDYNA szyna nN stacji (dawniej pierwsza z listy).
  const jedynaSzyna = useMemo(() => jedynaZgodna(busOptions), [busOptions]);
  const szynaAuto = resolvedBusRef ?? jedynaSzyna?.ref_id ?? '';

  const [busNnRef, setBusNnRef] = useState(szynaAuto);
  const [nazwa, setNazwa] = useState(isSource ? 'Pole przyłączeniowe nN' : 'Odpływ nN');
  const [bladGlobalny, setBladGlobalny] = useState<string | null>(null);
  const prowadzenie = useProwadzenie();
  const { edytowane, decyzjaProjektanta } = useDecyzjeProjektanta<'szyna' | 'rodzina'>();

  useEffect(() => {
    if (decyzjaProjektanta('szyna')) return;
    setBusNnRef(szynaAuto);
  }, [decyzjaProjektanta, szynaAuto]);

  useEffect(() => {
    setNazwa(isSource ? 'Pole przyłączeniowe nN' : 'Odpływ nN');
  }, [isSource]);

  const selectedBus = useMemo(
    () => busOptions.find((b) => b.ref_id === busNnRef) ?? null,
    [busOptions, busNnRef],
  );

  const brakStacji = !stationRef;
  const brakSzyn = Boolean(stationRef) && busOptions.length === 0;

  const onZapisz = useCallback(async () => {
    // BRAK_DO_OPERACJI — jedno wskazanie w kolejności pracy (kontrakt prowadzenia projektanta).
    const brak = pierwszyBrak([
      !stationRef && { komunikat: T.brakStacjiWalid },
      !busNnRef && { komunikat: T.brakSzynyWalid, pole: 'mvd-kreator-pole-nn-szyna' },
      isSource && !sourceFieldKind && { komunikat: T.brakRodzinyWalid, pole: 'mvd-kreator-pole-nn-rodzina' },
      !activeCaseId && { komunikat: T.brakZakresu },
    ]);
    if (brak || !activeCaseId || !stationRef) {
      if (brak) prowadzenie.wskaz(brak);
      return;
    }
    prowadzenie.zgas();
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
  }, [activeCaseId, busNnRef, closeForm, executeDomainOperation, isSource, nazwa, prowadzenie, selekcjaPoOperacji, sourceFieldKind, stationRef, T]);

  const wierszeGotowosci: WierszGotowosci[] = [
    { etykieta: T.wierszStacja, stan: stationRef ? 'ustalone' : 'do_wyboru', wartosc: stationLabel(snapshot, stationRef) },
    {
      etykieta: T.wierszSzyna,
      stan: !busNnRef ? 'do_wyboru' : 'ustalone',
      wartosc: selectedBus?.name || (busNnRef ? 'Wskazana' : ''),
    },
    { etykieta: T.wierszRola, stan: 'ustalone', wartosc: isSource ? T.rolaSource : T.rolaFeeder },
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
      {...prowadzenie.propsRamy}
      akcjaGlowna={{ etykieta: T.zapisz, onClick: onZapisz, testid: 'mvd-kreator-pole-nn-zapisz' }}
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
            onZmiana={(v) => {
              setBusNnRef(v);
              edytowane('szyna');
            }}
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
          <PoleWyboru
            etykieta={T.rodzinaZrodla}
            wartosc={sourceFieldKind}
            onZmiana={(v) => {
              setSourceFieldKind(v);
              edytowane('rodzina');
            }}
            opcje={[{ id: '', etykieta: T.rodzinaZrodlaPlaceholder }, ...T.rodzinaZrodlaOpcje]}
            testid="mvd-kreator-pole-nn-rodzina"
          />
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
