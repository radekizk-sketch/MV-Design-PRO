/**
 * Kreator „Edycja parametrów elementu" (update_element_parameters) — ui2, kreatory/rama.
 *
 * Ekspercki override pól elementu. Zapis = operacja domenowa `update_element_parameters`,
 * której kontrakt to `element_ref` + `parameters` (mapa) + opcjonalny `reason`.
 *
 * Naprawa długu (Zero-Debt §1): stary formularz w trybie prostym wysyłał klucz `updates`,
 * którego handler `update_element_parameters` NIE czyta (czyta `parameters`) — zapis był
 * pustą operacją (phantom). Tutaj wysyłamy poprawnie `parameters`. Backend pilnuje listy
 * dozwolonych kluczy dla typu elementu; parametry katalogowe zmienia się przez katalog.
 */

import { useCallback, useMemo, useState } from 'react';

import { useAppStateStore } from '../../../ui/app-state';
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
import { EDYCJA_PARAMETROW_STRINGS as T } from './strings';

interface WierszParametru {
  klucz: string;
  wartosc: string;
}

function readString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

/** Konwersja tekstu na typ: liczba / bool / null wykrywane automatycznie, reszta jako tekst. */
function parsujWartosc(raw: string): string | number | boolean | null {
  const trimmed = raw.trim();
  if (trimmed === 'null') return null;
  if (trimmed === 'true') return true;
  if (trimmed === 'false') return false;
  if (trimmed !== '' && !Number.isNaN(Number(trimmed))) return Number(trimmed);
  return raw;
}

