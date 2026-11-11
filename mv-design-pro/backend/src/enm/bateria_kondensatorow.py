"""Bateria kondensatorów równoległych SN w modelu ENM — JEDNO miejsce, w którym element
``ShuntCapacitor`` spotyka rejestr wartości roboczych, algebrę admitancji i reguły pola BKR
(karta UX-04/POLE-BKR-MODEL; ENEA Operator, Stacje 110 kV, Zeszyt 1 §13, §17, Zał. 16;
IRiESD ENEA II.4.5.4.4.2).

* ``parametry_baterii`` — rozstrzygnięcie parametrów baterii (projektant > typ > propozycja
  rejestru, ``catalog.wartosci_robocze.rozstrzygnij_dane_baterii``) z elementu migawki albo
  modelu;
* ``niezgodnosc_stopni`` — JEDEN predykat „stan stopni nie pasuje do liczby stopni" dla
  walidatora (E043) i assemblera rozpływu (odmowa nazwana) — predykaty parami;
* ``admitancje_baterii_rozplywu`` — admitancja każdej załączonej baterii z pierwszych zasad
  (``network_model.pochodne.bateria_kondensatorow``) i jej zapis White Box;
* ``zalozenia_baterii_zwarcia`` — założenia biegu zwarciowego: pominięcie w składowej
  zgodnej i przeciwnej (podstawa IEC 60909-0) oraz układ połączeń z wartości roboczej
  (wyłącznie zwarcia doziemne — układ rozstrzyga o drodze zerowej);
* ``pole_baterii`` / ``stacja_gpz_baterii`` / ``transformatory_zasilajace_baterie`` — dane
  reguł pola BKR walidatora (W045–W048).

Moduł nie liczy fizyki: każdą liczbę daje ``network_model.pochodne``.
"""

from __future__ import annotations

from collections.abc import Mapping, Sequence
from dataclasses import dataclass

from network_model.catalog.types import MATERIALIZATION_CONTRACTS, CatalogNamespace
from network_model.catalog.wartosci_robocze import (
    PARAMETR_BATERII_DLAWIK,
    PARAMETR_BATERII_INDUKCYJNOSC_DLAWIKA,
    PARAMETR_BATERII_LICZBA_STOPNI,
    PARAMETR_BATERII_REZYSTORY_ROZLADOWCZE,
    PARAMETR_BATERII_TOLERANCJA_MAX,
    PARAMETR_BATERII_TOLERANCJA_MIN,
    PARAMETR_BATERII_UKLAD,
    PARAMETRY_BATERII_KONDENSATOROW,
    PROPOZYCJE_BATERII_KONDENSATOROW,
    DanaBateriiRozstrzygnieta,
    dane_przyjete_baterii,
    rozstrzygnij_dane_baterii,
)
from network_model.core.bateria_kondensatorow import (
    NAZWY_UKLADOW_POLACZEN_BATERII_PL,
    PODSTAWA_POMINIECIA_SKLADOWA_ZGODNA_PL,
    PODSTAWA_SKLADOWA_ZEROWA_BATERII_PL,
    UKLADY_POLACZEN_BATERII,
    UKLADY_Z_DROGA_ZEROWA,
    liczba_pozycji_pl,
    liczba_stopni_pl,
    sprzecznosc_parametrow_baterii,
)
from network_model.odmowa_danych import OdmowaNazwana
from network_model.pochodne.bateria_kondensatorow import (
    admitancja_baterii_pu,
    admitancja_baterii_siemens,
    admitancja_sekcji_baterii_siemens,
    moc_bierna_przy_napieciu_mvar,
    moc_czynna_strat_przy_napieciu_mw,
    reaktancja_dlawika_ohm,
    udzial_stopni_zalaczonych,
    zakres_mocy_z_tolerancji_mvar,
)
from pydantic import ValidationError

from .models import (
    Bay,
    EnergyNetworkModel,
    ShuntCapacitor,
    Substation,
    SwitchBranch,
)
from .nazwy_elementow import nazwa_elementu
from .slownik_komunikatow import lista_pl, opis_obiektu

#: Założenie biegu zwarciowego i kod rejestru gotowości: bateria pominięta w składowej zgodnej
#: i przeciwnej (IEC 60909-0) — jawne założenie śladu, jedno na każdą załączoną baterię.
KOD_BATERIA_POMINIETA_W_SKLADOWEJ_ZGODNEJ = "shunt.pominieta_w_skladowej_zgodnej"
#: Założenie biegu i kod rejestru gotowości: parametr baterii wchodzący do wyniku jest
#: wartością roboczą rejestru (zasada nr 4: ESTIMATED, kompletność dowodu NIEPELNY).
KOD_BATERIA_PARAMETRY_ROBOCZE = "shunt.parametry_robocze"
#: Odmowa nazwana: stan stopni baterii niezgodny z liczbą stopni — ten sam predykat co blokada
#: E043 walidatora (``niezgodnosc_stopni``).
KOD_BATERIA_STOPNIE_NIEZGODNE = "assembler.bateria_stopnie_niezgodne"

