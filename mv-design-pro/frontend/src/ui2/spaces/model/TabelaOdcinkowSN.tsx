/**
 * Tabela zbiorcza odcinków SN (zakładka „Odcinki SN" przestrzeni „Model sieci").
 *
 * Karta JEDNA-SCIEZKA-EDYCJI, pkt 9: generyczna `EdytowalnaTabela` (ui2/shared) dostała
 * pierwszego konsumenta produkcyjnego. Każda komórka edytowalna zapisuje przez DEFINICJĘ
 * rejestru pól (`ui2/model/rejestrPol.ts`) — ta sama walidacja i ten sam ładunek operacji
 * `update_element_parameters` co karta odcinka (`SnSegmentSurface`) i siatka właściwości.
 * Zbiorczość to wiele wierszy w jednym widoku; każda zmiana komórki jest jedną operacją
 * domenową (dziennik i cofanie per zmiana), więc operacja wsadowa nie jest potrzebna.
 *
 * Odczyt wyłącznie z modelu (snapshot ENM): długość (`length_km` → metry), warunki ułożenia
 * (`meta.cable_laying_conditions`), typ katalogowy (`catalog_ref` → nazwa pozycji katalogu
 * backendu), obciążalność (`rating.in_a`, materializowana z typu). Zmiana typu katalogowego
 * i współczynników własnych ułożenia prowadzi do karty odcinka (jedyny edytor tych danych).
 * Warunki ułożenia dla linii napowietrznej nie istnieją w modelu — komórka jest odczytem.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';

import { fetchCableTypes, fetchLineTypes } from '../../../ui/catalog/api';
import { useNetworkBuildStore } from '../../../ui/network-build/networkBuildStore';
import { navigateToNetworkBuild } from '../../../ui/navigation/routes';
import { useSelectionStore } from '../../../ui/selection';
import { useSnapshotStore } from '../../../ui/topology/snapshotStore';
import { useAppStateStore } from '../../../ui/app-state';
import type { Branch } from '../../../types/enm';
import {
  fetchCableLayingConditions,
  type CableLayingConditionsCatalog,
} from '../../kreatory/zrodlo-oze/derSelectionApi';
import {
  POLE_DLUGOSC_ODCINKA,
  POLE_WARUNKI_ULOZENIA_KABLA,
  type DefinicjaPola,
  type RekordModelu,
} from '../../model/rejestrPol';
import { EdytowalnaTabela } from '../../shared/EdytowalnaTabela';
import type { KolumnaEdytowalna, StanZapisuKomorki } from '../../shared/edytowalnaTabelaModel';

const LICZBA_PL = new Intl.NumberFormat('pl-PL', { maximumFractionDigits: 1 });
const KRESKA = '—';

/** Kolumna → definicja rejestru pól, przez którą idzie zapis komórki. */
const DEFINICJE_KOLUMN: Readonly<Record<string, DefinicjaPola>> = {
  dlugosc: POLE_DLUGOSC_ODCINKA,
  ulozenie: POLE_WARUNKI_ULOZENIA_KABLA,
};

type Odcinek = Branch & { readonly type: 'cable' | 'line_overhead' };

function czyOdcinekSN(branch: Branch): branch is Odcinek {
  return branch.type === 'cable' || branch.type === 'line_overhead';
}

function rekord(odcinek: Odcinek): RekordModelu {
  return odcinek as unknown as RekordModelu;
}

function obciazalnosc(odcinek: Odcinek): number | null {
  const rating = 'rating' in odcinek ? (odcinek.rating as { in_a?: unknown } | null | undefined) : null;
  return typeof rating?.in_a === 'number' ? rating.in_a : null;
}