export function KreatorEdycjiParametrow() {
  const context = useActiveOperationContext();
  const closeForm = useNetworkBuildStore((s) => s.closeOperationForm);
  const executeDomainOperation = useSnapshotStore((s) => s.executeDomainOperation);
  const activeCaseId = useAppStateStore((s) => s.activeCaseId);
  const selekcjaPoOperacji = useSelekcjaPoOperacji();

  const elementRef = readString(context?.element_ref);
  const zrodloParametrow = readString(context?.parameter_source) || readString(context?.source_mode);
  const fallbackType = (readString(context?.element_type) || 'LineBranch') as ElementType;

  const initialKey = readString(context?.field);
  const [wiersze, setWiersze] = useState<WierszParametru[]>(() => [
    { klucz: initialKey, wartosc: readString(context?.value) },
  ]);
  const [powod, setPowod] = useState('');
  const [bladGlobalny, setBladGlobalny] = useState<string | null>(null);

  const wypelnione = useMemo(
    () => wiersze.filter((w) => w.klucz.trim() && w.wartosc.trim() !== ''),
    [wiersze],
  );
  const brakElementu = !elementRef;
  const kompletne = Boolean(elementRef && wypelnione.length > 0);

  const dodajWiersz = useCallback(() => {
    setWiersze((p) => [...p, { klucz: '', wartosc: '' }]);
  }, []);
  const usunWiersz = useCallback((index: number) => {
    setWiersze((p) => (p.length <= 1 ? p : p.filter((_, i) => i !== index)));
  }, []);
  const zmienWiersz = useCallback((index: number, pole: keyof WierszParametru, value: string) => {
    setWiersze((p) => p.map((w, i) => (i === index ? { ...w, [pole]: value } : w)));
  }, []);

  const onZapisz = useCallback(async () => {
    if (!activeCaseId) {
      setBladGlobalny(T.brakZakresu);
      return;
    }
    if (!elementRef) {
      setBladGlobalny(T.brakElementuWalid);
      return;
    }
    if (wypelnione.length === 0) {
      setBladGlobalny(T.brakParametrow);
      return;
    }
    const parameters = wypelnione.reduce<Record<string, unknown>>((acc, w) => {
      acc[w.klucz.trim()] = parsujWartosc(w.wartosc);
      return acc;
    }, {});
    const payload: Record<string, unknown> = { element_ref: elementRef, parameters };
    if (powod.trim()) payload.reason = powod.trim();

    setBladGlobalny(null);
    try {
      const response = await executeDomainOperation(activeCaseId, 'update_element_parameters', payload);
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
  }, [activeCaseId, closeForm, elementRef, executeDomainOperation, fallbackType, powod, selekcjaPoOperacji, wypelnione]);

  const wierszeGotowosci: WierszGotowosci[] = [
    { etykieta: T.wierszElement, stan: elementRef ? 'kompletne' : 'brak', wartosc: elementRef || 'Brak' },
    { etykieta: T.wierszParametry, stan: wypelnione.length > 0 ? 'kompletne' : 'brak', wartosc: `${wypelnione.length} do zapisu` },
    { etykieta: T.wierszPowod, stan: powod.trim() ? 'kompletne' : 'ostrzezenie', wartosc: powod.trim() ? 'Podane' : 'Brak' },
  ];

  const aside = (
    <>
      <KreatorGotowosc tytul={T.kontrolaTytul} wiersze={wierszeGotowosci} testid="mvd-kreator-edycja-gotowosc" />
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
      akcjaGlowna={{ etykieta: T.zapisz, onClick: onZapisz, zablokowana: !kompletne || !activeCaseId, testid: 'mvd-kreator-edycja-zapisz' }}
      akcjaAnuluj={{ etykieta: T.anuluj, onClick: () => closeForm(), testid: 'mvd-kreator-edycja-anuluj' }}
      testid="mvd-kreator-edycja"
    >
      {brakElementu ? (
        <KreatorSekcja tytul={T.brakElementuTytul} testid="mvd-kreator-edycja-brak">
          <KreatorInfo>{T.brakElementuOpis}</KreatorInfo>
        </KreatorSekcja>
      ) : null}

      <KreatorSekcja tytul={T.elementTytul} testid="mvd-kreator-edycja-element">
        <KreatorInfo>{T.elementPomoc}</KreatorInfo>
        <KreatorSiatka kolumny={2}>
          <RzadWartosci etykieta={T.element} wartosc={elementRef || '—'} />
          <RzadWartosci etykieta={T.zrodloParametrow} wartosc={zrodloParametrow || 'nieznane'} />
        </KreatorSiatka>
      </KreatorSekcja>

      <KreatorSekcja tytul={T.parametryTytul} testid="mvd-kreator-edycja-parametry">
        <KreatorInfo>{T.parametryPomoc}</KreatorInfo>
        {wiersze.map((w, i) => (
          <KreatorSiatka kolumny={2} key={`param-${i}`}>
            <PoleTekstowe
              etykieta={T.klucz}
              wartosc={w.klucz}
              onZmiana={(v) => zmienWiersz(i, 'klucz', v)}
              placeholder={T.kluczPlaceholder}
              testid={`mvd-kreator-edycja-klucz-${i}`}
            />
            <PoleTekstowe
              etykieta={T.wartosc}
              wartosc={w.wartosc}
              onZmiana={(v) => zmienWiersz(i, 'wartosc', v)}
              placeholder={T.wartoscPlaceholder}
              testid={`mvd-kreator-edycja-wartosc-${i}`}
            />
            {wiersze.length > 1 ? (
              <button
                type="button"
                className="mvd-kreator-btn"
                data-testid={`mvd-kreator-edycja-usun-${i}`}
                onClick={() => usunWiersz(i)}
              >
                {T.usunWiersz}
              </button>
            ) : null}
          </KreatorSiatka>
        ))}
        <button
          type="button"
          className="mvd-kreator-btn"
          data-testid="mvd-kreator-edycja-dodaj"
          onClick={dodajWiersz}
        >
          {T.dodajWiersz}
        </button>

        <PoleTekstowe
          etykieta={T.powod}
          wartosc={powod}
          onZmiana={setPowod}
          placeholder={T.powodPlaceholder}
          testid="mvd-kreator-edycja-powod"
        />

        <PanelTeorii
          tytul={T.teoriaTytul}
          opis={T.teoriaOpis}
          wymog={T.teoriaWymog}
          podstawa={T.teoriaPodstawa}
          testid="mvd-kreator-edycja-teoria"
        />
      </KreatorSekcja>
    </KreatorRama>
  );
}