#: Parametry baterii, które wchodzą do admitancji rozpływu (dane przyjęte biegu rozpływu).
#: Liczba stopni wchodzi WYŁĄCZNIE, gdy projektant podał stan stopni (u = n_zał/n); bez stanu
#: stopni wszystkie stopnie są załączone i u = 1 niezależnie od liczby.
PARAMETRY_BATERII_ROZPLYWU: tuple[str, ...] = (
    PARAMETR_BATERII_LICZBA_STOPNI,
    PARAMETR_BATERII_DLAWIK,
    PARAMETR_BATERII_INDUKCYJNOSC_DLAWIKA,
)
#: Parametry baterii, które wchodzą do wyniku zwarcia doziemnego (droga zerowa i udział
#: w prądzie pojemnościowym): układ połączeń oraz parametry admitancji gwiazdy uziemionej.
PARAMETRY_BATERII_SKLADOWEJ_ZEROWEJ: tuple[str, ...] = (
    PARAMETR_BATERII_UKLAD,
    PARAMETR_BATERII_LICZBA_STOPNI,
)

ElementBaterii = Mapping[str, object] | ShuntCapacitor


def _pola_elementu(bateria: ElementBaterii) -> Mapping[str, object]:
    if isinstance(bateria, ShuntCapacitor):
        return bateria.model_dump(mode="json")
    return bateria


def parametry_baterii(bateria: ElementBaterii) -> dict[str, DanaBateriiRozstrzygnieta]:
    """Parametry baterii rozstrzygnięte w kolejności ``PARAMETRY_BATERII_KONDENSATOROW``:
    wartość elementu (projektant) > ``materialized_params`` (kopia typu) > propozycja rejestru."""
    pola = _pola_elementu(bateria)
    element = {parametr: pola.get(parametr) for parametr in PARAMETRY_BATERII_KONDENSATOROW}
    typ = pola.get("materialized_params")
    return rozstrzygnij_dane_baterii(element, typ if isinstance(typ, Mapping) else None)


def stan_stopni(bateria: ElementBaterii) -> list[bool] | None:
    """Stan stopni nadany na elemencie (``None`` = wszystkie stopnie załączone)."""
    stopnie = _pola_elementu(bateria).get("stopnie_zalaczone")
    if not isinstance(stopnie, list):
        return None
    return [bool(stopien) for stopien in stopnie]


def niezgodnosc_stopni(
    bateria: ElementBaterii, dane: Mapping[str, DanaBateriiRozstrzygnieta]
) -> str | None:
    """Zdanie o niezgodności stanu stopni z ROZSTRZYGNIĘTĄ liczbą stopni albo ``None``.

    JEDNO źródło dla walidatora (E043, blokada) i assemblera rozpływu (odmowa nazwana) —
    model zatrzymany walidatorem nie może przejść przez assembler i odwrotnie.
    """
    stopnie = stan_stopni(bateria)
    if stopnie is None:
        return None
    dana = dane[PARAMETR_BATERII_LICZBA_STOPNI]
    liczba = int(dana.wartosc)
    if len(stopnie) == liczba:
        return None
    zrodlo = {
        "PROJEKTANT": "nadana na elemencie",
        "KATALOG": "z typu katalogowego",
        "PROPOZYCJA": "z wartości roboczej rejestru",
    }.get(str(dana.pochodzenie), "")
    return (
        f"stan stopni ma {liczba_pozycji_pl(len(stopnie))}, a bateria ma "
        f"{liczba_stopni_pl(liczba)} (liczba stopni {zrodlo})"
    )


@dataclass(frozen=True)
class AdmitancjaBaterii:
    """Admitancja załączonej baterii w p.u. na bazie szyny i jej zapis White Box."""

    ref_id: str
    nazwa: str
    bus_ref: str
    y_pu: complex
    zapis: dict[str, object]
    dane_przyjete: tuple[dict[str, object], ...]
    #: Kody parametrów, których wartość robocza weszła do admitancji (ten sam zbiór co
    #: ``dane_przyjete`` — jedno źródło: ``parametry_robocze_baterii``).
    parametry_robocze: tuple[str, ...] = ()
    #: Nazwy tych parametrów w zdaniu założenia biegu.
    parametry_robocze_pl: str = ""


@dataclass(frozen=True)
class _WielkosciBaterii:
    dane: dict[str, DanaBateriiRozstrzygnieta]
    liczba_stopni: int
    stopnie: list[bool] | None
    udzial: float
    q_n: float
    u_n: float
    straty_kw: float | None
    x_dlawika: float | None


