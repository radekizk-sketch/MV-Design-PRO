/**
 * K9-A: kroki „Aparatura pola" i „Zgodność przyłączeniowa" kreatora źródła OZE.
 *
 * Wybory zapisują się do modelu PO utworzeniu wytwórcy (sekwencja zapisu kreatora,
 * wiązania katalogowe + profile zgodności). Walidacja katalogowa: przekładniki,
 * zabezpieczenie i model dynamiczny (karta FAB-L: `GET /api/catalog/der-dynamic-profiles`,
 * `network_model.catalog.der_dynamic` — konsumowany przez solvery RMS/FRT-HVRT).
 * Dawne dane zwarciowe (`fault_current_data_ref`) USUNIĘTE z kontraktu razem z tą kartą:
 * pole nie miało ŻADNEGO konsumenta solvera (κ i składowe symetryczne liczy IEC 60909
 * z modelu sieci, nie z deklaracji urządzenia). Profile NC RfG pochodzą z katalogów
 * profili i krzywych operatorów (te same, których używa warsztat wytwórcy).
 */

import { useEffect, useMemo, useState } from 'react';

import {
  fetchCtTypes,
  fetchProtectionDeviceTypes,
  fetchVtTypes,
  getCatalogErrorMessage,
} from '../../../ui/catalog/api';
import type { CTCatalogType, ProtectionDeviceType, VTCatalogType } from '../../../ui/catalog/types';
import {
  fetchAudit2CatalogSnapshot,
  fetchDerDynamicProfiles,
  fetchNcRfgOperators,
  formatDerDynamicProfileLabelPl,
  getNcRfgOperator,
  selectDerDynamicProfilesForKind,
  type DerDynamicProfileItem,
  type NcRfgOperatorItem,
  type PfCurveItem,
} from '../../../ui/network-build/station-der';
import {
  KreatorInfo,
  KreatorSekcja,
  KreatorSiatka,
  PanelTeorii,
  PoleKatalogu,
  type StatusPobrania,
} from '../rama';
import { OZE_STRINGS as T } from './strings';
import type { OzeFormData } from './zrodloOzeModel';

export interface KrokAparaturaZgodnoscProps {
  dane: OzeFormData;
  zmien: <K extends keyof OzeFormData>(pole: K, wartosc: OzeFormData[K]) => void;
  testid?: string;
}