export function TabelaOdcinkowSN() {
  const snapshot = useSnapshotStore((s) => s.snapshot);
  const executeDomainOperation = useSnapshotStore((s) => s.executeDomainOperation);
  const activeCaseId = useAppStateStore((s) => s.activeCaseId);
  const openRouteSurface = useNetworkBuildStore((s) => s.openRouteSurface);
  const selectElement = useSelectionStore((s) => s.selectElement);

  const [nazwyTypow, setNazwyTypow] = useState<ReadonlyMap<string, string>>(new Map());
  const [ulozenia, setUlozenia] = useState<CableLayingConditionsCatalog | null>(null);
  const [bladKatalogu, setBladKatalogu] = useState<string | null>(null);
  const [stany, setStany] = useState<Readonly<Record<string, StanZapisuKomorki>>>({});
  const [komunikat, setKomunikat] = useState<string | null>(null);

  useEffect(() => {
    let anulowano = false;
    Promise.all([fetchCableTypes(), fetchLineTypes(), fetchCableLayingConditions()])
      .then(([kable, linie, warunki]) => {
        if (anulowano) return;
        const mapa = new Map<string, string>();
        for (const typ of [...(Array.isArray(kable) ? kable : []), ...(Array.isArray(linie) ? linie : [])]) {
          mapa.set(typ.id, typ.name);
        }
        setNazwyTypow(mapa);
        setUlozenia(warunki);
        setBladKatalogu(null);
      })
      .catch((error: unknown) => {
        if (anulowano) return;
        setBladKatalogu(error instanceof Error ? error.message : 'Katalog niedostępny');
      });
    return () => {
      anulowano = true;
    };
  }, []);

  const odcinki = useMemo<Odcinek[]>(
    () => (snapshot?.branches ?? []).filter(czyOdcinekSN),
    [snapshot],
  );

  const opcjeUlozenia = useMemo(() => {
    if (!ulozenia) return [];
    // Zestaw „własne" wymaga współczynników — wpisuje się je w karcie odcinka, nie w komórce.
    return [
      ...ulozenia.sets.map((z) => ({ id: z.name, etykieta: z.label_pl })),
      { id: ulozenia.custom_name, etykieta: 'własne (karta odcinka)' },
    ];
  }, [ulozenia]);

  const kolumny = useMemo<KolumnaEdytowalna<Odcinek>[]>(
    () => [
      { klucz: 'nazwa', etykieta: 'Odcinek', sortowalna: true, odczyt: (o) => o.name || o.ref_id },
      {
        klucz: 'rodzaj',
        etykieta: 'Rodzaj',
        sortowalna: true,
        odczyt: (o) => (o.type === 'cable' ? 'Kabel SN' : 'Linia napowietrzna SN'),
      },
      {
        klucz: 'typ',
        etykieta: 'Typ katalogowy',
        odczyt: (o) => (o.catalog_ref ? nazwyTypow.get(o.catalog_ref) ?? o.catalog_ref : 'brak typu — wybierz'),
        edytor: { rodzaj: 'akcja', etykietaAkcji: 'Zmień typ' },
      },
      {
        klucz: 'dlugosc',
        etykieta: 'Długość trasy',
        jednostka: 'm',
        mono: true,
        sortowalna: true,
        odczyt: (o) => {
          const m = POLE_DLUGOSC_ODCINKA.odczyt(rekord(o));
          return typeof m === 'number' ? LICZBA_PL.format(m) : KRESKA;
        },
        sortKey: (o) => {
          const m = POLE_DLUGOSC_ODCINKA.odczyt(rekord(o));
          return typeof m === 'number' ? m : -1;
        },
        wartoscEdycji: (o) => {
          const m = POLE_DLUGOSC_ODCINKA.odczyt(rekord(o));
          return typeof m === 'number' ? m : null;
        },
        edytor: { rodzaj: 'liczba', min: 0, krok: 1 },
      },
      {
        klucz: 'ulozenie',
        etykieta: 'Warunki ułożenia',
        odczyt: (o) => {
          if (o.type !== 'cable') return 'nie dotyczy linii napowietrznej';
          const nazwa = POLE_WARUNKI_ULOZENIA_KABLA.odczyt(rekord(o));
          return typeof nazwa === 'string' ? nazwa : KRESKA;
        },
        wartoscEdycji: (o) => {
          const nazwa = POLE_WARUNKI_ULOZENIA_KABLA.odczyt(rekord(o));
          return typeof nazwa === 'string' ? nazwa : null;
        },
        edytor: { rodzaj: 'wybor', opcje: opcjeUlozenia },
        edytowalnaWWierszu: (o) => o.type === 'cable' && opcjeUlozenia.length > 0,
      },
      {
        klucz: 'obciazalnosc',
        etykieta: 'Obciążalność (z typu)',
        jednostka: 'A',
        mono: true,
        sortowalna: true,
        odczyt: (o) => {
          const i = obciazalnosc(o);
          return i === null ? KRESKA : LICZBA_PL.format(i);
        },
        sortKey: (o) => obciazalnosc(o) ?? -1,
      },
    ],
    [nazwyTypow, opcjeUlozenia],
  );

  const otworzKarteOdcinka = useCallback(
    (odcinek: Odcinek, karta: 'catalog' | 'route') => {
      selectElement({ id: odcinek.ref_id, type: 'LineBranch', name: odcinek.name || odcinek.ref_id });
      navigateToNetworkBuild();
      openRouteSurface('E-12', {
        entityRef: odcinek.ref_id,
        entityType: 'segment',
        subjectKind: 'entity',
        subjectRef: odcinek.ref_id,
        tabId: odcinek.type === 'cable' ? 'kabel-sn' : 'linia-napowietrzna-sn',
        titlePl: odcinek.name || odcinek.ref_id,
        payload: { defaultCard: karta },
      });
    },
    [openRouteSurface, selectElement],
  );

  const zapiszKomorke = useCallback(
    (odcinek: Odcinek, klucz: string, nowaWartosc: string | number) => {
      const definicja = DEFINICJE_KOLUMN[klucz];
      if (!definicja || !activeCaseId) return;
      if (klucz === 'ulozenie' && nowaWartosc === ulozenia?.custom_name) {
        // Współczynniki własne nie mieszczą się w komórce — edytor jest w karcie odcinka.
        otworzKarteOdcinka(odcinek, 'route');
        return;
      }
      if (nowaWartosc === '') return;
      const wartosc = klucz === 'ulozenie' ? { set_name: String(nowaWartosc) } : nowaWartosc;
      const kluczStanu = `${odcinek.ref_id}:${klucz}`;
      const blad = definicja.waliduj(wartosc);
      if (blad !== null) {
        setStany((s) => ({ ...s, [kluczStanu]: 'blad' }));
        setKomunikat(`${odcinek.name || odcinek.ref_id}: ${blad}`);
        return;
      }
      const { operacja, ladunek } = definicja.zapis(odcinek.ref_id, wartosc, rekord(odcinek));
      setStany((s) => ({ ...s, [kluczStanu]: 'zapisywanie' }));
      void executeDomainOperation(activeCaseId, operacja, ladunek).then((odpowiedz) => {
        const odmowa = odpowiedz === null ? 'Brak odpowiedzi serwera' : odpowiedz.error ?? null;
        setStany((s) => ({ ...s, [kluczStanu]: odmowa ? 'blad' : 'idle' }));
        setKomunikat(odmowa ? `${odcinek.name || odcinek.ref_id}: ${odmowa}` : null);
      });
    },
    [activeCaseId, executeDomainOperation, otworzKarteOdcinka, ulozenia],
  );

  return (
    <div className="mvd-model-odcinki" data-testid="mvd-model-odcinki">
      {bladKatalogu ? (
        <p className="mvd-model-odcinki-blad" data-testid="mvd-model-odcinki-blad-katalogu">
          Katalog typów lub warunków ułożenia niedostępny: {bladKatalogu}
        </p>
      ) : null}
      {komunikat ? (
        <p className="mvd-model-odcinki-blad" role="alert" data-testid="mvd-model-odcinki-komunikat">
          {komunikat}
        </p>
      ) : null}
      <EdytowalnaTabela<Odcinek>
        kolumny={kolumny}
        wiersze={odcinki}
        kluczWiersza={(o) => o.ref_id}
        onEdytuj={zapiszKomorke}
        onAkcja={(o) => otworzKarteOdcinka(o, 'catalog')}
        onOtworzWiersz={(o) => otworzKarteOdcinka(o, 'route')}
        stanKomorki={(o, klucz) => stany[`${o.ref_id}:${klucz}`]}
        tekstPusty="Model nie ma jeszcze odcinków SN — dodaj magistralę na schemacie."
        testid="mvd-model-odcinki-tabela"
      />
    </div>
  );
}
