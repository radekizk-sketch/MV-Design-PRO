/**
 * Kreator „Przypisanie typu katalogowego" (assign_catalog_to_element) — ui2, kreatory/rama.
 *
 * Wiąże istniejący element z pozycją katalogu (katalog-first). Zapis = operacja domenowa
 * `assign_catalog_to_element`. Przestrzeń katalogową bierze z kontekstu, a gdy jej brak —
 * backend wyznacza ją z typu elementu (bez fabrykacji po stronie UI). ZERO fizyki w UI:
 * materializację parametrów znamionowych z katalogu wykonuje backend.
 */

import { useCallback, useState } from 'react';

import { useAppStateStore } from '../../../ui/app-state';
import type { CatalogNamespace } from '../../../ui/catalog/types';
import { normalizeCatalogBinding } from '../../../ui/network-build/forms/catalogPayload';
import { useActiveOperationContext, useNetworkBuildStore } from '../../../ui/network-build/networkBuildStore';
import { useSnapshotStore } from '../../../ui/topology/snapshotStore';
import { nazwaObiektuZMigawki } from '../../wyniki/wzorzec/useNazwaObiektu';
import type { ElementType } from '../../../ui/types';
import {
  KreatorGotowosc,
  KreatorInfo,
  KreatorNastepnyKrok,
  KreatorRama,
  KreatorSekcja,
  KreatorSiatka,
  PanelTeorii,
  PoleTekstowe,
  RzadWartosci,
  pierwszyBrak,
  useProwadzenie,
  useSelekcjaPoOperacji,
  type WierszGotowosci,
} from '../rama';
import { PRZYPISANIE_KATALOGU_STRINGS as T } from './strings';

function readString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

