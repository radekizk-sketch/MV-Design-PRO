/**
 * Kreator „Przepięcie elementu na pole stacji" (przepnij_element_na_pole) — ui2, kreatory/rama.
 *
 * Akcja naprawcza kontroli modelu W042 (backend `enm/tor_pola.py`): połówka odcinka albo strona
 * górna transformatora leży na szynie głównej stacji z pominięciem pola, które jej służy.
 * Zapis = operacja domenowa `przepnij_element_na_pole`. Kreator NIE wybiera pola za model:
 * domyślnie wysyła sam element (pole wskazuje kontrola modelu), a jawny wybór pola projektanta
 * backend sprawdza (rola, zajętość) i odrzuca nazwaną odmową. Lista pól pochodzi z danych
 * stacji (`field_specs` z własnym zaciskiem na szynie elementu) — zero reguł i fizyki w UI.
 */

import { useCallback, useMemo, useState } from 'react';

import { useAppStateStore } from '../../../ui/app-state';
import { useActiveOperationContext, useNetworkBuildStore } from '../../../ui/network-build/networkBuildStore';
import { wlasnyZaciskPola } from '../../../ui/shared/zaciskPola';
import { useSnapshotStore } from '../../../ui/topology/snapshotStore';
import type { EnergyNetworkModel } from '../../../types/enm';
import {
  KreatorGotowosc,
  KreatorInfo,
  KreatorNastepnyKrok,
  KreatorRama,
  KreatorSekcja,
  KreatorSiatka,
  PanelTeorii,
  PoleWyboru,
  RzadWartosci,
  useSelekcjaPoOperacji,
  type OpcjaWyboru,
  type WierszGotowosci,
} from '../rama';
import { PRZEPIECIE_NA_POLE_STRINGS as T } from './strings';

