/**
 * Zakładka ODCINKI — tabela EDYTOWALNA odcinków kablowych nN (karta P0.9,
 * plan F §2/§5). Kolumny STRUKTURALNE 1:1 z modelu (od/do/przekrój/materiał/
 * długość/n_torów/ułożenie/status); edycja inline: długość i n_torów →
 * `update_element_parameters` (allowlist `branches.length_km`/`n_parallel`
 * już istnieje w backendzie), kabel → `assign_catalog_to_element` (picker
 * katalogu istniejący, otwarty przez `openOperationForm`).
 *
 * ZAKRES ŚWIADOMIE POMINIĘTY (nazwane w meldunku karty, nie fabrykacja):
 * - Ib/Iz′(skorygowane)/ΔU/Ik/SWZ per wiersz NIE są tu liczone/pobierane —
 *   wymagałyby albo fizyki w UI (Ib=S/√3U, ZAKAZANE — `ui_no_physics_guard`
 *   klasyfikuje arytmetykę na `ampacity` jako fizykę), albo rozwiązania
 *   „który aparat chroni ten odcinek" (algorytm poza zakresem tej karty —
 *   patrz zakładka SWZ, gdzie ten problem jest rozwiązany per ODPŁYW, nie per
 *   odcinek). Iz′ SKORYGOWANE warunkami ułożenia wymaga endpointu podglądu
 *   nN, którego backend nie wystawia (patrz komentarz `KreatorOdcinkaNn`) —
 *   tabela pokazuje wyłącznie Iz KATALOGOWE (na tor, bez mnożenia przez
 *   n_torów — mnożenie ampacity jest DOKŁADNIE wzorcem, który
 *   `ui_no_physics_guard` klasyfikuje jako fizykę).
 * - Edycja pełnego opisu ułożenia (5 pól: środowisko/izolacja/temperatura/
 *   liczba obwodów/rezystywność) wymaga dedykowanego mini-formularza (nie
 *   pojedynczej komórki) — kolumna „Ułożenie" jest tu TYLKO DO ODCZYTU;
 *   operacja `set_nn_cable_laying_conditions` pozostaje zarejestrowana i
 *   wywoływalna (kreator „Odcinek nN" ustawia ją przy tworzeniu odcinka).
 */

import { useEffect, useMemo, useState } from 'react';

import { fetchLvCableTypes, getCatalogErrorMessage } from '../../../../ui/catalog/api';
import type { LVCableType } from '../../../../ui/catalog/types';
import { useAppStateStore } from '../../../../ui/app-state';
import { useNetworkBuildStore } from '../../../../ui/network-build/networkBuildStore';
import { useSnapshotStore } from '../../../../ui/topology/snapshotStore';
import { useOdcinkiKablowNn, type OdcinekNnWiersz } from '../../../nav/adapters/nnStudioTreeAdapter';
import { EdytowalnaTabela, type KolumnaEdytowalna, type StanZapisuKomorki } from '../../../shared';
import { NN_STUDIO_STRINGS as T } from './strings';

function opisUlozenia(raw: OdcinekNnWiersz['layingConditions']): string {
  if (raw === null || raw === undefined) return T.ulozenieKatalogowe;
  if (typeof raw === 'string') return raw || T.ulozenieKatalogowe;
  const opis = raw as Record<string, unknown>;
  const env = typeof opis.environment === 'string' ? opis.environment : '—';
  const izo = typeof opis.insulation === 'string' ? opis.insulation : '—';
  const temp = typeof opis.ambient_temperature_c === 'number' ? `${opis.ambient_temperature_c}°C` : '—';
  const obw = typeof opis.circuit_count === 'number' ? `${opis.circuit_count} obw.` : '—';
  return `${env}, ${izo}, ${temp}, ${obw}`;
}

