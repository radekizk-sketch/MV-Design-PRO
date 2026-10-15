/*
 * Sekcja „Modele dynamiczne źródeł" ekranu dynamiki (karta AB-P1 §0.3) — cel akcji
 * naprawczej kanonu `der.dynamika_missing` (nawigacja `{tab: 'dynamika', focus:
 * 'dynamic_model_ref'}`). Dla każdego wytwórcy: stan modelu dynamicznego z backendu
 * (`application/dynamika/gotowosc.py`), pochodzenie parametrów, powód odmowy i wybór
 * profilu katalogowego ZGODNEGO z rodzajem wytwórcy (lista z backendu).
 *
 * Wiązanie idzie kanoniczną operacją domenową `set_der_catalog_bindings` przez magazyn
 * migawki — backend materializuje z profilu kopię `Generator.dynamika` (jedna funkcja
 * `enm.dynamika_z_katalogu.materializuj_dynamike`). Brak ręcznego edytora parametrów:
 * interfejs nie tworzy ani nie zmienia żadnej liczby modelu.
 *
 * Karta modeli odbiorów: w TEJ SAMEJ sekcji — modele dynamiczne odbiorów (cel akcji
 * naprawczej `load.dynamika_missing`, ta sama nawigacja). Wiązanie operacją
 * `set_load_dynamic_binding`; kopię `Load.dynamika` buduje backend
 * (`materializuj_dynamike_odbioru`). Liczby profilu (napięcie przejścia, stała pomiaru) i ich
 * podstawa pochodzą z odpowiedzi gotowości — interfejs ich nie liczy ani nie zmienia.
 */

import { useState } from 'react';

import { formatGeneratorTypeLabelPl } from '../../../ui/shared/generatorTypeLabels';
import { etykietaZeSlownika } from '../wzorzec/slownikWyliczen';
import { fmtLiczba, type OdbiorDynamiki, type ProfilOdbioru, type ZrodloDynamiki } from './model';
import { DYNAMIKA_STRINGS as T } from './strings';

export interface SekcjaModeliZrodelProps {
  readonly zrodla: readonly ZrodloDynamiki[];
  readonly odbiory: readonly OdbiorDynamiki[];
  readonly profileOdbiorow: readonly ProfilOdbioru[];
  readonly onPowiazOdbior: (loadRef: string, profileId: string | null) => void;
  /** Wytwórca wskazany deep-linkiem akcji naprawczej (fokus wiersza). */
  readonly wskazanyRef: string | null;
  readonly zapisywanyRef: string | null;
  readonly onPowiaz: (generatorRef: string, profileId: string | null) => void;
  readonly onPokazNaSchemacie: (generatorRef: string, nazwa: string) => void;
}

function stanPl(stan: ZrodloDynamiki['stan']): string {
  switch (stan) {
    case 'z_katalogu':
      return T.stanZKatalogu;
    case 'wlasny':
      return T.stanWlasny;
    case 'brak':
      return T.stanBrak;
    case 'odmowa':
      return T.stanOdmowa;
    case 'nieaktualna':
      return T.stanNieaktualna;
  }
}

function stanOdbioruPl(stan: OdbiorDynamiki['stan']): string {
  switch (stan) {
    case 'z_katalogu':
      return T.stanZKatalogu;
    case 'brak':
      return T.stanOdbioruBrak;
    case 'odmowa':
      return T.stanOdmowa;
    case 'nieaktualna':
      return T.stanNieaktualna;
  }
}

function pochodzeniePl(zrodlo: string | null, odniesienie: string | null): string {
  if (!zrodlo) return '—';
  return (
    etykietaZeSlownika(T.zrodloProweniencji, zrodlo) + (odniesienie ? ` — ${odniesienie}` : '')
  );
}

