/**
 * D2 (RECENZJA_DER_SN_DOBORY_2026-07): krok DOBORU toru DER-SN w kreatorze źródła OZE.
 *
 * Pokazuje PROPOZYCJĘ systemu (TR blokowy, kabel SN, aparat pola SN) z backendu
 * (`/api/solver/der-selection-preview`) i pozwala ją zastosować jednym kliknięciem
 * (payload z propozycji). ZERO fizyki/doboru w UI — wszystkie wartości liczbowe i ślad
 * WHITE BOX pochodzą z solverów pomocniczych backendu. Odstępstwo od propozycji daje
 * ostrzeżenie; twarde walidacje D1 bronią przed niemożliwym po stronie backendu.
 */

import { useCallback, useState } from 'react';

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
  fetchDerSelectionPreview,
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
  onZastosuj,
  applied,
  testid = 'mvd-kreator-oze-dobor',
}: DoborToruSnProps) {
  const [rezerwaTr, setRezerwaTr] = useState<number | null>(0.1);
  const [rezerwaKabel, setRezerwaKabel] = useState<number | null>(0.1);
  const [maxDeltaU, setMaxDeltaU] = useState<number | null>(2.0);
  // V12K-203: przypadek pracy toru sprawdzany w doborze. cos φ = 1 odtwarza dawne
  // zachowanie co do bitu (backend bez cos φ liczy S = ΣP), a charakter Q jest wtedy
  // bez znaczenia fizycznego — kreator mówi to wprost zamiast udawać wybór.
  const [cosPhi, setCosPhi] = useState<number | null>(1.0);
  const [charakterQ, setCharakterQ] = useState<ReactiveCharacter>('inductive');
  const [response, setResponse] = useState<DerSelectionPreviewResponse | null>(null);
  const [ladowanie, setLadowanie] = useState(false);
  const [blad, setBlad] = useState<string | null>(null);

  const cableLength = derSn.mv_cable_length_km;
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
        transformerReservePu: rezerwaTr ?? undefined,
        cableReservePu: rezerwaKabel ?? undefined,
        maxDeltaUPct: maxDeltaU ?? undefined,
        reactiveCharacter: charakterQ,
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
    rezerwaTr,
    rezerwaKabel,
    maxDeltaU,
    charakterQ,
  ]);

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
      <KreatorSiatka kolumny={3}>
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
                <RzadWartosci etykieta="Obciążalność Iz" wartosc={`${kabel.rated_current_a} A`} />
                <RzadWartosci
                  etykieta={T.doborProgKabel}
                  wartosc={
                    response.cable
                      ? `${response.cable.required_ampacity_a.toFixed(1)} A`
                      : '—'
                  }
                />
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