export function TabelaOdcinkowNn({ stationRef }: { stationRef: string | null }) {
  const odcinki = useOdcinkiKablowNn(stationRef);
  const activeCaseId = useAppStateStore((s) => s.activeCaseId);
  const executeDomainOperation = useSnapshotStore((s) => s.executeDomainOperation);
  const openOperationForm = useNetworkBuildStore((s) => s.openOperationForm);

  const [kable, setKable] = useState<LVCableType[]>([]);
  const [bladKatalogu, setBladKatalogu] = useState<string | null>(null);
  useEffect(() => {
    let anulowane = false;
    fetchLvCableTypes()
      .then((dane) => {
        if (!anulowane) setKable(Array.isArray(dane) ? dane : []);
      })
      .catch((e: unknown) => {
        if (!anulowane) setBladKatalogu(getCatalogErrorMessage(e));
      });
    return () => {
      anulowane = true;
    };
  }, []);
  const nazwaKabla = useMemo(() => {
    const mapa = new Map(kable.map((k) => [k.id, k.name]));
    return (catalogRef: string | null) => (catalogRef ? mapa.get(catalogRef) ?? catalogRef : '—');
  }, [kable]);

  const [stanKomorek, setStanKomorek] = useState<Map<string, StanZapisuKomorki>>(new Map());
  const kluczStanu = (ref: string, klucz: string) => `${ref}::${klucz}`;
  const ustawStan = (ref: string, klucz: string, stan: StanZapisuKomorki | undefined) => {
    setStanKomorek((poprz) => {
      const kopia = new Map(poprz);
      if (stan === undefined) kopia.delete(kluczStanu(ref, klucz));
      else kopia.set(kluczStanu(ref, klucz), stan);
      return kopia;
    });
  };

  const onEdytuj = async (wiersz: OdcinekNnWiersz, klucz: string, wartosc: string | number) => {
    if (!activeCaseId) return;
    const parametry: Record<string, unknown> =
      klucz === 'dlugosc'
        ? { length_km: Number(wartosc) / 1000 }
        : klucz === 'nTorow'
          ? { n_parallel: Number(wartosc) }
          : {};
    if (Object.keys(parametry).length === 0) return;
    ustawStan(wiersz.ref, klucz, 'zapisywanie');
    try {
      const response = await executeDomainOperation(activeCaseId, 'update_element_parameters', {
        element_ref: wiersz.ref,
        parameters: parametry,
      });
      ustawStan(wiersz.ref, klucz, response && !response.error ? undefined : 'blad');
    } catch {
      ustawStan(wiersz.ref, klucz, 'blad');
    }
  };

  const onAkcja = (wiersz: OdcinekNnWiersz, klucz: string) => {
    if (klucz === 'kabel') {
      openOperationForm('assign_catalog_to_element', { element_ref: wiersz.ref, catalog_namespace: 'KABEL_NN' });
    }
  };

  const kolumny: KolumnaEdytowalna<OdcinekNnWiersz>[] = [
    { klucz: 'id', etykieta: T.kolId, mono: true, odczyt: (w) => w.ref },
    { klucz: 'od', etykieta: T.kolOd, odczyt: (w) => w.fromBusName },
    { klucz: 'do', etykieta: T.kolDo, odczyt: (w) => w.toBusName },
    {
      klucz: 'kabel',
      etykieta: T.kolKabel,
      odczyt: (w) => nazwaKabla(w.catalogRef),
      edytor: { rodzaj: 'akcja', etykietaAkcji: T.kolKabelAkcja },
    },
    {
      klucz: 'przekroj',
      etykieta: T.kolPrzekroj,
      jednostka: 'mm²',
      mono: true,
      odczyt: (w) => (w.crossSectionMm2 !== null ? String(w.crossSectionMm2) : '—'),
      sortKey: (w) => w.crossSectionMm2 ?? -1,
    },
    { klucz: 'material', etykieta: T.kolMaterial, odczyt: (w) => w.conductorMaterial ?? '—' },
    {
      klucz: 'dlugosc',
      etykieta: T.kolDlugosc,
      jednostka: 'm',
      mono: true,
      odczyt: (w) => String(Math.round(w.lengthM)),
      sortKey: (w) => w.lengthM,
      wartoscEdycji: (w) => Math.round(w.lengthM),
      edytor: { rodzaj: 'liczba', min: 0.1 },
    },
    {
      klucz: 'nTorow',
      etykieta: T.kolNTorow,
      mono: true,
      odczyt: (w) => String(w.nParallel),
      sortKey: (w) => w.nParallel,
      wartoscEdycji: (w) => w.nParallel,
      edytor: { rodzaj: 'liczba', min: 1, krok: 1 },
    },
    { klucz: 'ulozenie', etykieta: T.kolUlozenie, odczyt: (w) => opisUlozenia(w.layingConditions) },
    {
      klucz: 'izKatalogowe',
      etykieta: T.kolIzKatalogowe,
      jednostka: 'A (na tor)',
      mono: true,
      odczyt: (w) => (w.ratedAmpacityA !== null ? String(w.ratedAmpacityA) : '—'),
      sortKey: (w) => w.ratedAmpacityA ?? -1,
    },
    {
      klucz: 'status',
      etykieta: T.kolStatus,
      odczyt: (w) => (w.status === 'closed' ? T.statusZamkniety : T.statusOtwarty),
    },
  ];

  return (
    <div className="mvd-nn-studio-odcinki" data-testid="mvd-nn-studio-odcinki">
      {bladKatalogu ? <p className="mvd-nn-studio-blad">{bladKatalogu}</p> : null}
      <EdytowalnaTabela
        kolumny={kolumny}
        wiersze={odcinki}
        kluczWiersza={(w) => w.ref}
        onEdytuj={onEdytuj}
        onAkcja={onAkcja}
        stanKomorki={(w, klucz) => stanKomorek.get(kluczStanu(w.ref, klucz))}
        tekstPusty={T.odcinkiPusto}
        testid="mvd-nn-studio-tabela-odcinkow"
      />
    </div>
  );
}