def _wielkosci_baterii(bateria: Mapping[str, object], czestotliwosc_hz: float) -> _WielkosciBaterii:
    """Wielkości wejściowe admitancji baterii — JEDNO miejsce dla rozpływu, składowej zerowej
    zwarć i prądu pojemnościowego doziemienia."""
    dane = parametry_baterii(bateria)
    niezgodnosc = niezgodnosc_stopni(bateria, dane)
    if niezgodnosc is not None:
        raise OdmowaNazwana(
            f"{opis_obiektu(bateria, 'Bateria kondensatorów')}: {niezgodnosc}.",
            kod=KOD_BATERIA_STOPNIE_NIEZGODNE,
            dane={"element_ref": str(bateria.get("ref_id") or "")},
        )
    liczba_stopni = int(dane[PARAMETR_BATERII_LICZBA_STOPNI].wartosc)
    stopnie = stan_stopni(bateria)
    udzial = udzial_stopni_zalaczonych(stopnie, liczba_stopni)
    q_n = float(bateria["rated_mvar"])  # type: ignore[arg-type]
    u_n = float(bateria["rated_kv"])  # type: ignore[arg-type]
    meta = bateria.get("meta")
    straty_surowe = meta.get("loss_kw") if isinstance(meta, Mapping) else None
    straty_kw = float(straty_surowe) if isinstance(straty_surowe, int | float) else None
    x_dlawika: float | None = None
    if dane[PARAMETR_BATERII_DLAWIK].wartosc:
        x_dlawika = reaktancja_dlawika_ohm(
            float(dane[PARAMETR_BATERII_INDUKCYJNOSC_DLAWIKA].wartosc), czestotliwosc_hz
        )
    return _WielkosciBaterii(
        dane=dane,
        liczba_stopni=liczba_stopni,
        stopnie=stopnie,
        udzial=udzial,
        q_n=q_n,
        u_n=u_n,
        straty_kw=straty_kw,
        x_dlawika=x_dlawika,
    )


def admitancja_zerowa_baterii_s(bateria: Mapping[str, object], czestotliwosc_hz: float) -> complex:
    """Admitancja zerowa fazy baterii względem ziemi [S]: Y0 = Y1 dla gwiazdy uziemionej,
    0 dla układów bez drogi zerowej (gwiazda izolowana, podwójna gwiazda, trójkąt)."""
    w = _wielkosci_baterii(bateria, czestotliwosc_hz)
    if not ma_droge_zerowa(w.dane):
        return 0j
    return admitancja_baterii_siemens(
        moc_bierna_mvar=w.q_n,
        napiecie_znamionowe_kv=w.u_n,
        udzial_stopni=w.udzial,
        straty_kw=w.straty_kw,
        reaktancja_dlawika_ohm=w.x_dlawika,
    )


@dataclass(frozen=True)
class SekcjeBaterii:
    """Bateria w zapisie liniowym sekcji (CGMES ``LinearShuntCompensator``): liczba sekcji
    (stopni), sekcje załączone (0 przy wyłączonej baterii) i admitancja jednej sekcji [S]."""

    liczba_sekcji: int
    sekcje_zalaczone: int
    y_sekcji_s: complex


def sekcje_baterii(bateria: ElementBaterii, czestotliwosc_hz: float) -> SekcjeBaterii:
    """Zapis liniowy sekcji baterii — stopnie z rozstrzygniętej liczby stopni i stanu stopni.

    Admitancja sekcji z ``pochodne.admitancja_sekcji_baterii_siemens`` przy stanie
    odniesienia równym stopniom załączonym (wszystkim, gdy żaden nie jest załączony albo
    bateria jest wyłączona) — stan zapisany w pliku jest odwzorowany dokładnie także dla
    baterii z dławikiem."""
    pola = _pola_elementu(bateria)
    w = _wielkosci_baterii(pola, czestotliwosc_hz)
    zalaczone = w.liczba_stopni if w.stopnie is None else sum(1 for s in w.stopnie if s)
    odniesienie = zalaczone if zalaczone > 0 else w.liczba_stopni
    y_sekcji = admitancja_sekcji_baterii_siemens(
        moc_bierna_mvar=w.q_n,
        napiecie_znamionowe_kv=w.u_n,
        liczba_stopni=w.liczba_stopni,
        stopnie_odniesienia=odniesienie,
        straty_kw=w.straty_kw,
        reaktancja_dlawika_ohm=w.x_dlawika,
    )
    return SekcjeBaterii(
        liczba_sekcji=w.liczba_stopni,
        sekcje_zalaczone=0 if pola.get("status") == "open" else zalaczone,
        y_sekcji_s=y_sekcji,
    )


