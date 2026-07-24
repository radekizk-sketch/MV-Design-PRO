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
  RzadWartosci,
} from '../rama';
import {
  fetchDerSelectionPreview,
  type DerSelectionPreviewResponse,
} from './derSelectionApi';
import { OZE_STRINGS as T } from './strings';
import type { DerSnFormData } from './zrodloOzeModel';
import {
  komunikatyBledow,
  odstepstwaPropozycji,
  propozycjaKompletna,
  zbudujZapytanieDoboru,
} from './zrodloOzeDobor';

export interface DoborToruSnProps {
  converter: ConverterType | null;
  quantity: number;
  snBusVoltageKv: number | null;
  derSn: DerSnFormData;
  onCableLengthChange: (value: number | null) => void;
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
  onZastosuj,
  applied,
  testid = 'mvd-kreator-oze-dobor',
}: DoborToruSnProps) {
  const [rezerwaTr, setRezerwaTr] = useState<number | null>(0.1);
  const [rezerwaKabel, setRezerwaKabel] = useState<number | null>(0.1);
  const [maxDeltaU, setMaxDeltaU] = useState<number | null>(2.0);
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
        transformerReservePu: rezerwaTr ?? undefined,
        cableReservePu: rezerwaKabel ?? undefined,
        maxDeltaUPct: maxDeltaU ?? undefined,
      });
      const wynik = await fetchDerSelectionPreview(request);
      setResponse(wynik);
    } catch (e) {
      setResponse(null);
      setBlad(e instanceof Error ? e.message : 'Dobór toru niedostępny.');
    } finally {
      setLadowanie(false);
    }
  }, [converter, snBusVoltageKv, cableLength, quantity, rezerwaTr, rezerwaKabel, maxDeltaU]);

  const tr = response?.transformer.proposal ?? null;
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
              <RzadWartosci
                etykieta="Grupa połączeń"
                wartosc={tr.vector_group ?? '—'}
              />
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
            <KreatorSiatka kolumny={2}>
              <RzadWartosci etykieta={T.doborPropKabel} wartosc={`${kabel.name}`} />
              <RzadWartosci etykieta="ΔU" wartosc={`${kabel.delta_u_pct.toFixed(2)} %`} />
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