function napis(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function rekord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

interface ElementNaSzynie {
  readonly nazwa: string;
  readonly rodzaj: 'branch' | 'transformer';
  readonly stacjaNazwa: string;
  readonly szynaNazwa: string;
  readonly pola: readonly OpcjaWyboru[];
}

/** Element, stacja i pola z własnym zaciskiem na szynie głównej, na której element leży. */
export function elementNaSzynieStacji(
  snapshot: EnergyNetworkModel | null,
  elementRef: string,
): ElementNaSzynie | null {
  if (!snapshot || !elementRef) return null;
  const galaz = (snapshot.branches ?? []).find((b) => b.ref_id === elementRef);
  const transformator = (snapshot.transformers ?? []).find((t) => t.ref_id === elementRef);
  const konce = galaz
    ? [galaz.from_bus_ref, galaz.to_bus_ref]
    : transformator
      ? [transformator.hv_bus_ref]
      : [];
  if (konce.length === 0) return null;
  for (const stacja of snapshot.substations ?? []) {
    const szyna = konce.find((k) => (stacja.bus_refs ?? []).includes(k));
    if (!szyna) continue;
    const specs = rekord(stacja.meta)?.field_specs;
    const pola: OpcjaWyboru[] = (Array.isArray(specs) ? specs : [])
      .map((raw) => rekord(raw))
      .filter((spec): spec is Record<string, unknown> => spec !== null)
      .filter((spec) => napis(spec.bus_ref) === szyna && wlasnyZaciskPola(spec) !== null)
      .map((spec) => ({
        id: napis(spec.field_ref),
        etykieta: napis(spec.name) || napis(spec.field_ref),
      }))
      .filter((opcja) => opcja.id !== '');
    const szynaModel = (snapshot.buses ?? []).find((b) => b.ref_id === szyna);
    return {
      nazwa: napis((galaz ?? transformator)?.name) || T.nieznany,
      rodzaj: galaz ? 'branch' : 'transformer',
      stacjaNazwa: napis(stacja.name) || '—',
      szynaNazwa: napis(szynaModel?.name) || '—',
      pola,
    };
  }
  return null;
}

export function KreatorPrzepieciaNaPole() {
  const context = useActiveOperationContext();
  const closeForm = useNetworkBuildStore((s) => s.closeOperationForm);
  const executeDomainOperation = useSnapshotStore((s) => s.executeDomainOperation);
  const snapshot = useSnapshotStore((s) => s.snapshot);
  const activeCaseId = useAppStateStore((s) => s.activeCaseId);
  const selekcjaPoOperacji = useSelekcjaPoOperacji();

  const elementRef = napis(context?.element_ref);
  const opis = useMemo(() => elementNaSzynieStacji(snapshot, elementRef), [snapshot, elementRef]);
  const poleZKontekstu = napis(context?.field_ref);
  const [poleRef, setPoleRef] = useState(
    opis?.pola.some((p) => p.id === poleZKontekstu) ? poleZKontekstu : '',
  );
  const [bladGlobalny, setBladGlobalny] = useState<string | null>(null);

  const opcjePol: OpcjaWyboru[] = [{ id: '', etykieta: T.poleAuto }, ...(opis?.pola ?? [])];
  const kompletne = opis !== null;

  const onZapisz = useCallback(async () => {
    if (!activeCaseId) {
      setBladGlobalny(T.brakZakresu);
      return;
    }
    if (!opis) {
      setBladGlobalny(T.walidacjaStopka);
      return;
    }
    const payload: Record<string, unknown> = { element_ref: elementRef };
    if (poleRef) payload.field_ref = poleRef;
    setBladGlobalny(null);
    try {
      const response = await executeDomainOperation(activeCaseId, 'przepnij_element_na_pole', payload);
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
        type: opis.rodzaj === 'branch' ? 'LineBranch' : 'TransformerBranch',
        name: opis.nazwa,
      });
    } catch (e) {
      setBladGlobalny(e instanceof Error ? e.message : T.bladDodania);
    }
  }, [activeCaseId, closeForm, elementRef, executeDomainOperation, opis, poleRef, selekcjaPoOperacji]);

  const wierszeGotowosci: WierszGotowosci[] = [
    { etykieta: T.wierszElement, stan: opis ? 'kompletne' : 'brak', wartosc: opis?.nazwa ?? 'Brak' },
    {
      etykieta: T.wierszPole,
      stan: 'kompletne',
      wartosc: opcjePol.find((o) => o.id === poleRef)?.etykieta ?? T.poleAuto,
    },
  ];

  return (
    <KreatorRama
      eyebrow={T.eyebrow}
      tytul={T.tytul}
      cel={T.cel}
      odznaka={T.odznaka}
      aside={(
        <>
          <KreatorGotowosc tytul={T.kontrolaTytul} wiersze={wierszeGotowosci} testid="mvd-kreator-przepiecie-gotowosc" />
          <KreatorNastepnyKrok eyebrow={T.downstreamTytul} opis={T.downstreamOpis} />
        </>
      )}
      bladGlobalny={bladGlobalny}
      walidacja={!kompletne ? T.walidacjaStopka : null}
      akcjaGlowna={{ etykieta: T.zapisz, onClick: onZapisz, zablokowana: !kompletne || !activeCaseId, testid: 'mvd-kreator-przepiecie-zapisz' }}
      akcjaAnuluj={{ etykieta: T.anuluj, onClick: () => closeForm(), testid: 'mvd-kreator-przepiecie-anuluj' }}
      testid="mvd-kreator-przepiecie"
    >
      {!opis ? (
        <KreatorSekcja tytul={T.brakElementuTytul} testid="mvd-kreator-przepiecie-brak">
          <KreatorInfo>{T.brakElementuOpis}</KreatorInfo>
        </KreatorSekcja>
      ) : (
        <>
          <KreatorSekcja tytul={T.elementTytul} testid="mvd-kreator-przepiecie-element">
            <KreatorSiatka kolumny={2}>
              <RzadWartosci etykieta={T.element} wartosc={opis.nazwa} />
              <RzadWartosci etykieta={T.stacja} wartosc={opis.stacjaNazwa} />
              <RzadWartosci etykieta={T.szyna} wartosc={opis.szynaNazwa} />
            </KreatorSiatka>
          </KreatorSekcja>
          <KreatorSekcja tytul={T.poleTytul} testid="mvd-kreator-przepiecie-pole-sekcja">
            <PoleWyboru
              etykieta={T.pole}
              wartosc={poleRef}
              onZmiana={setPoleRef}
              opcje={opcjePol}
              pomoc={T.polePomoc}
              testid="mvd-kreator-przepiecie-pole"
            />
          </KreatorSekcja>
        </>
      )}
      <PanelTeorii
        tytul={T.teoriaTytul}
        opis={T.teoriaOpis}
        wymog={T.teoriaWymog}
        podstawa={T.teoriaPodstawa}
        testid="mvd-kreator-przepiecie-teoria"
      />
    </KreatorRama>
  );
}
