/**
 * Kreator „Wyłącznik różnicowoprądowy nN" (add_nn_rcd) — ui2, framework kreatory/rama.
 *
 * Karta W5-E-TTIT: ochrona przeciwporażeniowa w układzie TT opiera się na RCD chroniącym
 * instalację odbiorczą (IEC 60364-4-41 §411.5). Operacja domenowa `add_nn_rcd` wstawia RCD
 * jako APARAT W TORZE (gałąź `switch` z wiązaniem `APARAT_NN_RCD`) między dotychczasową
 * szyną odbioru a nowymi zaciskami instalacji, na które przenosi odbiór. Kreator zbiera
 * WYŁĄCZNIE kontrakt payloadu operacji: `load_ref`, `catalog_ref`, opcjonalnie `name`.
 *
 * ZERO fizyki: parametry typu (I_Δn, rodzaj, czasy wyłączenia, In, Un) są odczytem rekordu
 * `GET /api/catalog/lv-rcd-types` — jedyna operacja na liczbie to zmiana jednostki
 * prezentacji (A → mA) w etykiecie pozycji.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';

import { useAppStateStore } from '../../../ui/app-state';
import { fetchLvRcdTypes, getCatalogErrorMessage } from '../../../ui/catalog/api';
import type { LVRcdType } from '../../../ui/catalog/types';
import { listNnLoadOptions, resolveNnLoadRef } from '../../../ui/network-build/forms/enmResolvers';
import { validateCatalogFirst } from '../../../ui/network-build/forms/catalogFirstRules';
import { useActiveOperationForm, useNetworkBuildStore } from '../../../ui/network-build/networkBuildStore';
import { useSnapshotStore } from '../../../ui/topology/snapshotStore';
import type { AddNNRcdPayload } from '../../../types/domainOps';
import { ETYKIETY_WERYFIKACJI } from '../../spaces/model/katalog/strings';
import {
  KreatorGotowosc,
  KreatorInfo,
  KreatorNastepnyKrok,
  KreatorRama,
  KreatorSekcja,
  KreatorSiatka,
  PoleKatalogu,
  PoleTekstowe,
  PoleWyboru,
  RzadWartosci,
  useSelekcjaPoOperacjiBezNawigacji,
  type WierszGotowosci,
} from '../rama';
import { RCD_NN_STRINGS as T } from './strings';

function fmt(n: number | null | undefined, jedn: string, miejsca: number): string {
  if (n === null || n === undefined || Number.isNaN(n)) return '—';
  return `${n.toFixed(miejsca).replace('.', ',')} ${jedn}`;
}

/** I_Δn w mA do etykiety pozycji katalogu (wyłącznie zmiana jednostki prezentacji). */
function idnMa(rcd: LVRcdType): string {
  return fmt(rcd.i_delta_n_a * 1000, 'mA', 0);
}

/** Etykieta pozycji katalogu: `nazwa · I_Δn w mA · typ · In`. */
function etykietaTypu(rcd: LVRcdType): string {
  const rodzaj = rcd.selective ? `${rcd.rcd_type} ${T.typSelektywny}` : rcd.rcd_type;
  return `${rcd.name} · ${idnMa(rcd)} · typ ${rodzaj} · In ${fmt(rcd.in_a, 'A', 0)}`;
}