export function KreatorPrzypisaniaKatalogu() {
  const context = useActiveOperationContext();
  const closeForm = useNetworkBuildStore((s) => s.closeOperationForm);
  const executeDomainOperation = useSnapshotStore((s) => s.executeDomainOperation);
  const snapshot = useSnapshotStore((s) => s.snapshot);
  const activeCaseId = useAppStateStore((s) => s.activeCaseId);
  const selekcjaPoOperacji = useSelekcjaPoOperacji();

  const elementRef = readString(context?.element_ref);
  const catalogNamespace = (readString(context?.catalog_namespace) || null) as CatalogNamespace | null;
  const fallbackType = (readString(context?.element_type) || 'LineBranch') as ElementType;

  const [catalogItemId, setCatalogItemId] = useState(readString(context?.catalog_item_id));
  const [wersja, setWersja] = useState(readString(context?.catalog_item_version));
  const [bladGlobalny, setBladGlobalny] = useState<string | null>(null);
  const prowadzenie = useProwadzenie();

  const brakElementu = !elementRef;

  const onZapisz = useCallback(async () => {
    // BRAK_DO_OPERACJI — jedno wskazanie przy próbie zapisu (kontrakt prowadzenia projektanta).
    const brak = pierwszyBrak([
      !elementRef && { komunikat: T.elementWalid },
      !catalogItemId.trim() && { komunikat: T.identyfikatorWalid, pole: 'mvd-kreator-przypisanie-id' },
      !activeCaseId && { komunikat: T.brakZakresu },
    ]);
    if (brak || !activeCaseId) {
      if (brak) prowadzenie.wskaz(brak);
      return;
    }
    prowadzenie.zgas();
    // Katalog-first: buduj wiązanie z jawną przestrzenią, gdy znana. Gdy jej brak,
    // przekaż surowy identyfikator + wersję — backend wyznaczy przestrzeń z typu elementu.
    const binding = normalizeCatalogBinding(catalogItemId.trim(), catalogNamespace, catalogItemId.trim(), wersja.trim() || undefined);
    const payload: Record<string, unknown> = {
      element_ref: elementRef,
      source_mode: 'KATALOG',
    };
    if (binding) {
      payload.catalog_binding = binding;
    } else {
      payload.catalog_item_id = catalogItemId.trim();
      if (wersja.trim()) payload.catalog_item_version = wersja.trim();
    }
    setBladGlobalny(null);
    try {
      const response = await executeDomainOperation(activeCaseId, 'assign_catalog_to_element', payload);
      if (!response) {
        setBladGlobalny(useSnapshotStore.getState().error ?? T.bladDodania);
        return;
      }
      if (response.error) {
        setBladGlobalny(response.error);
        return;
      }
      closeForm();
      selekcjaPoOperacji(response, { type: fallbackType, name: elementRef });
    } catch (e) {
      setBladGlobalny(e instanceof Error ? e.message : T.bladDodania);
    }
  }, [activeCaseId, catalogItemId, catalogNamespace, closeForm, elementRef, executeDomainOperation, fallbackType, prowadzenie, selekcjaPoOperacji, wersja]);

  const wierszeGotowosci: WierszGotowosci[] = [
    { etykieta: T.wierszElement, stan: elementRef ? 'ustalone' : 'do_wyboru', wartosc: elementRef || '' },
    // Przestrzeń nieznana: backend wyznacza ją z typu elementu (reguła operacji) — stan przyjęty.
    { etykieta: T.wierszPrzestrzen, stan: 'ustalone', wartosc: catalogNamespace || T.przestrzenAuto },
    { etykieta: T.wierszPozycja, stan: catalogItemId ? 'ustalone' : 'do_wyboru', wartosc: catalogItemId || '' },
  ];

  const aside = (
    <>
      <KreatorGotowosc tytul={T.kontrolaTytul} wiersze={wierszeGotowosci} testid="mvd-kreator-przypisanie-gotowosc" />
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
      {...prowadzenie.propsRamy}
      akcjaGlowna={{ etykieta: T.zapisz, onClick: onZapisz, testid: 'mvd-kreator-przypisanie-zapisz' }}
      akcjaAnuluj={{ etykieta: T.anuluj, onClick: () => closeForm(), testid: 'mvd-kreator-przypisanie-anuluj' }}
      testid="mvd-kreator-przypisanie"
    >
      {brakElementu ? (
        <KreatorSekcja tytul={T.brakElementuTytul} testid="mvd-kreator-przypisanie-brak">
          <KreatorInfo>{T.brakElementuOpis}</KreatorInfo>
        </KreatorSekcja>
      ) : null}

      <KreatorSekcja tytul={T.elementTytul} testid="mvd-kreator-przypisanie-element">
        <KreatorInfo>{T.elementPomoc}</KreatorInfo>
        <KreatorSiatka kolumny={2}>
          <RzadWartosci
            etykieta={T.element}
            wartosc={elementRef ? nazwaObiektuZMigawki(snapshot, elementRef) : '—'}
          />
          <RzadWartosci etykieta={T.przestrzen} wartosc={catalogNamespace || T.przestrzenAuto} />
        </KreatorSiatka>
      </KreatorSekcja>

      <KreatorSekcja tytul={T.katalogTytul} testid="mvd-kreator-przypisanie-katalog">
        <PoleTekstowe
          etykieta={T.identyfikator}
          wartosc={catalogItemId}
          onZmiana={setCatalogItemId}
          placeholder={T.identyfikatorPlaceholder}
          pomoc={T.identyfikatorPomoc}
          wymagane
          testid="mvd-kreator-przypisanie-id"
        />
        <PoleTekstowe
          etykieta={T.wersja}
          wartosc={wersja}
          onZmiana={setWersja}
          placeholder={T.wersjaPlaceholder}
          testid="mvd-kreator-przypisanie-wersja"
        />
        <PanelTeorii
          tytul={T.teoriaTytul}
          opis={T.teoriaOpis}
          wymog={T.teoriaWymog}
          podstawa={T.teoriaPodstawa}
          testid="mvd-kreator-przypisanie-teoria"
        />
      </KreatorSekcja>
    </KreatorRama>
  );
}