def admitancja_baterii(
    bateria: Mapping[str, object],
    *,
    napiecie_bazy_kv: float,
    moc_bazy_mva: float,
    czestotliwosc_hz: float,
) -> AdmitancjaBaterii:
    """Admitancja baterii (stopnie załączone, straty, dławik) i zapis White Box.

    Wymaga dodatnich Q_n i U_n — sprawdza je wołający (assembler odmawia nazwanym kodem,
    walidator blokuje E040/E041 wcześniej). Stan stopni niezgodny z liczbą stopni to odmowa
    nazwana ``KOD_BATERIA_STOPNIE_NIEZGODNE`` TU, w jedynym miejscu liczenia udziału stopni
    (rozpływ i składowa zerowa), z tego samego predykatu co blokada E043 walidatora.
    """
    w = _wielkosci_baterii(bateria, czestotliwosc_hz)
    dane, liczba_stopni, stopnie, udzial = w.dane, w.liczba_stopni, w.stopnie, w.udzial
    q_n, u_n, straty_kw, x_dlawika = w.q_n, w.u_n, w.straty_kw, w.x_dlawika
    y_pu = admitancja_baterii_pu(
        moc_bierna_mvar=q_n,
        napiecie_znamionowe_kv=u_n,
        napiecie_bazy_kv=napiecie_bazy_kv,
        moc_bazy_mva=moc_bazy_mva,
        udzial_stopni=udzial,
        straty_kw=straty_kw,
        reaktancja_dlawika_ohm=x_dlawika,
    )
    q_min, q_max = zakres_mocy_z_tolerancji_mvar(
        q_n,
        udzial,
        float(dane[PARAMETR_BATERII_TOLERANCJA_MIN].wartosc),
        float(dane[PARAMETR_BATERII_TOLERANCJA_MAX].wartosc),
    )
    ref_id = str(bateria.get("ref_id") or "")
    parametry_wyniku = (
        PARAMETRY_BATERII_ROZPLYWU
        if stopnie is not None
        else tuple(p for p in PARAMETRY_BATERII_ROZPLYWU if p != PARAMETR_BATERII_LICZBA_STOPNI)
    )
    nazwa = nazwa_elementu(bateria, "shunt_capacitors")
    przyjete = dane_przyjete_baterii(dane, miejsce_pl=nazwa, parametry=parametry_wyniku)
    robocze = parametry_robocze_baterii(dane, parametry_wyniku)
    zapis: dict[str, object] = {
        "element_ref": ref_id,
        "bus_ref": str(bateria.get("bus_ref") or ""),
        "uklad_polaczen": dane[PARAMETR_BATERII_UKLAD].wartosc,
        "liczba_stopni": liczba_stopni,
        "stopnie_zalaczone": stopnie if stopnie is not None else [True] * liczba_stopni,
        "udzial_stopni": udzial,
        "q_n_mvar": q_n,
        "u_n_kv": u_n,
        "u_b_kv": napiecie_bazy_kv,
        "s_b_mva": moc_bazy_mva,
        "straty_kw": straty_kw,
        "x_dlawika_ohm": x_dlawika,
        "g_pu": y_pu.real,
        "b_pu": y_pu.imag,
        "wzor_latex": (
            r"b = \frac{Q_n \cdot u}{S_b}\left(\frac{U_b}{U_n}\right)^2,\quad "
            r"u = \frac{n_{zal}}{n},\quad Q(U) = b\,|U|^2 S_b = Q_n\,u\left(\frac{U}{U_n}\right)^2"
            + (r",\quad y_d = \frac{1}{jX_L + 1/y}" if x_dlawika is not None else "")
        ),
        "zakres_q_przy_un_mvar": [q_min, q_max],
        "parametry": [dane[p].to_dict() for p in PARAMETRY_BATERII_KONDENSATOROW],
    }
    return AdmitancjaBaterii(
        ref_id=ref_id,
        nazwa=nazwa,
        bus_ref=str(bateria.get("bus_ref") or ""),
        y_pu=y_pu,
        zapis=zapis,
        dane_przyjete=tuple(d.model_dump(mode="json") for d in przyjete),
        parametry_robocze=robocze,
        parametry_robocze_pl=_nazwy_parametrow_roboczych_pl(dane, robocze),
    )


def parametry_robocze_baterii(
    dane: Mapping[str, DanaBateriiRozstrzygnieta], parametry: Sequence[str]
) -> tuple[str, ...]:
    """Kody parametrów z ``parametry``, których wartość jest robocza (rejestr, nie projektant
    ani typ) — ten sam predykat i ta sama kolejność co ``dane_przyjete_baterii``."""
    zakres = set(parametry)
    return tuple(
        p
        for p in PARAMETRY_BATERII_KONDENSATOROW
        if p in zakres and (dana := dane.get(p)) is not None and dana.robocza
    )


def _nazwy_parametrow_roboczych_pl(
    dane: Mapping[str, DanaBateriiRozstrzygnieta], kody: Sequence[str]
) -> str:
    """„liczba stopni baterii i dławik ograniczający…" — nazwy parametrów roboczych w zdaniu."""
    nazwy: list[str] = []
    for kod in kody:
        propozycja = dane[kod].propozycja
        assert propozycja is not None, kod
        nazwy.append(propozycja.nazwa_pl)
    return lista_pl(nazwy, "i")


