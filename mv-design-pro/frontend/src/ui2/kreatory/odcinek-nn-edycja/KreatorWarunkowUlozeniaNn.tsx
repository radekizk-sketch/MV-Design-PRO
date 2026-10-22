/**
 * Kreator „Warunki ułożenia kabla nN" — operacja `set_nn_cable_laying_conditions` na
 * ISTNIEJĄCYM odcinku (menu kontekstowe kabla na schemacie nN stacji, kontekst `segment_ref`).
 * Sekcja warunków jest TA SAMA co w kreatorze nowego odcinka (`SekcjaUlozeniaKablaNn`);
 * wybór „warunki katalogowe" usuwa zapisany opis (powrót do warunków odniesienia katalogu).
 */

import { useCallback, useMemo, useState } from 'react';

import { useAppStateStore } from '../../../ui/app-state';
import { useActiveOperationContext, useNetworkBuildStore } from '../../../ui/network-build/networkBuildStore';
import { useSnapshotStore } from '../../../ui/topology/snapshotStore';
import { KreatorInfo, KreatorRama, KreatorSekcja, KreatorSiatka, RzadWartosci } from '../rama';
import { SekcjaUlozeniaKablaNn, useUlozenieKablaNn } from '../odcinek-nn/ulozenieKablaNn';
import { odcinekZMigawki, zbudujPayloadUlozenia, type OdcinekNn } from './odcinekNnEdycjaModel';
import { ODCINEK_NN_EDYCJA_STRINGS as T } from './strings';

export function KreatorWarunkowUlozeniaNn() {
  const context = useActiveOperationContext() as Record<string, unknown> | null;
  const snapshot = useSnapshotStore((s) => s.snapshot);
  const segmentRef = typeof context?.segment_ref === 'string' ? context.segment_ref : null;
  const odcinek = useMemo(() => odcinekZMigawki(snapshot, segmentRef), [snapshot, segmentRef]);
  // Klucz = odcinek: stan sekcji startuje z warunków zapisanych w TYM odcinku.
  return <Formularz key={odcinek?.ref ?? 'brak'} odcinek={odcinek} />;
}

function Formularz({ odcinek }: { readonly odcinek: OdcinekNn | null }) {
  const closeForm = useNetworkBuildStore((s) => s.closeOperationForm);
  const executeDomainOperation = useSnapshotStore((s) => s.executeDomainOperation);
  const activeCaseId = useAppStateStore((s) => s.activeCaseId);
  const ulozenie = useUlozenieKablaNn(odcinek?.warunkiUlozenia ?? null);
  const [bladGlobalny, setBladGlobalny] = useState<string | null>(null);

  const gotowy = Boolean(odcinek && activeCaseId && (ulozenie.tryb === 'katalogowe' || ulozenie.kompletny));

  const onZapisz = useCallback(async () => {
    if (!odcinek) {
      setBladGlobalny(T.brakOdcinkaOpis);
      return;
    }
    if (!activeCaseId) {
      setBladGlobalny(T.brakZakresu);
      return;
    }
    setBladGlobalny(null);
    const odpowiedz = await executeDomainOperation(
      activeCaseId,
      'set_nn_cable_laying_conditions',
      zbudujPayloadUlozenia(odcinek.ref, ulozenie.opis) as unknown as Record<string, unknown>,
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
  }, [activeCaseId, closeForm, executeDomainOperation, odcinek, ulozenie.opis]);

  return (
    <KreatorRama
      eyebrow={T.ulozenieEyebrow}
      tytul={T.ulozenieEyebrow}
      cel={T.ulozenieCel}
      odznaka={T.ulozenieOdznaka}
      bladGlobalny={bladGlobalny}
      walidacja={odcinek && ulozenie.tryb === 'wlasne' && !ulozenie.kompletny ? T.ulozenieNiekompletne : null}
      status={gotowy ? 'gotowy' : 'zablokowany'}
      akcjaGlowna={{
        etykieta: T.ulozenieZapisz,
        onClick: onZapisz,
        zablokowana: !gotowy,
        testid: 'mvd-kreator-ulozenie-nn-zapisz',
      }}
      akcjaAnuluj={{ etykieta: T.anuluj, onClick: () => closeForm(), testid: 'mvd-kreator-ulozenie-nn-anuluj' }}
      testid="mvd-kreator-ulozenie-nn"
    >
      {odcinek ? (
        <>
          <KreatorSekcja tytul={T.sekcjaOdcinekTytul} testid="mvd-kreator-ulozenie-nn-odcinek">
            <KreatorSiatka kolumny={2}>
              <RzadWartosci etykieta={T.wierszNazwa} wartosc={odcinek.nazwa} />
              <RzadWartosci
                etykieta={T.wierszDlugosc}
                wartosc={odcinek.dlugoscM === null ? '—' : `${String(odcinek.dlugoscM).replace('.', ',')} m`}
              />
            </KreatorSiatka>
          </KreatorSekcja>
          <SekcjaUlozeniaKablaNn ulozenie={ulozenie} testid="mvd-kreator-ulozenie-nn" />
        </>
      ) : (
        <KreatorSekcja tytul={T.brakOdcinkaTytul} testid="mvd-kreator-ulozenie-nn-brak">
          <KreatorInfo>{T.brakOdcinkaOpis}</KreatorInfo>
        </KreatorSekcja>
      )}
    </KreatorRama>
  );
}
