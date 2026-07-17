/*
 * EkranLom — okno „Praca wyspowa" (ochrona LoM, karta U4 P46 / strumień OZE).
 * Odczytuje case_id z AKTYWNEGO przypadku (store study-cases) i pobiera ocenę
 * `GET /api/oze-analysis/lom-protection?case_id=` → prezentacja na wspólnym wzorcu
 * ekranu analizy (`EkranAnalizy`/`TabelaWynikow`):
 *   1. tabela pól przyłączeniowych (wiersz = pole, status kolorem tokenów --mvd-*),
 *   2. rozwinięcie wiersza → porównania (checks) z oknami normatywnymi i źródłami,
 *   3. chipy podsumowania (OK/INFO/WARN/ERROR), moduły bez pola (uczciwie), założenia,
 *   4. źródła normatywne funkcji LoM.
 *
 * Zero fizyki, zero ocen lokalnych — statusy, okna i werdykty pochodzą WYŁĄCZNIE
 * z backendu. Bez aktywnego przypadku → uczciwy stan pusty (bez wołań API).
 * Identyfikatory (pole, hasze) wyłącznie w trybie eksperckim.
 */

import { useEffect, useMemo, useState } from 'react';
import './lom.css';
import type { AdvancementMode } from '../../shell/modeModel';
import { useActiveCase } from '../../../ui/study-cases/store';
import { EkranAnalizy } from '../../wyniki/wzorzec';
import { pobierzOchronaLom, type PoleLom, type WidokOchronyLom } from '../api';
import { KLUCZ_WIERSZA_LOM, KOLUMNY_LOM, naWierszeLom, naZalozeniaLom } from './lomModel';
import {
  LOM_STRINGS,
  fmtNastawaLom,
  fmtOknoLom,
  istotnoscLom,
  statusLomPL,
  type IstotnoscTaguLom,
} from './strings';

type StanZasobu = 'brakPrzypadku' | 'ladowanie' | 'blad' | 'gotowe';

// ---------------------------------------------------------------------------
// Elementy wspólne (tag statusu, chip, panel stanu)
// ---------------------------------------------------------------------------

function TagStatusu({ tekst, istotnosc }: { tekst: string; istotnosc: IstotnoscTaguLom }) {
  return (
    <span className={`mvd-lom-tag mvd-lom-tag--${istotnosc}`} data-testid="mvd-lom-tag">
      {tekst}
    </span>
  );
}

function Chip({
  etykieta,
  wartosc,
  istotnosc,
}: {
  etykieta: string;
  wartosc: number;
  istotnosc: IstotnoscTaguLom;
}) {
  return (
    <div className={`mvd-lom-chip mvd-lom-chip--${istotnosc}`} data-testid="mvd-lom-chip">
      <span className="mvd-lom-chip-liczba mvd-num">{wartosc}</span>
      <span className="mvd-lom-chip-etykieta">{etykieta}</span>
    </div>
  );
}