def wynik_baterii_rozplywu(
    zapis: Mapping[str, object], napiecie_pu: float | None
) -> dict[str, object]:
    """Zapis White Box baterii z wynikiem przy napięciu szyny rozwiązanym przez solver:
    Q = b·|U|²·S_b i P = g·|U|²·S_b (``network_model.pochodne``). ``napiecie_pu is None`` =
    szyna poza wyspą rozwiązaną — wielkości wyniku są jawnym brakiem (``None``)."""
    b_pu = float(zapis["b_pu"])  # type: ignore[arg-type]
    g_pu = float(zapis["g_pu"])  # type: ignore[arg-type]
    s_b = float(zapis["s_b_mva"])  # type: ignore[arg-type]
    return {
        **zapis,
        "u_pu": napiecie_pu,
        "q_mvar": (
            moc_bierna_przy_napieciu_mvar(b_pu, napiecie_pu, s_b)
            if napiecie_pu is not None
            else None
        ),
        "p_mw": (
            moc_czynna_strat_przy_napieciu_mw(g_pu, napiecie_pu, s_b)
            if napiecie_pu is not None
            else None
        ),
    }


def zalozenia_baterii_rozplywu(
    admitancje: Sequence[AdmitancjaBaterii],
) -> tuple[dict[str, object], ...]:
    """Założenia biegu rozpływu: bateria, której admitancja wynika z wartości roboczej
    (dławik, liczba stopni przy podanym stanie stopni) — jedno na baterię."""
    return tuple(
        {
            "code": KOD_BATERIA_PARAMETRY_ROBOCZE,
            "element_ref": adm.ref_id,
            "message_pl": (
                f"{adm.nazwa}: admitancja baterii policzona z wartością roboczą: "
                f"{adm.parametry_robocze_pl}. Zmień wartość w parametrach baterii w inspektorze."
            ),
            "bus_ref": adm.bus_ref,
            "parametry": list(adm.parametry_robocze),
            "dane_przyjete": list(adm.dane_przyjete),
        }
        for adm in admitancje
        if adm.dane_przyjete
    )


def ma_droge_zerowa(dane: Mapping[str, DanaBateriiRozstrzygnieta]) -> bool:
    """Bateria daje drogę prądowi składowej zerowej wyłącznie w gwieździe uziemionej."""
    return str(dane[PARAMETR_BATERII_UKLAD].wartosc) in UKLADY_Z_DROGA_ZEROWA


def zalozenia_baterii_zwarcia(
    enm: EnergyNetworkModel, scenario: str, *, doziemne: bool
) -> tuple[dict[str, object], ...]:
    """Założenia biegu zwarciowego dla KAŻDEJ załączonej baterii (kolejność ``ref_id``).

    * zawsze: pominięcie w składowej zgodnej i przeciwnej z podstawą IEC 60909-0
      (``KOD_BATERIA_POMINIETA_W_SKLADOWEJ_ZGODNEJ``);
    * zwarcia doziemne (``doziemne``): opis składowej zerowej baterii (droga zerowa albo jej
      brak z podstawą) w tym samym wpisie, a gdy układ połączeń albo liczba stopni gwiazdy
      uziemionej jest wartością roboczą — założenie ``KOD_BATERIA_PARAMETRY_ROBOCZE`` z daną
      przyjętą (układ rozstrzyga o prądzie doziemnym).
    """
    zalozenia: list[dict[str, object]] = []
    for bateria in sorted(enm.shunt_capacitors, key=lambda b: b.ref_id):
        if bateria.status != "closed":
            continue
        nazwa = nazwa_elementu(bateria, "shunt_capacitors")
        dane = parametry_baterii(bateria)
        uklad = str(dane[PARAMETR_BATERII_UKLAD].wartosc)
        zdanie = (
            f"{nazwa}: bateria pominięta w składowej zgodnej i przeciwnej impedancji "
            f"zwarciowej. Podstawa: {PODSTAWA_POMINIECIA_SKLADOWA_ZGODNA_PL}."
        )
        if doziemne:
            if ma_droge_zerowa(dane):
                zdanie += (
                    f" Składowa zerowa: układ „{NAZWY_UKLADOW_POLACZEN_BATERII_PL[uklad]}” daje "
                    "admitancję zerową równą zgodnej (Y0 = Y1) — bateria wchodzi do sieci zerowej "
                    "i do prądu pojemnościowego zwarcia doziemnego."
                )
            else:
                zdanie += (
                    f" Składowa zerowa: układ „{NAZWY_UKLADOW_POLACZEN_BATERII_PL[uklad]}” nie ma "
                    "połączenia z ziemią — brak drogi zerowej, bateria nie wnosi prądu "
                    "pojemnościowego."
                )
            zdanie += f" Podstawa: {PODSTAWA_SKLADOWA_ZEROWA_BATERII_PL}."
        zalozenia.append(
            {
                "code": KOD_BATERIA_POMINIETA_W_SKLADOWEJ_ZGODNEJ,
                "element_ref": bateria.ref_id,
                "message_pl": zdanie,
                "scenariusz": scenario,
                "uklad_polaczen": uklad,
                "droga_zerowa": ma_droge_zerowa(dane),
            }
        )
        if not doziemne:
            continue
        parametry = (
            PARAMETRY_BATERII_SKLADOWEJ_ZEROWEJ
            if ma_droge_zerowa(dane)
            else (PARAMETR_BATERII_UKLAD,)
        )
        przyjete = dane_przyjete_baterii(dane, miejsce_pl=nazwa, parametry=parametry)
        robocze = parametry_robocze_baterii(dane, parametry)
        if przyjete:
            zalozenia.append(
                {
                    "code": KOD_BATERIA_PARAMETRY_ROBOCZE,
                    "element_ref": bateria.ref_id,
                    "message_pl": (
                        f"{nazwa}: składowa zerowa baterii ustalona z wartością roboczą: "
                        f"{_nazwy_parametrow_roboczych_pl(dane, robocze)}. Zmień wartość "
                        "w parametrach baterii w inspektorze."
                    ),
                    "scenariusz": scenario,
                    "bus_ref": bateria.bus_ref,
                    "parametry": list(robocze),
                    "dane_przyjete": [d.model_dump(mode="json") for d in przyjete],
                }
            )
    return tuple(zalozenia)