/** Krok „Aparatura pola" — CT, VT, zabezpieczenie i model dynamiczny, wszystkie z katalogu. */
export function KrokAparatura({ dane, zmien, testid = 'mvd-kreator-oze-aparatura' }: KrokAparaturaZgodnoscProps) {
  const [ctTypy, setCtTypy] = useState<CTCatalogType[]>([]);
  const [vtTypy, setVtTypy] = useState<VTCatalogType[]>([]);
  const [zabTypy, setZabTypy] = useState<ProtectionDeviceType[]>([]);
  const [dynProfile, setDynProfile] = useState<DerDynamicProfileItem[]>([]);
  const [status, setStatus] = useState<StatusPobrania>('loading');
  const [bladKatalogu, setBladKatalogu] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setStatus('loading');
    setBladKatalogu(null);
    Promise.all([fetchCtTypes(), fetchVtTypes(), fetchProtectionDeviceTypes(), fetchDerDynamicProfiles()])
      .then(([ct, vt, zab, dyn]) => {
        if (cancelled) return;
        setCtTypy(Array.isArray(ct) ? ct : []);
        setVtTypy(Array.isArray(vt) ? vt : []);
        setZabTypy(Array.isArray(zab) ? zab : []);
        setDynProfile(Array.isArray(dyn) ? dyn : []);
        setStatus('ready');
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setCtTypy([]);
        setVtTypy([]);
        setZabTypy([]);
        setDynProfile([]);
        setStatus('error');
        setBladKatalogu(getCatalogErrorMessage(e));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const opcjeCt = useMemo(
    () =>
      ctTypy.map((t) => ({
        id: t.id,
        etykieta: `${t.manufacturer ? `${t.manufacturer} · ` : ''}${t.name} · ${t.ratio_primary_a}/${t.ratio_secondary_a} A${t.accuracy_class ? ` · kl. ${t.accuracy_class}` : ''}`,
      })),
    [ctTypy],
  );
  const opcjeVt = useMemo(
    () =>
      vtTypy.map((t) => ({
        id: t.id,
        etykieta: `${t.manufacturer ? `${t.manufacturer} · ` : ''}${t.name} · ${t.ratio_primary_v}/${t.ratio_secondary_v} V${t.accuracy_class ? ` · kl. ${t.accuracy_class}` : ''}`,
      })),
    [vtTypy],
  );
  const opcjeZab = useMemo(
    () =>
      zabTypy.map((t) => ({
        id: t.id,
        etykieta: t.vendor ? `${t.vendor} · ${t.model ?? t.name}` : t.name,
      })),
    [zabTypy],
  );
  // Karta FAB-L: profile filtrowane po rodzaju DER — falownik PV/BESS i turbina
  // wiatrowa mają rozłączne katalogi (`der_kind`), więc lista pokazuje WYŁĄCZNIE
  // profile pasujące do wybranej technologii źródła.
  const opcjeDynModel = useMemo(
    () =>
      selectDerDynamicProfilesForKind(dynProfile, dane.source_technology).map((p) => ({
        id: p.profile_id,
        etykieta: formatDerDynamicProfileLabelPl(p),
      })),
    [dynProfile, dane.source_technology],
  );

  return (
    <KreatorSekcja tytul={T.sekcjaAparatura} testid={testid}>
      <KreatorInfo>{T.aparaturaPomoc}</KreatorInfo>
      <KreatorSiatka kolumny={2}>
        <PoleKatalogu
          etykieta={T.aparaturaCt}
          wartosc={dane.ct_catalog_ref}
          onZmiana={(v) => zmien('ct_catalog_ref', v)}
          opcje={opcjeCt}
          status={status}
          placeholder={T.aparaturaKatalogPlaceholder}
          komunikatBledu={bladKatalogu ?? T.aparaturaKatalogBlad}
          pomoc={T.aparaturaCtPomoc}
          testid={`${testid}-ct`}
        />
        <PoleKatalogu
          etykieta={T.aparaturaVt}
          wartosc={dane.vt_catalog_ref}
          onZmiana={(v) => zmien('vt_catalog_ref', v)}
          opcje={opcjeVt}
          status={status}
          placeholder={T.aparaturaKatalogPlaceholder}
          komunikatBledu={bladKatalogu ?? T.aparaturaKatalogBlad}
          pomoc={T.aparaturaVtPomoc}
          testid={`${testid}-vt`}
        />
      </KreatorSiatka>
      <PoleKatalogu
        etykieta={T.aparaturaZabezpieczenie}
        wartosc={dane.protection_catalog_ref}
        onZmiana={(v) => zmien('protection_catalog_ref', v)}
        opcje={opcjeZab}
        status={status}
        placeholder={T.aparaturaKatalogPlaceholder}
        komunikatBledu={bladKatalogu ?? T.aparaturaKatalogBlad}
        pomoc={T.aparaturaZabezpieczeniePomoc}
        testid={`${testid}-zabezpieczenie`}
      />
      <PoleKatalogu
        etykieta={T.aparaturaModelDynamiczny}
        wartosc={dane.dynamic_model_ref}
        onZmiana={(v) => zmien('dynamic_model_ref', v)}
        opcje={opcjeDynModel}
        status={status}
        placeholder={T.aparaturaKatalogPlaceholder}
        komunikatBledu={bladKatalogu ?? T.aparaturaKatalogBlad}
        pomoc={T.aparaturaModelDynamicznyPomoc}
        testid={`${testid}-model-dynamiczny`}
      />
      <PanelTeorii
        tytul={T.teoriaAparaturaTytul}
        opis={T.teoriaAparaturaOpis}
        wymog={T.teoriaAparaturaWymog}
        podstawa={T.teoriaAparaturaPodstawa}
        testid={`${testid}-teoria`}
      />
    </KreatorSekcja>
  );
}

/**
 * Krok „Zgodność przyłączeniowa" — profil operatora + krzywe graniczne NC RfG.
 *
 * Karta FAB-J: profil operatora i krzywe LVRT/HVRT WYŁĄCZNIE z backendu
 * (`GET /api/ncrfg-tests/catalog`) i P(f) ze snapshotu audytu 2
 * (`GET /api/v1/catalog/audit2/snapshot`) — zero drugiej kopii katalogu w
 * froncie. Backend niesie JEDNĄ parę krzywych ride-through na operatora (nie
 * katalog wariantów), więc `lvrt_curve_ref`/`hvrt_curve_ref` są tożsamościowo
 * związane z `nc_rfg_profile_ref` (ten sam operator), a nie osobnym wyborem —
 * wyświetlane jako dowód White Box, nie jako pola do wypełnienia.
 */
export function KrokZgodnosc({ dane, zmien, testid = 'mvd-kreator-oze-zgodnosc' }: KrokAparaturaZgodnoscProps) {
  const [ncRfgOperatorzy, setNcRfgOperatorzy] = useState<NcRfgOperatorItem[]>([]);
  const [pfKrzywe, setPfKrzywe] = useState<PfCurveItem[]>([]);
  const [status, setStatus] = useState<StatusPobrania>('loading');
  const [bladKatalogu, setBladKatalogu] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setStatus('loading');
    setBladKatalogu(null);
    Promise.all([fetchNcRfgOperators(), fetchAudit2CatalogSnapshot()])
      .then(([operatorzy, snapshot]) => {
        if (cancelled) return;
        setNcRfgOperatorzy(Array.isArray(operatorzy) ? [...operatorzy] : []);
        setPfKrzywe(Array.isArray(snapshot.pf_curves) ? [...snapshot.pf_curves] : []);
        setStatus('ready');
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setNcRfgOperatorzy([]);
        setPfKrzywe([]);
        setStatus('error');
        setBladKatalogu(getCatalogErrorMessage(e));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const profil = getNcRfgOperator(ncRfgOperatorzy, dane.nc_rfg_profile_ref);

  const opcjeProfili = useMemo(
    () => ncRfgOperatorzy.map((o) => ({ id: o.operator_id, etykieta: o.operator_name_pl })),
    [ncRfgOperatorzy],
  );
  // Warianty nastawy P(f) nie zależą od operatora (karta K-Q): rozporządzenie
  // (UE) 2016/631 art. 13 ust. 2 podaje statyzm jako nastawialny w przedziale
  // 2-12%, a nie jako wartość „dla PSE / Energi / Tauronu". Lista jest pełna.
  const opcjePf = useMemo(
    () => pfKrzywe.map((c) => ({ id: c.id, etykieta: c.label_pl })),
    [pfKrzywe],
  );

  // Zmiana profilu ustawia krzywe LVRT/HVRT na tego samego operatora (1:1,
  // patrz nota nad komponentem) — bez tego DER wysłałby do modelu krzywą
  // niespójną z profilem.
  const wybierzProfil = (ref: string | null) => {
    zmien('nc_rfg_profile_ref', ref);
    zmien('lvrt_curve_ref', ref);
    zmien('hvrt_curve_ref', ref);
    // Nastawa P(f) NIE jest zawężana profilem operatora — patrz nota nad
    // `opcjePf`. Zmiana profilu nie czyści więc tego wyboru.
  };

  return (
    <KreatorSekcja tytul={T.sekcjaZgodnosc} testid={testid}>
      <KreatorInfo>{T.zgodnoscPomoc}</KreatorInfo>
      <PoleKatalogu
        etykieta={T.zgodnoscProfil}
        wartosc={dane.nc_rfg_profile_ref}
        onZmiana={wybierzProfil}
        opcje={opcjeProfili}
        status={status}
        placeholder={T.zgodnoscProfilPlaceholder}
        komunikatBledu={bladKatalogu ?? undefined}
        pomoc={T.zgodnoscProfilPomoc}
        testid={`${testid}-profil`}
      />
      {dane.nc_rfg_profile_ref ? (
        <>
          <KreatorSiatka kolumny={2}>
            <div>
              <strong>{T.zgodnoscLvrt}</strong>
              <KreatorInfo testid={`${testid}-lvrt`}>
                {profil
                  ? profil.ride_through.lvrt
                    .map((p) => `${p.time_s.toFixed(2)} s / ${p.voltage_pu.toFixed(2)} pu`)
                    .join(' → ')
                  : T.zgodnoscKrzywaPlaceholder}
              </KreatorInfo>
            </div>
            <div>
              <strong>{T.zgodnoscHvrt}</strong>
              <KreatorInfo testid={`${testid}-hvrt`}>
                {profil
                  ? profil.ride_through.hvrt
                    .map((p) => `${p.time_s.toFixed(2)} s / ${p.voltage_pu.toFixed(2)} pu`)
                    .join(' → ')
                  : T.zgodnoscKrzywaPlaceholder}
              </KreatorInfo>
            </div>
          </KreatorSiatka>
          <PoleKatalogu
            etykieta={T.zgodnoscPf}
            wartosc={dane.pf_curve_ref}
            onZmiana={(v) => zmien('pf_curve_ref', v)}
            opcje={opcjePf}
            status={status}
            placeholder={T.zgodnoscKrzywaPlaceholder}
            komunikatBledu={bladKatalogu ?? undefined}
            pomoc={T.zgodnoscPfPomoc}
            testid={`${testid}-pf`}
          />
        </>
      ) : null}
      <PanelTeorii
        tytul={T.teoriaZgodnoscTytul}
        opis={T.teoriaZgodnoscOpis}
        wymog={T.teoriaZgodnoscWymog}
        podstawa={T.teoriaZgodnoscPodstawa}
        testid={`${testid}-teoria`}
      />
    </KreatorSekcja>
  );
}
