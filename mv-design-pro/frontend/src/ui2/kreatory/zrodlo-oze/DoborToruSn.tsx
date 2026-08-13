/**
 * D2 (RECENZJA_DER_SN_DOBORY_2026-07): krok DOBORU toru DER-SN w kreatorze źródła OZE.
 *
 * Pokazuje PROPOZYCJĘ systemu (TR blokowy, kabel SN, aparat pola SN) z backendu
 * (`/api/solver/der-selection-preview`) i pozwala ją zastosować jednym kliknięciem
 * (payload z propozycji). ZERO fizyki/doboru w UI — wszystkie wartości liczbowe i ślad
 * WHITE BOX pochodzą z solverów pomocniczych backendu. Odstępstwo od propozycji daje
 * ostrzeżenie; twarde walidacje D1 bronią przed niemożliwym po stronie backendu.
 */

import { useCallback, useEffect, useState } from 'react';

import type { ConverterType } from '../../../ui/catalog/types';
import {
  KreatorInfo,
  KreatorSiatka,
  PanelTeorii,
  PoleLiczbowe,
  PoleWyboru,
  RzadWartosci,
} from '../rama';
import {
  fetchCableLayingConditions,
  fetchDerSelectionPreview,
  type CableLayingConditions,
  type CableLayingConditionsCatalog,
  type DerSelectionPreviewResponse,
  type ReactiveCharacter,
} from './derSelectionApi';
import { OZE_STRINGS as T } from './strings';
import type { DerSnFormData } from './zrodloOzeModel';
import {
  charakterQMaZnaczenie,
  komunikatyBledow,
  odstepstwaPropozycji,
  propozycjaKompletna,
  zbudujZapytanieDoboru,
} from './zrodloOzeDobor';

/** Charakter mocy biernej falownika — opcje mapują 1:1 na pole backendu. */
const OPCJE_CHARAKTER_Q: ReadonlyArray<{ id: ReactiveCharacter; etykieta: string }> = [
  { id: 'inductive', etykieta: T.doborCharakterQPobor },
  { id: 'capacitive', etykieta: T.doborCharakterQOddawanie },
];

export interface DoborToruSnProps {
  converter: ConverterType | null;
  quantity: number;
  snBusVoltageKv: number | null;
  derSn: DerSnFormData;
  onCableLengthChange: (value: number | null) => void;
  onVectorGroupChange: (value: string) => void;
  /** V12K-207: wybór warunków ułożenia kabla — jedzie do modelu razem z torem. */
  onLayingConditionsChange: (value: CableLayingConditions | null) => void;
  onZastosuj: (response: DerSelectionPreviewResponse) => void;
  applied: boolean;
  testid?: string;
}