# ---------------------------------------------------------------------------
# Dane reguł pola BKR (walidator W045–W048)
# ---------------------------------------------------------------------------


def pole_baterii(enm: EnergyNetworkModel, bateria: ShuntCapacitor) -> Bay | None:
    """Pole, na którego końcu toru (zacisk ``terminal_bus_ref``) stoi bateria — dowolnej roli."""
    return next(
        (
            pole
            for pole in sorted(enm.bays, key=lambda p: p.ref_id)
            if pole.terminal_bus_ref is not None and pole.terminal_bus_ref == bateria.bus_ref
        ),
        None,
    )


def _sekcje_gpz(enm: EnergyNetworkModel) -> dict[str, Substation]:
    wynik: dict[str, Substation] = {}
    for stacja in enm.substations:
        if stacja.station_type != "gpz":
            continue
        for sekcja in stacja.gpz_sections:
            if sekcja.bus_ref:
                wynik[sekcja.bus_ref] = stacja
    return wynik


def szyna_sekcji_baterii(enm: EnergyNetworkModel, bateria: ShuntCapacitor) -> str:
    """Szyna rozdzielni, z której bateria jest zasilana: szyna pola baterii albo szyna baterii."""
    pole = pole_baterii(enm, bateria)
    return pole.bus_ref if pole is not None else bateria.bus_ref


def stacja_gpz_baterii(enm: EnergyNetworkModel, bateria: ShuntCapacitor) -> Substation | None:
    """GPZ, w którego rozdzielni SN stoi bateria (sekcja szyn GPZ albo pole stacji GPZ)."""
    sekcje = _sekcje_gpz(enm)
    szyna = szyna_sekcji_baterii(enm, bateria)
    if szyna in sekcje:
        return sekcje[szyna]
    pole = pole_baterii(enm, bateria)
    if pole is not None and pole.substation_ref is not None:
        return next(
            (
                s
                for s in enm.substations
                if s.ref_id == pole.substation_ref and s.station_type == "gpz"
            ),
            None,
        )
    return None


def _szyny_sekcji_zasilajacych(enm: EnergyNetworkModel, szyna: str) -> set[str]:
    """Sekcja baterii i sekcje połączone z nią ZAMKNIĘTYMI sprzęgłami szyn (``bus_coupler``)."""
    sprzegla = [
        g
        for g in enm.branches
        if isinstance(g, SwitchBranch) and g.type == "bus_coupler" and g.status == "closed"
    ]
    szyny = {szyna}
    zmiana = True
    while zmiana:
        zmiana = False
        for g in sprzegla:
            if (g.from_bus_ref in szyny) != (g.to_bus_ref in szyny):
                szyny |= {g.from_bus_ref, g.to_bus_ref}
                zmiana = True
    return szyny