export function KreatorRcdNn() {
  const activeForm = useActiveOperationForm();
  const context = activeForm?.context as Record<string, unknown> | undefined;
  const closeForm = useNetworkBuildStore((s) => s.closeOperationForm);
  const executeDomainOperation = useSnapshotStore((s) => s.executeDomainOperation);
  const snapshot = useSnapshotStore((s) => s.snapshot);
  const activeCaseId = useAppStateStore((s) => s.activeCaseId);
  const selekcja = useSelekcjaPoOperacjiBezNawigacji();

  const odbiory = useMemo(() => listNnLoadOptions(snapshot), [snapshot]);
  const odbiorZKontekstu = useMemo(() => resolveNnLoadRef(context, snapshot), [context, snapshot]);

  const [loadRef, setLoadRef] = useState<string>(odbiorZKontekstu ?? '');
  // Migawka może dojść PO otwarciu kreatora (menu odbioru, akcja naprawcza `nn.brak_rcd`) —
  // odbiór wskazany kontekstem trafia do pola, dopóki projektant nie wybrał innego.
  useEffect(() => {
    if (odbiorZKontekstu) setLoadRef((biezacy) => biezacy || odbiorZKontekstu);
  }, [odbiorZKontekstu]);
  const [catalogRef, setCatalogRef] = useState<string | null>(null);
  const [nazwa, setNazwa] = useState('');
  const [bladGlobalny, setBladGlobalny] = useState<string | null>(null);

  const [typy, setTypy] = useState<LVRcdType[]>([]);
  // Pusty katalog to stan GOTOWY (bez pozycji), nie wieczne „Ładowanie katalogu…”.
  const [typyZaladowane, setTypyZaladowane] = useState(false);
  const [bladKatalogu, setBladKatalogu] = useState<string | null>(null);
  useEffect(() => {
    let anulowane = false;
    fetchLvRcdTypes()
      .then((dane) => {
        if (anulowane) return;
        setTypy(Array.isArray(dane) ? dane : []);
        setTypyZaladowane(true);
      })
      .catch((e: unknown) => {
        if (!anulowane) setBladKatalogu(getCatalogErrorMessage(e));
      });
    return () => {
      anulowane = true;
    };
  }, []);

  const wybranyOdbior = useMemo(() => odbiory.find((o) => o.ref_id === loadRef) ?? null, [odbiory, loadRef]);
  const wybranyTyp = useMemo(() => typy.find((t) => t.id === catalogRef) ?? null, [typy, catalogRef]);

  const brakOdbiorow = odbiory.length === 0;
  const kompletne = Boolean(wybranyOdbior && catalogRef);

  const onZapisz = useCallback(async () => {
    if (!activeCaseId) {
      setBladGlobalny(T.brakZakresu);
      return;
    }
    const payload: AddNNRcdPayload = {
      load_ref: loadRef,
      catalog_ref: catalogRef,
    };
    const nazwaNadana = nazwa.trim();
    if (nazwaNadana) payload.name = nazwaNadana;
    const catalogError = validateCatalogFirst('add_nn_rcd', payload as unknown as Record<string, unknown>);
    if (catalogError) {
      setBladGlobalny(catalogError);
      return;
    }
    setBladGlobalny(null);
    try {
      const response = await executeDomainOperation(
        activeCaseId,
        'add_nn_rcd',
        payload as unknown as Record<string, unknown>,
      );
      if (!response) {
        setBladGlobalny(useSnapshotStore.getState().error ?? T.bladDodania);
        return;
      }
      if (response.error) {
        setBladGlobalny(response.error);
        return;
      }
      closeForm();
      selekcja(response, { type: 'Switch', name: nazwaNadana || wybranyTyp?.name || 'Wyłącznik różnicowoprądowy nN' });
    } catch (e) {
      setBladGlobalny(e instanceof Error ? e.message : T.bladDodania);
    }
  }, [activeCaseId, catalogRef, closeForm, executeDomainOperation, loadRef, nazwa, selekcja, wybranyTyp]);

  const wierszeGotowosci: WierszGotowosci[] = [
    { etykieta: T.wierszOdbior, stan: wybranyOdbior ? 'kompletne' : 'brak', wartosc: wybranyOdbior?.name ?? T.doWyboru },
    { etykieta: T.wierszTyp, stan: wybranyTyp ? 'kompletne' : 'brak', wartosc: wybranyTyp?.name ?? T.doWyboru },
  ];

  const aside = (
    <>
      <KreatorGotowosc tytul={T.kontrolaTytul} wiersze={wierszeGotowosci} testid="mvd-kreator-rcd-nn-gotowosc" />
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
      akcjaGlowna={{ etykieta: T.zapisz, onClick: onZapisz, zablokowana: !kompletne || !activeCaseId, testid: 'mvd-kreator-rcd-nn-zapisz' }}
      akcjaAnuluj={{ etykieta: T.anuluj, onClick: () => closeForm(), testid: 'mvd-kreator-rcd-nn-anuluj' }}
      testid="mvd-kreator-rcd-nn"
    >
      <KreatorSekcja tytul={T.odbiorTytul} testid="mvd-kreator-rcd-nn-odbior-sekcja">
        {brakOdbiorow ? (
          <KreatorInfo testid="mvd-kreator-rcd-nn-brak-odbiorow">
            <strong>{T.brakOdbiorowTytul}.</strong> {T.brakOdbiorowOpis}
          </KreatorInfo>
        ) : (
          <>
            <KreatorSiatka kolumny={2}>
              <PoleWyboru
                etykieta={T.odbior}
                wartosc={loadRef}
                onZmiana={setLoadRef}
                opcje={[
                  { id: '', etykieta: T.odbiorPlaceholder },
                  ...odbiory.map((o) => ({
                    id: o.ref_id,
                    etykieta: o.rcd_name
                      ? `${o.name} · ${o.bus_name} · ${T.odbiorMaRcd(o.rcd_name)}`
                      : `${o.name} · ${o.bus_name}`,
                  })),
                ]}
                wymagane
                pomoc={T.odbiorPomoc}
                testid="mvd-kreator-rcd-nn-odbior"
              />
              <RzadWartosci etykieta={T.szynaOdbioru} wartosc={wybranyOdbior?.bus_name ?? '—'} testid="mvd-kreator-rcd-nn-szyna" />
            </KreatorSiatka>
            {wybranyOdbior?.rcd_name ? (
              <KreatorInfo testid="mvd-kreator-rcd-nn-ma-rcd">{T.odbiorMaRcdInfo(wybranyOdbior.rcd_name)}</KreatorInfo>
            ) : null}
          </>
        )}
      </KreatorSekcja>

      <KreatorSekcja tytul={T.typTytul} testid="mvd-kreator-rcd-nn-typ">
        <PoleKatalogu
          etykieta={T.typ}
          wartosc={catalogRef}
          onZmiana={setCatalogRef}
          opcje={typy.map((t) => ({ id: t.id, etykieta: etykietaTypu(t) }))}
          status={bladKatalogu ? 'error' : typyZaladowane ? 'ready' : 'loading'}
          placeholder={T.typPlaceholder}
          komunikatBledu={bladKatalogu ?? T.typBlad}
          wymagane
          testid="mvd-kreator-rcd-nn-katalog"
        />
        {typyZaladowane && typy.length === 0 && !bladKatalogu ? (
          <KreatorInfo testid="mvd-kreator-rcd-nn-katalog-pusty">{T.typPusty}</KreatorInfo>
        ) : null}
        <PoleTekstowe
          etykieta={T.nazwa}
          wartosc={nazwa}
          onZmiana={setNazwa}
          placeholder={T.nazwaPlaceholder}
          testid="mvd-kreator-rcd-nn-nazwa"
        />
        {wybranyTyp ? (
          <div data-testid="mvd-kreator-rcd-nn-parametry">
            <KreatorInfo>{T.paramSekcja}</KreatorInfo>
            <KreatorSiatka kolumny={3}>
              <RzadWartosci etykieta={T.paramIdn} wartosc={`${fmt(wybranyTyp.i_delta_n_a, 'A', 3)} (${idnMa(wybranyTyp)})`} testid="mvd-kreator-rcd-nn-param-idn" />
              <RzadWartosci etykieta={T.paramRodzaj} wartosc={wybranyTyp.rcd_type} testid="mvd-kreator-rcd-nn-param-rodzaj" />
              <RzadWartosci etykieta={T.paramSelektywny} wartosc={wybranyTyp.selective ? T.paramTak : T.paramNie} testid="mvd-kreator-rcd-nn-param-selektywny" />
              <RzadWartosci etykieta={T.paramTa1} wartosc={fmt(wybranyTyp.t_a_s, 's', 2)} testid="mvd-kreator-rcd-nn-param-ta1" />
              <RzadWartosci etykieta={T.paramTa2} wartosc={fmt(wybranyTyp.t_a_2idn_s, 's', 2)} testid="mvd-kreator-rcd-nn-param-ta2" />
              <RzadWartosci etykieta={T.paramTa5} wartosc={fmt(wybranyTyp.t_a_5idn_s, 's', 2)} testid="mvd-kreator-rcd-nn-param-ta5" />
              {wybranyTyp.selective ? (
                <RzadWartosci etykieta={T.paramTnz} wartosc={fmt(wybranyTyp.t_nieczuly_min_s, 's', 2)} testid="mvd-kreator-rcd-nn-param-tnz" />
              ) : null}
              <RzadWartosci etykieta={T.paramIn} wartosc={fmt(wybranyTyp.in_a, 'A', 0)} testid="mvd-kreator-rcd-nn-param-in" />
              <RzadWartosci etykieta={T.paramUn} wartosc={fmt(wybranyTyp.u_n_kv, 'kV', 2)} testid="mvd-kreator-rcd-nn-param-un" />
            </KreatorSiatka>
            <RzadWartosci etykieta={T.paramZrodlo} wartosc={`${ETYKIETY_WERYFIKACJI[wybranyTyp.verification_status] ?? wybranyTyp.verification_status} · ${wybranyTyp.source_reference}`} testid="mvd-kreator-rcd-nn-param-zrodlo" />
          </div>
        ) : null}
      </KreatorSekcja>
    </KreatorRama>
  );
}