function ParametryOdbioru({ odbior }: { odbior: OdbiorDynamiki }) {
  if (odbior.stan === 'brak' || odbior.stan === 'odmowa') return <>—</>;
  return (
    <ul className="mvd-dynamika-parametry">
      <li>
        {odbior.u_min_pu === null
          ? T.czystaImpedancja
          : `${T.napieciePrzejscia}: ${fmtLiczba(odbior.u_min_pu)} ${T.jednPu}`}
      </li>
      <li>
        {odbior.t_pomiaru_czestotliwosci_s === null
          ? T.bezCzulosci
          : `${T.stalaPomiaru}: ${fmtLiczba(odbior.t_pomiaru_czestotliwosci_s)} ${T.jednS}`}
      </li>
    </ul>
  );
}

function WierszOdbioru({
  odbior,
  profile,
  wskazany,
  zapisywany,
  onPowiaz,
  onPokazNaSchemacie,
}: {
  odbior: OdbiorDynamiki;
  profile: readonly ProfilOdbioru[];
  wskazany: boolean;
  zapisywany: boolean;
  onPowiaz: SekcjaModeliZrodelProps['onPowiazOdbior'];
  onPokazNaSchemacie: SekcjaModeliZrodelProps['onPokazNaSchemacie'];
}) {
  const [wybor, setWybor] = useState<string>(odbior.wiazanie ?? '');
  const profil = profile.find((p) => p.profile_id === wybor) ?? null;
  return (
    <tr
      ref={(wiersz) => {
        // Fokus akcji naprawczej: wiersz wskazanego odbioru w polu widzenia.
        if (wiersz && wskazany) wiersz.scrollIntoView?.({ block: 'center' });
      }}
      data-testid={`mvd-dynamika-odbior-${odbior.ref_id}`}
      data-stan={odbior.stan}
      data-wskazany={wskazany ? 'tak' : undefined}
      className={wskazany ? 'mvd-dynamika-wiersz-wskazany' : undefined}
    >
      <td>
        <button
          type="button"
          className="mvd-dynamika-link"
          onClick={() => onPokazNaSchemacie(odbior.ref_id, odbior.nazwa)}
          title={T.pokazNaSchemacie}
        >
          {odbior.nazwa}
        </button>
      </td>
      <td>
        <span className="mvd-dynamika-stan" data-stan={odbior.stan}>
          {stanOdbioruPl(odbior.stan)}
        </span>
        {odbior.odmowa_komunikat && (
          <div className="mvd-dynamika-powod" data-testid={`mvd-dynamika-odbior-${odbior.ref_id}-odmowa`}>
            {odbior.odmowa_komunikat}
          </div>
        )}
        {odbior.akcja_naprawcza && (
          <div className="mvd-dynamika-powod">{odbior.akcja_naprawcza.komunikat_pl}</div>
        )}
      </td>
      <td>
        <ParametryOdbioru odbior={odbior} />
      </td>
      <td>{pochodzeniePl(odbior.zrodlo_proweniencji, odbior.odniesienie_proweniencji)}</td>
      <td>
        <div className="mvd-dynamika-wiazanie">
          <select
            aria-label={`${T.kolWiazanie}: ${odbior.nazwa}`}
            data-testid={`mvd-dynamika-odbior-${odbior.ref_id}-profil`}
            value={wybor}
            disabled={zapisywany}
            onChange={(e) => setWybor(e.target.value)}
          >
            <option value="">{T.wybierzProfilOdbioru}</option>
            {profile.map((p) => (
              <option key={p.profile_id} value={p.profile_id}>
                {p.nazwa}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="mvd-dynamika-akcja"
            data-testid={`mvd-dynamika-odbior-${odbior.ref_id}-powiaz`}
            disabled={zapisywany || wybor === '' || (wybor === odbior.wiazanie && odbior.stan === 'z_katalogu')}
            onClick={() => onPowiaz(odbior.ref_id, wybor)}
          >
            {zapisywany ? T.powiazanie : T.powiaz}
          </button>
          {odbior.wiazanie !== null && (
            <button
              type="button"
              className="mvd-dynamika-akcja-drugorzedna"
              data-testid={`mvd-dynamika-odbior-${odbior.ref_id}-odwiaz`}
              disabled={zapisywany}
              onClick={() => onPowiaz(odbior.ref_id, null)}
            >
              {T.odwiaz}
            </button>
          )}
        </div>
        {profil && (
          <details className="mvd-dynamika-podstawa" data-testid={`mvd-dynamika-odbior-${odbior.ref_id}-podstawa`}>
            <summary>
              {T.podstawaWartosci} ({T.jakoscSzacowana})
            </summary>
            <p>{profil.opis_pl}</p>
            <p>
              {T.napieciePrzejscia}: {fmtLiczba(profil.u_min_pu)} {T.jednPu} — {profil.podstawa_u_min_pl}
            </p>
            <p>
              {T.stalaPomiaru}: {fmtLiczba(profil.t_pomiaru_czestotliwosci_s)} {T.jednS} —{' '}
              {profil.podstawa_t_pomiaru_pl}
            </p>
            <p>{pochodzeniePl(profil.zrodlo_proweniencji, profil.odniesienie_proweniencji)}</p>
          </details>
        )}
      </td>
    </tr>
  );
}

function WierszZrodla({
  zrodlo,
  wskazany,
  zapisywany,
  onPowiaz,
  onPokazNaSchemacie,
}: {
  zrodlo: ZrodloDynamiki;
  wskazany: boolean;
  zapisywany: boolean;
  onPowiaz: SekcjaModeliZrodelProps['onPowiaz'];
  onPokazNaSchemacie: SekcjaModeliZrodelProps['onPokazNaSchemacie'];
}) {
  const [wybor, setWybor] = useState<string>(zrodlo.wiazanie ?? zrodlo.profil_typu ?? '');
  const wymagaAkcji = zrodlo.akcja_naprawcza !== null;
  const pochodzenie = pochodzeniePl(zrodlo.zrodlo_proweniencji, zrodlo.odniesienie_proweniencji);
  return (
    <tr
      ref={(wiersz) => {
        // Fokus akcji naprawczej: wiersz wskazanego wytwórcy w polu widzenia.
        if (wiersz && wskazany) wiersz.scrollIntoView?.({ block: 'center' });
      }}
      data-testid={`mvd-dynamika-zrodlo-${zrodlo.ref_id}`}
      data-stan={zrodlo.stan}
      data-wskazany={wskazany ? 'tak' : undefined}
      className={wskazany ? 'mvd-dynamika-wiersz-wskazany' : undefined}
    >
      <td>
        <button
          type="button"
          className="mvd-dynamika-link"
          onClick={() => onPokazNaSchemacie(zrodlo.ref_id, zrodlo.nazwa)}
          title={T.pokazNaSchemacie}
        >
          {zrodlo.nazwa}
        </button>
      </td>
      <td>{formatGeneratorTypeLabelPl(zrodlo.gen_type)}</td>
      <td>
        <span className="mvd-dynamika-stan" data-stan={zrodlo.stan}>
          {stanPl(zrodlo.stan)}
        </span>
        {zrodlo.odmowa_komunikat && (
          <div className="mvd-dynamika-powod" data-testid={`mvd-dynamika-zrodlo-${zrodlo.ref_id}-odmowa`}>
            {zrodlo.odmowa_komunikat}
          </div>
        )}
        {wymagaAkcji && zrodlo.akcja_naprawcza && (
          <div className="mvd-dynamika-powod">{zrodlo.akcja_naprawcza.komunikat_pl}</div>
        )}
      </td>
      <td>{pochodzenie}</td>
      <td>
        {zrodlo.profile_zgodne.length === 0 ? (
          <span className="mvd-dynamika-powod">{T.brakProfili}</span>
        ) : (
          <div className="mvd-dynamika-wiazanie">
            <select
              aria-label={`${T.kolWiazanie}: ${zrodlo.nazwa}`}
              data-testid={`mvd-dynamika-zrodlo-${zrodlo.ref_id}-profil`}
              value={wybor}
              disabled={zapisywany}
              onChange={(e) => setWybor(e.target.value)}
            >
              <option value="">{T.wybierzProfil}</option>
              {zrodlo.profile_zgodne.map((p) => (
                <option key={p.profile_id} value={p.profile_id}>
                  {p.nazwa}
                  {p.model_w_rdzeniu ? '' : ` ${T.profilPozaRdzeniem}`}
                </option>
              ))}
            </select>
            <button
              type="button"
              className="mvd-dynamika-akcja"
              data-testid={`mvd-dynamika-zrodlo-${zrodlo.ref_id}-powiaz`}
              disabled={zapisywany || wybor === '' || (wybor === zrodlo.wiazanie && zrodlo.stan === 'z_katalogu')}
              onClick={() => onPowiaz(zrodlo.ref_id, wybor)}
            >
              {zapisywany ? T.powiazanie : T.powiaz}
            </button>
            {zrodlo.wiazanie !== null && (
              <button
                type="button"
                className="mvd-dynamika-akcja-drugorzedna"
                data-testid={`mvd-dynamika-zrodlo-${zrodlo.ref_id}-odwiaz`}
                disabled={zapisywany}
                onClick={() => onPowiaz(zrodlo.ref_id, null)}
              >
                {T.odwiaz}
              </button>
            )}
          </div>
        )}
      </td>
    </tr>
  );
}

export function SekcjaModeliZrodel({
  zrodla,
  odbiory,
  profileOdbiorow,
  onPowiazOdbior,
  wskazanyRef,
  zapisywanyRef,
  onPowiaz,
  onPokazNaSchemacie,
}: SekcjaModeliZrodelProps) {
  return (
    <section className="mvd-dynamika-sekcja" data-testid="mvd-dynamika-zrodla" id="dynamic_model_ref">
      <h4>{T.zrodlaTytul}</h4>
      <p className="mvd-dynamika-opis">{T.zrodlaOpis}</p>
      {zrodla.length === 0 ? (
        <p className="mvd-dynamika-opis">{T.zrodlaBrak}</p>
      ) : (
        <table className="mvd-dynamika-tabela">
          <thead>
            <tr>
              <th>{T.kolZrodlo}</th>
              <th>{T.kolRodzaj}</th>
              <th>{T.kolStan}</th>
              <th>{T.kolPochodzenie}</th>
              <th>{T.kolWiazanie}</th>
            </tr>
          </thead>
          <tbody>
            {zrodla.map((zrodlo) => (
              <WierszZrodla
                key={`${zrodlo.ref_id}|${zrodlo.wiazanie ?? ''}|${zrodlo.stan}`}
                zrodlo={zrodlo}
                wskazany={zrodlo.ref_id === wskazanyRef}
                zapisywany={zrodlo.ref_id === zapisywanyRef}
                onPowiaz={onPowiaz}
                onPokazNaSchemacie={onPokazNaSchemacie}
              />
            ))}
          </tbody>
        </table>
      )}
      <h4>{T.odbioryTytul}</h4>
      <p className="mvd-dynamika-opis">{T.odbioryOpis}</p>
      {odbiory.length === 0 ? (
        <p className="mvd-dynamika-opis">{T.odbioryBrak}</p>
      ) : (
        <table className="mvd-dynamika-tabela" data-testid="mvd-dynamika-odbiory">
          <thead>
            <tr>
              <th>{T.kolOdbior}</th>
              <th>{T.kolStan}</th>
              <th>{T.kolParametryOdbioru}</th>
              <th>{T.kolPochodzenie}</th>
              <th>{T.kolWiazanie}</th>
            </tr>
          </thead>
          <tbody>
            {odbiory.map((odbior) => (
              <WierszOdbioru
                key={`${odbior.ref_id}|${odbior.wiazanie ?? ''}|${odbior.stan}`}
                odbior={odbior}
                profile={profileOdbiorow}
                wskazany={odbior.ref_id === wskazanyRef}
                zapisywany={odbior.ref_id === zapisywanyRef}
                onPowiaz={onPowiazOdbior}
                onPokazNaSchemacie={onPokazNaSchemacie}
              />
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