export function DoborToruSn({
  converter,
  quantity,
  snBusVoltageKv,
  derSn,
  onCableLengthChange,
  onVectorGroupChange,
  onLayingConditionsChange,
  onZastosuj,
  applied,
  testid = 'mvd-kreator-oze-dobor',
}: DoborToruSnProps) {
  const [rezerwaTr, setRezerwaTr] = useState<number | null>(0.1);
  const [rezerwaKabel, setRezerwaKabel] = useState<number | null>(0.1);
  const [maxDeltaU, setMaxDeltaU] = useState<number | null>(2.0);
  // K9-A O8/O9/O11: pełne parametry progu doboru — jednoczesność k_j, obciążalność TR
  // i rezerwa prądowa aparatu pola (wszystkie konsumowane przez końcówkę doboru).
  const [jednoczesnosc, setJednoczesnosc] = useState<number | null>(null);
  const [obciazalnoscTr, setObciazalnoscTr] = useState<number | null>(null);
  const [rezerwaPole, setRezerwaPole] = useState<number | null>(0.1);
  // V12K-203: przypadek pracy toru sprawdzany w doborze. cos φ = 1 odtwarza dawne
  // zachowanie co do bitu (backend bez cos φ liczy S = ΣP), a charakter Q jest wtedy
  // bez znaczenia fizycznego — kreator mówi to wprost zamiast udawać wybór.
  const [cosPhi, setCosPhi] = useState<number | null>(1.0);
  const [charakterQ, setCharakterQ] = useState<ReactiveCharacter>('inductive');
  const [response, setResponse] = useState<DerSelectionPreviewResponse | null>(null);
  const [ladowanie, setLadowanie] = useState(false);
  const [blad, setBlad] = useState<string | null>(null);
  // V12K-207: lista warunków ułożenia POCHODZI Z BACKENDU (współczynniki to dane
  // doborowe o udokumentowanej podstawie, nie tekst interfejsu).
  const [warunkiKatalog, setWarunkiKatalog] = useState<CableLayingConditionsCatalog | null>(null);
  const [warunkiBlad, setWarunkiBlad] = useState(false);

  useEffect(() => {
    const abort = new AbortController();
    fetchCableLayingConditions({ signal: abort.signal })
      .then((katalog) => setWarunkiKatalog(katalog))
      .catch(() => {
        if (!abort.signal.aborted) setWarunkiBlad(true);
      });
    return () => abort.abort();
  }, []);

  const cableLength = derSn.mv_cable_length_km;
  const wybraneWarunki = derSn.mv_cable_laying_conditions;
  const gotoweWejscie =
    Boolean(converter) &&
    snBusVoltageKv != null &&
    snBusVoltageKv > 0 &&
    cableLength != null &&
    cableLength > 0;

  const onZaproponuj = useCallback(async () => {
    if (!converter || snBusVoltageKv == null || cableLength == null) return;
    setLadowanie(true);
    setBlad(null);
    try {
      const request = zbudujZapytanieDoboru(converter, quantity, snBusVoltageKv, {
        cableLengthKm: cableLength,
        cosPhi,
        simultaneityFactor: jednoczesnosc ?? undefined,
        loadabilityPu: obciazalnoscTr ?? undefined,
        transformerReservePu: rezerwaTr ?? undefined,
        cableReservePu: rezerwaKabel ?? undefined,
        fieldReservePu: rezerwaPole ?? undefined,
        maxDeltaUPct: maxDeltaU ?? undefined,
        reactiveCharacter: charakterQ,
        layingConditions: wybraneWarunki,
      });
      const wynik = await fetchDerSelectionPreview(request);
      setResponse(wynik);
    } catch (e) {
      setResponse(null);
      setBlad(e instanceof Error ? e.message : 'Dobór toru niedostępny.');
    } finally {
      setLadowanie(false);
    }
  }, [
    converter,
    snBusVoltageKv,
    cableLength,
    quantity,
    cosPhi,
    jednoczesnosc,
    obciazalnoscTr,
    rezerwaTr,
    rezerwaKabel,
    rezerwaPole,
    maxDeltaU,
    charakterQ,
    wybraneWarunki,
  ]);

  const zmienWarunki = useCallback(
    (nazwa: string) => {
      // Warunki katalogowe = brak korekty: wtedy pole nie jedzie do modelu w ogóle
      // (tor pozostaje bit-identyczny z dotychczasowym).
      const domyslna = warunkiKatalog?.default_name ?? 'warunki_katalogowe';
      onLayingConditionsChange(nazwa === domyslna ? null : { set_name: nazwa });
    },
    [onLayingConditionsChange, warunkiKatalog],
  );

  const tr = response?.transformer.proposal ?? null;
  const grupyKatalogu = response?.transformer.available_vector_groups ?? [];
  const wybranaGrupa = derSn.block_transformer_vector_group ?? tr?.vector_group ?? '';
  const kabel = response?.cable?.proposal ?? null;
  const pole = response?.field_apparatus?.proposal ?? null;
  const bledyBackendu = response ? komunikatyBledow(response) : [];
  const odstepstwa = response ? odstepstwaPropozycji(derSn, response) : [];
  const moznaZastosowac = response != null && propozycjaKompletna(response);

  return (
    <>
      <KreatorInfo>{T.doborPomoc}</KreatorInfo>

      {!converter ? <KreatorInfo>{T.doborBrakFalownika}</KreatorInfo> : null}
      {snBusVoltageKv == null ? <KreatorInfo>{T.doborBrakKontekstu}</KreatorInfo> : null}

      <KreatorSiatka kolumny={2}>
        <RzadWartosci
          etykieta={T.doborNapiecieSn}
          wartosc={snBusVoltageKv != null ? `${snBusVoltageKv} kV` : '—'}
        />
        <PoleLiczbowe
          etykieta={T.doborDlugoscKabla}
          jednostka="km"
          wartosc={cableLength}
          onZmiana={onCableLengthChange}
          krok={0.1}
          min={0}
          pomoc={T.doborDlugoscKablaPomoc}
          testid={`${testid}-dlugosc`}
        />
      </KreatorSiatka>
      <KreatorSiatka kolumny={2}>
        <PoleLiczbowe
          etykieta={T.doborCosPhi}
          wartosc={cosPhi}
          onZmiana={setCosPhi}
          krok={0.01}
          min={0}
          max={1}
          pomoc={T.doborCosPhiPomoc}
          testid={`${testid}-cos-phi`}
        />
        <PoleWyboru
          etykieta={T.doborCharakterQ}
          wartosc={charakterQ}
          onZmiana={(v) => setCharakterQ(v as ReactiveCharacter)}
          opcje={OPCJE_CHARAKTER_Q}
          pomoc={T.doborCharakterQPomoc}
          wylaczone={!charakterQMaZnaczenie(cosPhi)}
          testid={`${testid}-charakter-q`}
        />
      </KreatorSiatka>
      {!charakterQMaZnaczenie(cosPhi) ? (
        <KreatorInfo>{T.doborCharakterQBezZnaczenia}</KreatorInfo>
      ) : null}
      {warunkiKatalog ? (
        <KreatorSiatka kolumny={1}>
          <PoleWyboru
            etykieta={T.doborWarunkiUlozenia}
            wartosc={wybraneWarunki?.set_name ?? warunkiKatalog.default_name}
            onZmiana={zmienWarunki}
            opcje={warunkiKatalog.sets.map((zestaw) => ({
              id: zestaw.name,
              etykieta: zestaw.label_pl,
            }))}
            pomoc={`${T.doborWarunkiUlozeniaPomoc} ${warunkiKatalog.limitation_pl}`}
            testid={`${testid}-warunki-ulozenia`}
          />
        </KreatorSiatka>
      ) : null}
      {warunkiBlad ? <KreatorInfo>{T.doborWarunkiUlozeniaNiedostepne}</KreatorInfo> : null}
      <KreatorSiatka kolumny={3}>
        <PoleLiczbowe
          etykieta={T.doborJednoczesnosc}
          wartosc={jednoczesnosc}
          onZmiana={setJednoczesnosc}
          krok={0.05}
          min={0}
          max={1}
          placeholder="1,0"
          pomoc={T.doborJednoczesnoscPomoc}
          testid={`${testid}-jednoczesnosc`}
        />
        <PoleLiczbowe
          etykieta={T.doborObciazalnoscTr}
          jednostka="pu"
          wartosc={obciazalnoscTr}
          onZmiana={setObciazalnoscTr}
          krok={0.05}
          min={0}
          placeholder="1,0"
          pomoc={T.doborObciazalnoscTrPomoc}
          testid={`${testid}-obciazalnosc-tr`}
        />
        <PoleLiczbowe
          etykieta={T.doborRezerwaTr}
          jednostka="pu"
          wartosc={rezerwaTr}
          onZmiana={setRezerwaTr}
          krok={0.05}
          min={0}
          pomoc={T.doborRezerwaTrPomoc}
          testid={`${testid}-rezerwa-tr`}
        />
      </KreatorSiatka>
      <KreatorSiatka kolumny={3}>
        <PoleLiczbowe
          etykieta={T.doborRezerwaKabel}
          jednostka="pu"
          wartosc={rezerwaKabel}
          onZmiana={setRezerwaKabel}
          krok={0.05}
          min={0}
          pomoc={T.doborRezerwaKabelPomoc}
          testid={`${testid}-rezerwa-kabel`}
        />
        <PoleLiczbowe
          etykieta={T.doborRezerwaPole}
          jednostka="pu"
          wartosc={rezerwaPole}
          onZmiana={setRezerwaPole}
          krok={0.05}
          min={0}
          pomoc={T.doborRezerwaPolePomoc}
          testid={`${testid}-rezerwa-pole`}
        />
        <PoleLiczbowe
          etykieta={T.doborMaxDeltaU}
          jednostka="%"
          wartosc={maxDeltaU}
          onZmiana={setMaxDeltaU}
          krok={0.5}
          min={0}
          pomoc={T.doborMaxDeltaUPomoc}
          testid={`${testid}-max-delta-u`}
        />
      </KreatorSiatka>

      <button
        type="button"
        className="mvd-kreator-btn"
        onClick={onZaproponuj}
        disabled={!gotoweWejscie || ladowanie}
        data-testid={`${testid}-zaproponuj`}
      >
        {ladowanie ? T.doborPobieranie : T.doborZaproponuj}
      </button>

      {blad ? <p className="mvd-pole-blad">{blad}</p> : null}

      {response ? (
        <div data-testid={`${testid}-propozycje`}>
          {tr ? (
            <KreatorSiatka kolumny={2}>
              <RzadWartosci etykieta={T.doborPropTr} wartosc={`${tr.name}`} />
              <RzadWartosci etykieta={T.paramMoc} wartosc={`${tr.sn_mva} MVA`} />
              <RzadWartosci
                etykieta={T.doborProgTr}
                wartosc={`${response.transformer.required_apparent_power_mva.toFixed(3)} MVA`}
              />
              {/* K9-A O8: uk% WYŁĄCZNIE jako odczyt typu katalogowego — wartość rządzi
                  katalog (materializacja nadpisuje wartość z żądania), więc kontrolka
                  edycji byłaby pozorna. */}
              <RzadWartosci
                etykieta={T.doborUkTr}
                wartosc={tr.uk_percent != null ? `${tr.uk_percent} %` : '—'}
              />
              {grupyKatalogu.length > 0 ? (
                <PoleWyboru
                  etykieta="Układ połączeń"
                  wartosc={wybranaGrupa}
                  onZmiana={onVectorGroupChange}
                  opcje={grupyKatalogu.map((g) => ({ id: g, etykieta: g }))}
                  pomoc="Parametr modelu (zwarcie, przesunięcie faz, składowa zerowa, zabezpieczenia). Lista z realnych typów katalogu; wybór inny niż typ TR odrzuci backend."
                  testid={`${testid}-grupa`}
                />
              ) : (
                <RzadWartosci etykieta="Układ połączeń" wartosc={tr.vector_group ?? '—'} />
              )}
            </KreatorSiatka>
          ) : null}
          {tr ? (
            <KreatorInfo>{T.doborOdrzucono(response.transformer.rejected.length)}</KreatorInfo>
          ) : null}
          {response.transformer_current_a != null ? (
            <RzadWartosci
              etykieta={T.doborPradTr}
              wartosc={`${response.transformer_current_a.toFixed(1)} A`}
            />
          ) : null}
          {kabel ? (
            <>
              <KreatorSiatka kolumny={2}>
                <RzadWartosci etykieta={T.doborPropKabel} wartosc={`${kabel.name}`} />
                {/* Nazwa wielkości z backendu (is_voltage_rise), wartość jako MODUŁ zmiany —
                    „−1,20 %" bez nazwy czytało się jak spadek, a przy generacji to wzrost. */}
                <RzadWartosci
                  etykieta={T.doborZmianaNapiecia(kabel.is_voltage_rise === true)}
                  wartosc={`${Math.abs(kabel.delta_u_pct).toFixed(2)} %`}
                />
                <RzadWartosci
                  etykieta={T.doborObciazalnoscKatalogowa}
                  wartosc={`${kabel.rated_current_a} A`}
                />
                <RzadWartosci
                  etykieta={T.doborProgKabel}
                  wartosc={
                    response.cable
                      ? `${response.cable.required_ampacity_a.toFixed(1)} A`
                      : '—'
                  }
                />
                {/* V12K-207: obciążalność po korekcie warunków ułożenia POKAZUJEMY OBOK
                    katalogowej i tylko wtedy, gdy korekta faktycznie działa — projektant
                    musi widzieć, ile zabrała. Obie liczby liczy backend. */}
                {kabel.derating_total != null && kabel.derating_total !== 1 ? (
                  <RzadWartosci
                    etykieta={T.doborObciazalnoscSkorygowana}
                    wartosc={
                      kabel.effective_ampacity_a != null
                        ? `${kabel.effective_ampacity_a.toFixed(1)} A `
                          + `(× ${kabel.derating_total.toFixed(4)})`
                        : '—'
                    }
                  />
                ) : null}
              </KreatorSiatka>
              {kabel.is_voltage_rise === true ? (
                <KreatorInfo>{T.doborWzrostInfo}</KreatorInfo>
              ) : null}
            </>
          ) : null}
          {pole ? (
            <KreatorSiatka kolumny={2}>
              <RzadWartosci etykieta={T.doborPropPole} wartosc={`${pole.name}`} />
              <RzadWartosci etykieta="Prąd znamionowy In" wartosc={`${pole.in_a} A`} />
              <RzadWartosci
                etykieta={T.doborProgPole}
                wartosc={
                  response.field_apparatus
                    ? `${response.field_apparatus.required_current_a.toFixed(1)} A`
                    : '—'
                }
              />
            </KreatorSiatka>
          ) : null}

          {/* V12K-207: JAWNE założenie obciążalności — także gdy nie ma propozycji.
              Bez tego projektant nie wie, że zamiast szukać grubszego kabla może
              poprawić warunki ułożenia trasy. Treść w całości z backendu. */}
          {response.cable?.derating_assumption_pl ? (
            <RzadWartosci
              etykieta={T.doborZalozenieObciazalnosci}
              wartosc={response.cable.derating_assumption_pl}
            />
          ) : null}

          {bledyBackendu.map((msg) => (
            <p className="mvd-pole-blad" key={msg}>
              {msg}
            </p>
          ))}
          {odstepstwa.map((msg) => (
            <KreatorInfo key={msg}>{msg}</KreatorInfo>
          ))}

          <button
            type="button"
            className="mvd-kreator-btn mvd-kreator-btn--glowna"
            onClick={() => response && onZastosuj(response)}
            disabled={!moznaZastosowac}
            data-testid={`${testid}-zastosuj`}
          >
            {T.doborZastosuj}
          </button>
          {applied ? <KreatorInfo>{T.doborZastosowano}</KreatorInfo> : null}
        </div>
      ) : null}

      <PanelTeorii
        tytul={T.teoriaDoborTytul}
        opis={T.teoriaDoborOpis}
        wymog={T.teoriaDoborWymog}
        podstawa={T.teoriaDoborPodstawa}
        testid={`${testid}-teoria`}
      />
    </>
  );
}
