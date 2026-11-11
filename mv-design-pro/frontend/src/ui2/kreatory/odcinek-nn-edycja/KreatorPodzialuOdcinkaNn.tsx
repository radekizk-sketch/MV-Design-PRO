/**
 * Kreator „Podział odcinka kabla nN" — operacja `split_nn_segment` na ISTNIEJĄCYM odcinku
 * (menu kontekstowe kabla na schemacie nN stacji, kontekst `segment_ref`). Jedyny parametr
 * operacji to odległość miejsca podziału od początku odcinka (`split_at_m`).
 */

import { useCallback, useMemo, useState } from 'react';

import { useAppStateStore } from '../../../ui/app-state';
import { useActiveOperationContext, useNetworkBuildStore } from '../../../ui/network-build/networkBuildStore';
import { useSnapshotStore } from '../../../ui/topology/snapshotStore';
import { KreatorInfo, KreatorRama, KreatorSekcja, KreatorSiatka, PoleLiczbowe, RzadWartosci } from '../rama';
import { bladMiejscaPodzialu, odcinekZMigawki, zbudujPayloadPodzialu } from './odcinekNnEdycjaModel';
import { ODCINEK_NN_EDYCJA_STRINGS as T } from './strings';

export function KreatorPodzialuOdcinkaNn() {
  const context = useActiveOperationContext() as Record<string, unknown> | null;
  const snapshot = useSnapshotStore((s) => s.snapshot);
  const closeForm = useNetworkBuildStore((s) => s.closeOperationForm);
  const executeDomainOperation = useSnapshotStore((s) => s.executeDomainOperation);
  const activeCaseId = useAppStateStore((s) => s.activeCaseId);
  const segmentRef = typeof context?.segment_ref === 'string' ? context.segment_ref : null;
  const odcinek = useMemo(() => odcinekZMigawki(snapshot, segmentRef), [snapshot, segmentRef]);

  const [splitAtM, setSplitAtM] = useState<number | null>(null);
  const [bladGlobalny, setBladGlobalny] = useState<string | null>(null);
  const bladMiejsca = splitAtM === null ? null : bladMiejscaPodzialu(splitAtM, odcinek?.dlugoscM ?? null);
  const gotowy = Boolean(odcinek && activeCaseId && splitAtM !== null && bladMiejsca === null);

  const onZapisz = useCallback(async () => {
    if (!odcinek) {
      setBladGlobalny(T.brakOdcinkaOpis);
      return;
    }
    if (!activeCaseId) {
      setBladGlobalny(T.brakZakresu);
      return;
    }
    const blad = bladMiejscaPodzialu(splitAtM, odcinek.dlugoscM);
    if (blad !== null || splitAtM === null) {
      setBladGlobalny(blad);
      return;
    }
    setBladGlobalny(null);
    const odpowiedz = await executeDomainOperation(
      activeCaseId,
      'split_nn_segment',
      zbudujPayloadPodzialu(odcinek.ref, splitAtM) as unknown as Record<string, unknown>,
    );
    if (!odpowiedz) {
      setBladGlobalny(useSnapshotStore.getState().error ?? T.bladZapisu);
      return;
    }
    if (odpowiedz.error) {
      setBladGlobalny(odpowiedz.error);
      return;
    }
    closeForm();
  }, [activeCaseId, closeForm, executeDomainOperation, odcinek, splitAtM]);

  return (
    <KreatorRama
      eyebrow={T.podzialEyebrow}
      tytul={T.podzialEyebrow}
      cel={T.podzialCel}
      odznaka={T.podzialOdznaka}
      bladGlobalny={bladGlobalny}
      status={gotowy ? 'gotowy' : 'zablokowany'}
      akcjaGlowna={{
        etykieta: T.podzialZapisz,
        onClick: onZapisz,
        zablokowana: !gotowy,
        testid: 'mvd-kreator-podzial-nn-zapisz',
      }}
      akcjaAnuluj={{ etykieta: T.anuluj, onClick: () => closeForm(), testid: 'mvd-kreator-podzial-nn-anuluj' }}
      testid="mvd-kreator-podzial-nn"
    >
      {odcinek ? (
        <KreatorSekcja tytul={T.sekcjaOdcinekTytul} testid="mvd-kreator-podzial-nn-odcinek">
          <KreatorSiatka kolumny={2}>
            <RzadWartosci etykieta={T.wierszNazwa} wartosc={odcinek.nazwa} />
            <RzadWartosci
              etykieta={T.wierszDlugosc}
              wartosc={odcinek.dlugoscM === null ? '—' : `${String(odcinek.dlugoscM).replace('.', ',')} m`}
            />
          </KreatorSiatka>
          <PoleLiczbowe
            etykieta={T.podzialMiejsce}
            jednostka="m"
            wartosc={splitAtM}
            onZmiana={setSplitAtM}
            wymagane
            pomoc={T.podzialMiejscePomoc}
            blad={bladMiejsca ?? undefined}
            testid="mvd-kreator-podzial-nn-miejsce"
          />
        </KreatorSekcja>
      ) : (
        <KreatorSekcja tytul={T.brakOdcinkaTytul} testid="mvd-kreator-podzial-nn-brak">
          <KreatorInfo>{T.brakOdcinkaOpis}</KreatorInfo>
        </KreatorSekcja>
      )}
    </KreatorRama>
  );
}