function StanPanel({
  komunikat,
  opis,
  wariant,
  testid,
}: {
  komunikat: string;
  opis?: string;
  wariant: 'info' | 'blad';
  testid: string;
}) {
  return (
    <div
      className={wariant === 'blad' ? 'mvd-lom-stan mvd-lom-stan--blad' : 'mvd-lom-stan'}
      data-testid={testid}
    >
      <p className="mvd-lom-stan-title">{komunikat}</p>
      {opis && <p className="mvd-lom-stan-desc">{opis}</p>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Szczegół pola — porównania (checks) + moduły wytwórcze
// ---------------------------------------------------------------------------

function SzczegolPola({ pole }: { pole: PoleLom | null }) {
  if (!pole) {
    return (
      <section
        className="mvd-lom-szczegol mvd-lom-szczegol--pusty"
        data-testid="mvd-lom-szczegol-pusty"
      >
        <p className="mvd-lom-szczegol-brak">{LOM_STRINGS.szczegolBrakWyboru}</p>
      </section>
    );
  }
  return (
    <section className="mvd-lom-szczegol" data-testid="mvd-lom-szczegol">
      <header className="mvd-lom-szczegol-head">
        <h3 className="mvd-lom-szczegol-tytul">{pole.bay_name}</h3>
        <TagStatusu tekst={statusLomPL(pole.status)} istotnosc={istotnoscLom(pole.status)} />
      </header>

      <p className="mvd-lom-szczegol-sekcja-tytul">{LOM_STRINGS.szczegolPorownania}</p>
      <ul className="mvd-lom-checks" data-testid="mvd-lom-checks">
        {pole.checks.map((check, i) => (
          <li key={`${check.kind}-${check.function_ansi ?? 'brak'}-${i}`} className="mvd-lom-check">
            <div className="mvd-lom-check-head">
              <span className="mvd-lom-check-tytul">
                {check.function_label_pl ?? LOM_STRINGS.kreska}
              </span>
              <TagStatusu
                tekst={statusLomPL(check.severity)}
                istotnosc={istotnoscLom(check.severity)}
              />
            </div>
            <dl className="mvd-lom-check-dane">
              <div className="mvd-lom-check-para">
                <dt>{LOM_STRINGS.checkNastawa}</dt>
                <dd className="mvd-num">{fmtNastawaLom(check.value, check.unit)}</dd>
              </div>
              <div className="mvd-lom-check-para">
                <dt>{LOM_STRINGS.checkOkno}</dt>
                <dd>{fmtOknoLom(check.window)}</dd>
              </div>
              <div className="mvd-lom-check-para">
                <dt>{LOM_STRINGS.checkZrodlo}</dt>
                <dd>{check.source_pl ?? LOM_STRINGS.kreska}</dd>
              </div>
            </dl>
            <p className="mvd-lom-check-msg">{check.message_pl}</p>
          </li>
        ))}
      </ul>

      <p className="mvd-lom-szczegol-sekcja-tytul">{LOM_STRINGS.szczegolModuly}</p>
      {pole.generating_module_refs.length === 0 ? (
        <p className="mvd-lom-szczegol-brak">{LOM_STRINGS.szczegolBrakModulow}</p>
      ) : (
        <ul className="mvd-lom-moduly">
          {pole.generating_module_refs.map((ref) => (
            <li key={ref} className="mvd-num">
              {ref}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Wynik: tabela pól + chipy + szczegół + moduły bez pola + źródła + założenia
// ---------------------------------------------------------------------------

function WynikLom({
  dane,
  trybZaawansowania,
}: {
  dane: WidokOchronyLom;
  trybZaawansowania: AdvancementMode;
}) {
  const trybEkspercki = trybZaawansowania === 'expert';
  const [wybrany, setWybrany] = useState<string | null>(null);

  const wierszeSelektora = useMemo(
    () => new Map<string, PoleLom>(dane.fields.map((pole) => [pole.bay_ref, pole])),
    [dane.fields],
  );
  const wybranePole = wybrany ? wierszeSelektora.get(wybrany) ?? null : null;

  const { by_status } = dane.summary;

  if (dane.fields.length === 0 && dane.modules_without_field.length === 0) {
    return (
      <StanPanel
        komunikat={LOM_STRINGS.brakPol}
        opis={LOM_STRINGS.brakPolOpis}
        wariant="info"
        testid="mvd-lom-brak-pol"
      />
    );
  }

  return (
    <div data-testid="mvd-lom-wynik">
      <EkranAnalizy
        naglowek={{ analizaPL: LOM_STRINGS.tytul }}
        zalozenia={naZalozeniaLom(dane.zalozenia_pl)}
        kolumny={KOLUMNY_LOM}
        wiersze={naWierszeLom(dane.fields)}
        onOtworzDowod={() => undefined}
        trybZaawansowania={trybZaawansowania}
        kluczWiersza={KLUCZ_WIERSZA_LOM}
        onWybierzWiersz={setWybrany}
        wybranyWiersz={wybrany}
      />

      <div className="mvd-lom-podsumowanie" data-testid="mvd-lom-podsumowanie">
        <Chip etykieta={LOM_STRINGS.podsumOk} wartosc={by_status.OK} istotnosc="ok" />
        <Chip etykieta={LOM_STRINGS.podsumInfo} wartosc={by_status.INFO} istotnosc="neutral" />
        <Chip etykieta={LOM_STRINGS.podsumWarn} wartosc={by_status.WARN} istotnosc="warn" />
        <Chip etykieta={LOM_STRINGS.podsumError} wartosc={by_status.ERROR} istotnosc="err" />
      </div>

      <SzczegolPola pole={wybranePole} />

      {dane.modules_without_field.length > 0 && (
        <section className="mvd-lom-bez-pola" data-testid="mvd-lom-bez-pola">
          <h3 className="mvd-lom-bez-pola-tytul">{LOM_STRINGS.bezPolaTytul}</h3>
          <p className="mvd-lom-bez-pola-opis">{LOM_STRINGS.bezPolaOpis}</p>
          <ul className="mvd-lom-moduly">
            {dane.modules_without_field.map((ref) => (
              <li key={ref} className="mvd-num">
                {ref}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="mvd-lom-zrodla" data-testid="mvd-lom-zrodla">
        <h3 className="mvd-lom-zrodla-tytul">{LOM_STRINGS.zrodlaTytul}</h3>
        <dl className="mvd-lom-zrodla-lista">
          {Object.entries(dane.normative_sources).map(([klucz, zrodlo]) => (
            <div key={klucz} className="mvd-lom-zrodlo">
              <dt className="mvd-lom-zrodlo-okno">{zrodlo.window_pl ?? LOM_STRINGS.zrodlaBrakOkna}</dt>
              <dd className="mvd-lom-zrodlo-cytat">{zrodlo.source_pl ?? LOM_STRINGS.kreska}</dd>
            </div>
          ))}
        </dl>
      </section>

      {trybEkspercki && (
        <dl className="mvd-lom-eksp" data-testid="mvd-lom-eksp">
          <div className="mvd-lom-eksp-para">
            <dt>{LOM_STRINGS.ekspHash}</dt>
            <dd className="mvd-num">{dane.input_hash}</dd>
          </div>
          <div className="mvd-lom-eksp-para">
            <dt>{LOM_STRINGS.ekspEnmHash}</dt>
            <dd className="mvd-num">{dane.context.enm_hash}</dd>
          </div>
        </dl>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Okno „Praca wyspowa"
// ---------------------------------------------------------------------------

export interface EkranLomProps {
  trybZaawansowania: AdvancementMode;
}

export function EkranLom({ trybZaawansowania }: EkranLomProps) {
  const aktywnyPrzypadek = useActiveCase();
  const caseId = aktywnyPrzypadek?.id ?? null;

  const [stan, setStan] = useState<StanZasobu>(caseId ? 'ladowanie' : 'brakPrzypadku');
  const [dane, setDane] = useState<WidokOchronyLom | null>(null);
  const [komunikatBledu, setKomunikatBledu] = useState('');

  useEffect(() => {
    if (!caseId) {
      setStan('brakPrzypadku');
      setDane(null);
      return;
    }
    let anulowane = false;
    setStan('ladowanie');
    setDane(null);
    pobierzOchronaLom(caseId)
      .then((wynik) => {
        if (anulowane) return;
        setDane(wynik);
        setStan('gotowe');
      })
      .catch((err: unknown) => {
        if (anulowane) return;
        setKomunikatBledu(err instanceof Error ? err.message : 'Nieznany błąd pobierania');
        setStan('blad');
      });
    return () => {
      anulowane = true;
    };
  }, [caseId]);

  return (
    <div className="mvd-lom" data-testid="mvd-lom-ekran">
      <header className="mvd-lom-naglowek">
        <h2 className="mvd-lom-tytul">{LOM_STRINGS.tytul}</h2>
        <p className="mvd-lom-opis">{LOM_STRINGS.opisWstep}</p>
      </header>

      {stan === 'brakPrzypadku' ? (
        <StanPanel
          komunikat={LOM_STRINGS.brakPrzypadku}
          opis={LOM_STRINGS.brakPrzypadkuOpis}
          wariant="info"
          testid="mvd-lom-brak-przypadku"
        />
      ) : stan === 'ladowanie' ? (
        <StanPanel komunikat={LOM_STRINGS.ladowanie} wariant="info" testid="mvd-lom-ladowanie" />
      ) : stan === 'blad' || dane === null ? (
        <StanPanel
          komunikat={LOM_STRINGS.blad}
          opis={komunikatBledu}
          wariant="blad"
          testid="mvd-lom-blad"
        />
      ) : (
        <WynikLom dane={dane} trybZaawansowania={trybZaawansowania} />
      )}
    </div>
  );
}