def transformatory_zasilajace_baterie(
    enm: EnergyNetworkModel, bateria: ShuntCapacitor
) -> list[str]:
    """Transformatory, przez które bateria jest zasilana (IRiESD II.4.5.4.4.2): strona dolna na
    sekcji baterii albo na sekcji połączonej z nią zamkniętym sprzęgłem — wprost albo przez
    zacisk pola roli ``TR`` tej sekcji. Kolejność ``ref_id``."""
    szyny = _szyny_sekcji_zasilajacych(enm, szyna_sekcji_baterii(enm, bateria))
    zaciski_tr = {
        p.terminal_bus_ref
        for p in enm.bays
        if p.bay_role == "TR" and p.bus_ref in szyny and p.terminal_bus_ref is not None
    }
    return sorted(
        t.ref_id for t in enm.transformers if t.lv_bus_ref in szyny or t.lv_bus_ref in zaciski_tr
    )


#: Pola baterii, które projektant zmienia operacją ``update_element_parameters`` (wartość
#: projektanta ma pierwszeństwo przed typem — ``parametry_baterii``), oraz transformatory,
#: których wyłączenie wyłącza baterię (IRiESD II.4.5.4.4.2).
POLA_BATERII_EDYTOWALNE: tuple[str, ...] = (
    *PARAMETRY_BATERII_KONDENSATOROW,
    "stopnie_zalaczone",
    "wylaczenie_od_transformatorow",
)

_NAZWY_POL_BATERII_PL: dict[str, str] = {
    **{
        parametr: propozycja.nazwa_pl
        for parametr, propozycja in PROPOZYCJE_BATERII_KONDENSATOROW.items()
    },
    "stopnie_zalaczone": "stan stopni baterii",
    "wylaczenie_od_transformatorow": "transformatory wyłączające baterię",
    "rated_mvar": "moc znamionowa baterii",
    "rated_kv": "napięcie znamionowe baterii",
    "status": "stan łącznika baterii",
}

#: Wymaganie pola baterii w zdaniu odmowy zapisu — po polsku, z jednostką (komunikat walidacji
#: modelu nie trafia do projektanta). Pole spoza mapy dostaje wymaganie ogólne.
_WYMAGANIA_POL_BATERII_PL: dict[str, str] = {
    "uklad_polaczen": "jeden z układów: "
    + ", ".join(NAZWY_UKLADOW_POLACZEN_BATERII_PL[u] for u in UKLADY_POLACZEN_BATERII),
    "liczba_stopni": "liczba całkowita co najmniej 1",
    "stopnie_zalaczone": "stan każdego stopnia: załączony albo wyłączony",
    "tolerancja_pojemnosci_min_proc": "odchyłka w dół: liczba nie większa niż 0 %",
    "tolerancja_pojemnosci_max_proc": "odchyłka w górę: liczba nie mniejsza niż 0 %",
    "dlawik_ograniczajacy": "jest albo nie ma",
    "dlawik_indukcyjnosc_mh": "liczba większa niż 0 mH",
    "rezystory_rozladowcze_wewnetrzne": "są albo nie ma",
    "wylaczenie_od_transformatorow": "lista transformatorów modelu",
    "rated_mvar": "liczba w Mvar",
    "rated_kv": "liczba w kV",
    "status": "załączona albo wyłączona",
}
_WYMAGANIE_OGOLNE_PL = "wartość dopuszczalna dla tego parametru"


def odmowa_parametrow_baterii(
    enm: Mapping[str, object], bateria: Mapping[str, object]
) -> str | None:
    """Zdanie odmowy zapisu parametrów baterii (stan po zmianie) albo ``None``.

    JEDNA kontrola dla korekty parametrów: kształt i spójność modelu (``ShuntCapacitor``:
    zakresy, długość stanu stopni wobec liczby nadanej, indukcyjność bez dławika), stan stopni
    wobec ROZSTRZYGNIĘTEJ liczby stopni (ten sam predykat co E043 i assembler —
    ``niezgodnosc_stopni``) oraz istnienie wskazanych transformatorów.
    """
    opis = opis_obiektu(bateria, "Bateria kondensatorów")
    try:
        model = ShuntCapacitor.model_validate(dict(bateria))
    except ValidationError as blad:
        pola = sorted({str(b["loc"][0]) for b in blad.errors() if b.get("loc")})
        if pola:
            # Komunikat walidacji modelu (angielski, z kodem pola) nie trafia do projektanta:
            # nazwa parametru i wymaganie po polsku, z jednostką.
            wymagania = ", ".join(
                f"{_NAZWY_POL_BATERII_PL.get(p, 'parametr baterii')} — "
                f"{_WYMAGANIA_POL_BATERII_PL.get(p, _WYMAGANIE_OGOLNE_PL)}"
                for p in pola
            )
            return f"{opis}: niepoprawna wartość. Wymagane: {wymagania}."
        # Błąd całego rekordu (pola poprawne): sprzeczność parametrów nadanych — to samo zdanie,
        # które walidator modelu podaje w swoim błędzie.
        sprzecznosc = sprzecznosc_parametrow_baterii(
            liczba_stopni=bateria.get("liczba_stopni"),  # type: ignore[arg-type]
            stopnie_zalaczone=bateria.get("stopnie_zalaczone"),  # type: ignore[arg-type]
            dlawik_ograniczajacy=bateria.get("dlawik_ograniczajacy"),  # type: ignore[arg-type]
            dlawik_indukcyjnosc_mh=bateria.get("dlawik_indukcyjnosc_mh"),  # type: ignore[arg-type]
        )
        assert sprzecznosc is not None, blad
        return f"{opis}: {sprzecznosc}."
    niezgodnosc = niezgodnosc_stopni(model, parametry_baterii(model))
    if niezgodnosc is not None:
        return f"{opis}: {niezgodnosc}."
    transformatory = enm.get("transformers")
    znane = {
        str(t.get("ref_id"))
        for t in (transformatory if isinstance(transformatory, list) else [])
        if isinstance(t, Mapping)
    }
    nieznane = sorted(set(model.wylaczenie_od_transformatorow) - znane)
    if nieznane:
        return (
            f"{opis}: wskazano transformatory "
            f"spoza modelu ({len(nieznane)}) jako wyłączające baterię — wskaż transformatory "
            "zasilające sekcję baterii."
        )
    return None


