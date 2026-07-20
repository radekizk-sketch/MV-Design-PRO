/**
 * Kreator „Domknięcie pierścienia SN + NOP" (V12K-055, G-RING) — ui2, kreatory/rama.
 *
 * Dwa kroki = dwie realne operacje domenowe: connect_secondary_ring_sn (domknięcie
 * odcinkiem katalogowym) → set_normal_open_point (wskazanie łącznika NOP). Stan NOP
 * honorowany przez rozpływ mocy (otwarty łącznik → praca radialna). ZERO fizyki w UI.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';

import { useAppStateStore } from '../../../ui/app-state';
import { fetchCableTypes, fetchLineTypes, getCatalogErrorMessage } from '../../../ui/catalog/api';
import type { CableType, LineType } from '../../../ui/catalog/types';
import { navigateToSld } from '../../../ui/navigation/routes';
import { useActiveOperationContext, useNetworkBuildStore } from '../../../ui/network-build/networkBuildStore';
import { useSnapshotStore } from '../../../ui/topology/snapshotStore';
import {
  KreatorGotowosc,
  KreatorInfo,
  KreatorNastepnyKrok,
  KreatorRama,
  KreatorSekcja,
  KreatorSiatka,
  PoleKatalogu,
  PoleLiczbowe,
  PoleWyboru,
  RzadWartosci,
  type KrokKreatora,
  type WierszGotowosci,
} from '../rama';
import {
  DANE_DOMYSLNE,
  fmtDlugosc,
  maZaciski,
  walidujDomkniecie,
  walidujNop,
  zbudujPayloadDomkniecie,
  zbudujPayloadNop,
  type BladPola,
  type KandydatNop,
  type KontekstPierscienia,
  type PierscienFormData,
  type RodzajOdcinka,
} from './pierscienModel';
import { PIERSCIEN_STRINGS as T } from './strings';

const KROKI: readonly KrokKreatora[] = [
  { id: 'domkniecie', tytul: T.krokDomkniecie },
  { id: 'nop', tytul: T.krokNop },
];

function trimmed(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function kontekstZOperacji(context: Record<string, unknown> | null): KontekstPierscienia {
  if (!context) return { kandydaciNop: [] };
  const rawNop = context.nop_candidates;
  const kandydaci: KandydatNop[] = Array.isArray(rawNop)
    ? (rawNop as Record<string, unknown>[]).map((c) => ({
        id: trimmed(c.id),
        label: trimmed(c.label) || trimmed(c.id),
        elementType: trimmed(c.elementType) || undefined,
      })).filter((c) => c.id)
    : [];
  const aId = trimmed(context.terminalA_id ?? context.terminal_a_id ?? context.from_bus_ref);
  const bId = trimmed(context.terminalB_id ?? context.terminal_b_id ?? context.to_bus_ref);
  return {
    terminalA_id: aId || undefined,
    terminalA_label: trimmed(context.terminalA_label) || aId || undefined,
    terminalB_id: bId || undefined,
    terminalB_label: trimmed(context.terminalB_label) || bId || undefined,
    kandydaciNop: kandydaci,
  };
}

export function KreatorPierscienia() {
  const context = useActiveOperationContext() as Record<string, unknown> | null;
  const closeForm = useNetworkBuildStore((s) => s.closeOperationForm);
  const executeDomainOperation = useSnapshotStore((s) => s.executeDomainOperation);
  const activeCaseId = useAppStateStore((s) => s.activeCaseId);

  const kontekst = useMemo(() => kontekstZOperacji(context), [context]);
  const hasZaciski = maZaciski(kontekst);

  const [dane, setDane] = useState<PierscienFormData>(() => ({ ...DANE_DOMYSLNE }));
  const [bledy, setBledy] = useState<BladPola[]>([]);
  const [bladGlobalny, setBladGlobalny] = useState<string | null>(null);
  const [krok, setKrok] = useState<string>('domkniecie');

  const [kable, setKable] = useState<CableType[]>([]);
  const [linie, setLinie] = useState<LineType[]>([]);
  const [bladKatalogu, setBladKatalogu] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setBladKatalogu(null);
    Promise.all([fetchCableTypes(), fetchLineTypes()])
      .then(([k, l]) => {
        if (cancelled) return;
        setKable(Array.isArray(k) ? k : []);
        setLinie(Array.isArray(l) ? l : []);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setKable([]);
        setLinie([]);
        setBladKatalogu(getCatalogErrorMessage(e));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const opcjeTypow = useMemo(() => {
    const items: (CableType | LineType)[] = dane.rodzaj === 'LINIA' ? linie : kable;
    return items.map((it) => ({
      id: it.id,
      etykieta: `${it.name} · ${(it as CableType).cross_section_mm2 ?? '—'} mm² · ${it.rated_current_a} A`,
    }));
  }, [dane.rodzaj, kable, linie]);

  const opcjeNop = useMemo(
    () => kontekst.kandydaciNop.map((c) => ({ id: c.id, etykieta: c.label })),
    [kontekst.kandydaciNop],
  );

  const zmien = useCallback(<K extends keyof PierscienFormData>(pole: K, wartosc: PierscienFormData[K]) => {
    setDane((p) => ({ ...p, [pole]: wartosc }));
  }, []);

  const bladDlaPola = (pole: string): string | undefined => bledy.find((b) => b.field === pole)?.message;

  const onDomknij = useCallback(async () => {
    if (!hasZaciski) {
      setBladGlobalny(T.brakZaciskowOpis);
      return;
    }
    const walid = walidujDomkniecie(dane);
    setBledy(walid);
    if (walid.length > 0) return;
    if (!activeCaseId) {
      setBladGlobalny(T.brakZakresu);
      return;
    }
    setBladGlobalny(null);
    try {
      const response = await executeDomainOperation(
        activeCaseId,
        'connect_secondary_ring_sn',
        zbudujPayloadDomkniecie(dane, kontekst),
      );
      if (!response) {
        setBladGlobalny(useSnapshotStore.getState().error ?? T.walidacjaStopka);
        return;
      }
      if (response.error) {
        setBladGlobalny(response.error);
        return;
      }
      setKrok('nop');
    } catch (e) {
      setBladGlobalny(e instanceof Error ? e.message : T.walidacjaStopka);
    }
  }, [activeCaseId, dane, executeDomainOperation, hasZaciski, kontekst]);

  const onZapiszNop = useCallback(async () => {
    const walid = walidujNop(dane);
    setBledy(walid);
    if (walid.length > 0) return;
    if (!activeCaseId) {
      setBladGlobalny(T.brakZakresu);
      return;
    }
    setBladGlobalny(null);
    try {
      const response = await executeDomainOperation(activeCaseId, 'set_normal_open_point', zbudujPayloadNop(dane));
      if (!response) {
        setBladGlobalny(useSnapshotStore.getState().error ?? T.walidacjaStopka);
        return;
      }
      if (response.error) {
        setBladGlobalny(response.error);
        return;
      }
      closeForm();
      navigateToSld();
    } catch (e) {
      setBladGlobalny(e instanceof Error ? e.message : T.walidacjaStopka);
    }
  }, [activeCaseId, closeForm, dane, executeDomainOperation]);

  const params = useMemo(
    () =>
      dane.catalog_ref
        ? [...kable, ...linie].find((t) => t.id === dane.catalog_ref) ?? null
        : null,
    [dane.catalog_ref, kable, linie],
  );

  const wierszeGotowosci: WierszGotowosci[] = [
    {
      etykieta: T.wierszZaciski,
      stan: hasZaciski ? 'kompletne' : 'brak',
      wartosc: hasZaciski ? `${kontekst.terminalA_label} ↔ ${kontekst.terminalB_label}` : 'Brak',
    },
    {
      etykieta: T.wierszTyp,
      stan: dane.catalog_ref ? 'kompletne' : 'brak',
      wartosc: dane.catalog_ref ? 'Kompletne' : 'Do konfiguracji',
    },
    { etykieta: T.wierszDlugosc, stan: dane.dlugosc_m ? 'kompletne' : 'brak', wartosc: fmtDlugosc(dane.dlugosc_m) },
    {
      etykieta: T.wierszNop,
      stan: dane.nop_ref ? 'kompletne' : 'ostrzezenie',
      wartosc: dane.nop_ref ? 'Wskazany' : 'Do wskazania',
    },
  ];

  const aside = (
    <>
      <KreatorGotowosc tytul={T.kontrolaTytul} wiersze={wierszeGotowosci} testid="mvd-kreator-pierscien-gotowosc" />
      <KreatorNastepnyKrok eyebrow={T.downstreamTytul} opis={T.downstreamOpis} />
    </>
  );

  const krokIndex = KROKI.findIndex((k) => k.id === krok);
  const naNop = krok === 'nop';

  return (
    <KreatorRama
      eyebrow={T.eyebrow}
      tytul={T.eyebrow}
      cel={T.cel}
      odznaka={T.odznaka}
      kroki={KROKI}
      krokAktywny={krok}
      pelny
      aside={aside}
      bladGlobalny={bladGlobalny}
      walidacja={bledy.length > 0 ? T.walidacjaStopka : !hasZaciski ? T.brakZaciskowOpis : null}
      akcjaGlowna={
        naNop
          ? { etykieta: T.zapiszNop, onClick: onZapiszNop, zablokowana: !activeCaseId, testid: 'mvd-kreator-pierscien-zapisz-nop' }
          : { etykieta: T.domknij, onClick: onDomknij, zablokowana: !hasZaciski || !activeCaseId, testid: 'mvd-kreator-pierscien-domknij' }
      }
      akcjaAnuluj={{ etykieta: T.anuluj, onClick: () => closeForm(), testid: 'mvd-kreator-pierscien-anuluj' }}
      licznikKrokow={T.licznik(krokIndex + 1, KROKI.length)}
      testid="mvd-kreator-pierscien"
    >
      {!hasZaciski ? (
        <KreatorSekcja tytul={T.brakZaciskowTytul} testid="mvd-kreator-pierscien-brak">
          <KreatorInfo>{T.brakZaciskowOpis}</KreatorInfo>
        </KreatorSekcja>
      ) : null}

      {!naNop ? (
        <KreatorSekcja tytul={T.krokDomkniecie} testid="mvd-kreator-pierscien-domkniecie">
          <KreatorInfo>{T.typPomoc}</KreatorInfo>
          <KreatorSiatka kolumny={2}>
            <RzadWartosci etykieta={T.zaciskA} wartosc={kontekst.terminalA_label || '—'} />
            <RzadWartosci etykieta={T.zaciskB} wartosc={kontekst.terminalB_label || '—'} />
          </KreatorSiatka>
          <KreatorSiatka kolumny={2}>
            <PoleWyboru
              etykieta={T.rodzaj}
              wartosc={dane.rodzaj}
              onZmiana={(v) => {
                zmien('rodzaj', v as RodzajOdcinka);
                zmien('catalog_ref', null);
              }}
              opcje={T.rodzajOpcje}
              testid="mvd-kreator-pierscien-rodzaj"
            />
            <PoleLiczbowe
              etykieta={T.dlugosc}
              wartosc={dane.dlugosc_m}
              onZmiana={(v) => zmien('dlugosc_m', v)}
              krok={10}
              min={0}
              pomoc={T.dlugoscPomoc}
              blad={bladDlaPola('dlugosc_m')}
              testid="mvd-kreator-pierscien-dlugosc"
            />
          </KreatorSiatka>
          <PoleKatalogu
            etykieta={T.typKatalog}
            wartosc={dane.catalog_ref}
            onZmiana={(v) => zmien('catalog_ref', v)}
            opcje={opcjeTypow}
            status={bladKatalogu ? 'error' : 'ready'}
            placeholder={T.typKatalogPlaceholder}
            komunikatBledu={bladKatalogu ?? T.typBlad}
            testid="mvd-kreator-pierscien-katalog"
          />
          {bladDlaPola('catalog_ref') ? <p className="mvd-pole-blad">{bladDlaPola('catalog_ref')}</p> : null}
          {params ? (
            <KreatorSiatka kolumny={2}>
              <RzadWartosci etykieta="Obciążalność" wartosc={`${params.rated_current_a} A`} />
              <RzadWartosci
                etykieta="Przekrój"
                wartosc={
                  typeof (params as CableType).cross_section_mm2 === 'number'
                    ? `${(params as CableType).cross_section_mm2} mm²`
                    : '—'
                }
              />
            </KreatorSiatka>
          ) : null}
        </KreatorSekcja>
      ) : null}

      {naNop ? (
        <KreatorSekcja tytul={T.nopTytul} testid="mvd-kreator-pierscien-nop">
          <KreatorInfo>{T.pierscienDomkniety}</KreatorInfo>
          <KreatorInfo>{T.nopPomoc}</KreatorInfo>
          {opcjeNop.length > 0 ? (
            <PoleWyboru
              etykieta={T.nopTytul}
              wartosc={dane.nop_ref ?? ''}
              onZmiana={(v) => zmien('nop_ref', v || null)}
              opcje={[{ id: '', etykieta: T.nopPlaceholder }, ...opcjeNop]}
              testid="mvd-kreator-pierscien-nop-wybor"
            />
          ) : (
            <KreatorInfo>{T.nopBrakKandydatow}</KreatorInfo>
          )}
          {bladDlaPola('nop_ref') ? <p className="mvd-pole-blad">{bladDlaPola('nop_ref')}</p> : null}
        </KreatorSekcja>
      ) : null}
    </KreatorRama>
  );
}
