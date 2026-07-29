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
  const activeCaseId = useAppStateStore((s) => s.activeCaseId);
  const selekcjaPoOperacji = useSelekcjaPoOperacji();

  const elementRef = readString(context?.element_ref);
  const catalogNamespace = (readString(context?.catalog_namespace) || null) as CatalogNamespace | null;
  const fallbackType = (readString(context?.element_type) || 'LineBranch') as ElementType;

  const [catalogItemId, setCatalogItemId] = useState(readString(context?.catalog_item_id));
  const [wersja, setWersja] = useState(readString(context?.catalog_item_version));
  const [bladGlobalny, setBladGlobalny] = useState<string | null>(null);

  const brakElementu = !elementRef;
  const kompletne = Boolean(elementRef && catalogItemId.trim());

  const onZapisz = useCallback(async () => {
    if (!activeCaseId) {
      setBladGlobalny(T.brakZakresu);
      return;
    }
    if (!elementRef) {
      setBladGlobalny(T.brakElementuWalid);
      return;
    }
    if (!catalogItemId.trim()) {
      setBladGlobalny(T.brakIdentyfikatora);
      return;
    }
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
  }, [activeCaseId, catalogItemId, catalogNamespace, closeForm, elementRef, executeDomainOperation, fallbackType, selekcjaPoOperacji, wersja]);

  const wierszeGotowosci: WierszGotowosci[] = [
    { etykieta: T.wierszElement, stan: elementRef ? 'kompletne' : 'brak', wartosc: elementRef || 'Brak' },
    { etykieta: T.wierszPrzestrzen, stan: catalogNamespace ? 'kompletne' : 'ostrzezenie', wartosc: catalogNamespace || T.przestrzenAuto },
    { etykieta: T.wierszPozycja, stan: catalogItemId ? 'kompletne' : 'brak', wartosc: catalogItemId || 'Do wskazania' },
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
      walidacja={!kompletne ? T.walidacjaStopka : null}
      akcjaGlowna={{ etykieta: T.zapisz, onClick: onZapisz, zablokowana: !kompletne || !activeCaseId, testid: 'mvd-kreator-przypisanie-zapisz' }}
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
          <RzadWartosci etykieta={T.element} wartosc={elementRef || '—'} />
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