def tabliczka_baterii_z_rekordu(parametry_rekordu: Mapping[str, object]) -> dict[str, object]:
    """Tabliczka typu baterii z parametrów rekordu katalogu — pola kontraktu materializacji
    KOMPENSATOR_SN (``catalog.types.MATERIALIZATION_CONTRACTS``), te same, które daje
    materializacja przy tworzeniu elementu (sonda doboru kompensacji nie ma osobnej listy)."""
    kontrakt = MATERIALIZATION_CONTRACTS[CatalogNamespace.KOMPENSATOR_SN.value]
    return {pole: parametry_rekordu.get(pole) for pole in kontrakt.solver_fields}


def zapisz_tabliczke_baterii(bateria: dict[str, object], tabliczka: Mapping[str, object]) -> None:
    """JEDEN zapisywacz tabliczki typu baterii kondensatorów na elemencie — przy tworzeniu
    (``add_shunt_compensator_sn``), przy zmianie typu (``assign_catalog_to_element``) i w sondzie
    doboru kompensacji (``enm.scenariusze``).

    Q_n i U_n trafiają do pól elementu, straty do ``meta.loss_kw`` (konsument: konduktancja
    baterii w rozpływie), a kopia tabliczki (kontrakt materializacji KOMPENSATOR_SN, także
    parametry baterii karty UX-04/POLE-BKR-MODEL) do ``materialized_params`` — rozstrzygnięcie
    parametrów (``parametry_baterii``) czyta ją jako dane typu. Wartości projektanta na
    elemencie (układ, stopnie, dławik…) zmiana typu zostawia: należą do elementu, nie do
    pozycji katalogu.
    """
    bateria["rated_mvar"] = float(tabliczka["rated_mvar"])  # type: ignore[arg-type]
    bateria["rated_kv"] = float(tabliczka["rated_kv"])  # type: ignore[arg-type]
    meta = bateria.get("meta")
    if not isinstance(meta, dict):
        meta = {}
        bateria["meta"] = meta
    meta["loss_kw"] = tabliczka.get("loss_kw")
    bateria["materialized_params"] = dict(tabliczka)


def rodzaje_aparatow_pola(pole: Bay) -> list[str]:
    """Rodzaje aparatów pierwotnych pola (z powtórzeniami — liczność ma znaczenie)."""
    return [aparat.kind for aparat in pole.primary_devices]


__all__ = [
    "KOD_BATERIA_PARAMETRY_ROBOCZE",
    "KOD_BATERIA_POMINIETA_W_SKLADOWEJ_ZGODNEJ",
    "KOD_BATERIA_STOPNIE_NIEZGODNE",
    "PARAMETRY_BATERII_ROZPLYWU",
    "POLA_BATERII_EDYTOWALNE",
    "PARAMETRY_BATERII_SKLADOWEJ_ZEROWEJ",
    "PARAMETR_BATERII_REZYSTORY_ROZLADOWCZE",
    "AdmitancjaBaterii",
    "SekcjeBaterii",
    "admitancja_baterii",
    "admitancja_zerowa_baterii_s",
    "ma_droge_zerowa",
    "niezgodnosc_stopni",
    "odmowa_parametrow_baterii",
    "parametry_baterii",
    "pole_baterii",
    "rodzaje_aparatow_pola",
    "sekcje_baterii",
    "stacja_gpz_baterii",
    "stan_stopni",
    "szyna_sekcji_baterii",
    "tabliczka_baterii_z_rekordu",
    "transformatory_zasilajace_baterie",
    "wynik_baterii_rozplywu",
    "zalozenia_baterii_rozplywu",
    "zalozenia_baterii_zwarcia",
    "zapisz_tabliczke_baterii",
]
