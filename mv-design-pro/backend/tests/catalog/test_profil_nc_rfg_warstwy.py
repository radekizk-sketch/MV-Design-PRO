"""Profil regulacyjny NC RfG v1 — złożenie warstw, podstawy wymagań i nowe sekcje profilu.

Intencja (karta AB-1a, pakiet B; plan AB §2.2 O-17, §2.3 O-28, O-30, O-31; kontrakt werdyktu
wyjaśnialnego §1): profil jest jedynym źródłem kryteriów i podstaw wymagań oceny zgodności
modułów typu A i B. Testy pokrywają ILOCZYN CECH, w którym defekt mógłby się schować — każdy
operator × każda warstwa × każde wymaganie × typ × technologia × certyfikat — a nie przykład z
karty. Modyfikacje warstw odbywają się na KOPII katalogu w katalogu tymczasowym (produkcyjne
YAML nie są edytowane), złożonej tą samą funkcją co profil produkcyjny.
"""

from __future__ import annotations

import math
import shutil
from collections.abc import Callable, Iterator
from datetime import date, datetime
from pathlib import Path
from typing import Any, get_args

import pytest
import yaml
from catalog.profiles import nc_rfg as pakiet_profilu
from catalog.profiles.nc_rfg import (
    JEDNOSTKI_NASTAW,
    KOLEJNOSC_WARSTW,
    RODZAJ_WARSTWY,
    BankNastaw,
    DokumentWarstwy,
    NastawaBanku,
    NcRfgProfile,
    PozycjaBankuNastaw,
    ProgramBadan,
    ScenariuszBadania,
    StatusZrodla,
    WymaganieRegulacyjne,
    klasyfikacja_modulu,
    klasyfikuj_modul,
    list_available_operators,
    load_nc_rfg_profile,
    najslabszy_stan,
    prog_minimalny_modulu_kw,
)
from catalog.profiles.nc_rfg import loader as modul_loadera
from network_model.catalog.mv_ptpiree_catalog import (
    SNAPSHOT_PATH,
    SNAPSHOT_SCHEMA,
    get_ptpiree_catalog_manifest,
)
from pydantic import ValidationError
from werdykt.kontrakt import PodstawaWymagania, StanZrodla

OPERATORZY = ("enea", "energa", "pge", "pse", "tauron")
_KATALOG_PROFILU = Path(modul_loadera.__file__).parent
_KATALOG_ZRODEL = _KATALOG_PROFILU.parents[2]

#: Odwzorowanie warstwy na rodzaj podstawy — przepisane z karty (pkt 1), NIE z loadera.
RODZAJ_OCZEKIWANY = {
    "NC_RFG": "ROZPORZADZENIE_UE",
    "WOS": "WOS",
    "PROCEDURA_PTPIREE": "PROCEDURA_PTPIREE",
    "WIPWC": "WIPWC",
    "OSD": "OSD",
    "MAGAZYNY": "OSD",
    "NIEUSTALONA": "NIEUSTALONA",
}
KOLEJNOSC_OCZEKIWANA = (
    "NC_RFG",
    "WOS",
    "PROCEDURA_PTPIREE",
    "WIPWC",
    "OSD",
    "MAGAZYNY",
    "NIEUSTALONA",
)
#: Pokrycie certyfikatem przeniesione 1:1 z dawnego pola `certyfikat_pokrywa_typy` warstw
#: `nc_rfg.yaml` i `zastane.yaml` (stan sprzed karty) — przypięte literalnie.
POKRYCIE_SPRZED_KARTY: dict[str, tuple[str, ...]] = {
    "RFG_13_1A": ("A", "B"),
    "RFG_13_1B": ("A", "B"),
    "RFG_13_2": ("A", "B"),
    "RFG_13_3": ("A", "B"),
    "RFG_13_4": ("A", "B"),
    "RFG_13_6": ("A",),
    "RFG_13_7": ("A", "B"),
    "RFG_14_2": ("B",),
    "RFG_14_3": (),
    "RFG_14_4": (),
    "RFG_17_2": (),
    "RFG_17_3": (),
    "RFG_20_2A": (),
    "RFG_20_2B": (),
    "RFG_20_3": (),
    "ZASTANE_HVRT": (),
}
UWAGA_PROGOW_WOS = (
    "wartości progów wg decyzji właściciela O-1 (plan AB §2.1); jednostka redakcyjna "
    "dokumentu WOS do wskazania (plan AB §12.1)"
)
UWAGA_POKRYCIA = (
    "pokrycie przeniesione z dawnego pola certyfikat_pokrywa_typy bez wskazania punktu "
    "WiPWC; do wskazania per wymaganie (plan AB §12.1)"
)
UWAGA_BANKU = (
    "nastawy zabezpieczeń modułów wymagane przez operatora nie są udokumentowane w "
    "repozytorium (OD-21)"
)
UWAGA_PROGRAMU = (
    "zbiór scenariuszy (głębokości i czasy zapadu × poziomy P × Q × punkt pracy sprzed "
    "zakłócenia) wymaga programów ramowych testów PTPiREE (plan AB §12.1)"
)
_RANGA_STANU = {"ZWERYFIKOWANE": 0, "WSKAZANE": 1, "NIEUSTALONE": 2}


# ---------------------------------------------------------------------------
# Narzędzia: kopia katalogu warstw, edycja YAML, złożenie z kopii, przegląd podstaw
# ---------------------------------------------------------------------------


@pytest.fixture
def katalog(tmp_path: Path) -> Path:
    """Kopia warstw i operatorów do modyfikacji w teście (produkcyjne YAML nietknięte)."""
    kopia = tmp_path / "nc_rfg"
    shutil.copytree(_KATALOG_PROFILU / "warstwy", kopia / "warstwy")
    shutil.copytree(_KATALOG_PROFILU / "operatorzy", kopia / "operatorzy")
    return kopia


def _edytuj(sciezka: Path, zmiana: Callable[[dict[str, Any]], None]) -> None:
    dane = yaml.safe_load(sciezka.read_text(encoding="utf-8"))
    zmiana(dane)
    sciezka.write_text(yaml.safe_dump(dane, allow_unicode=True, sort_keys=False), encoding="utf-8")


def _zloz(katalog: Path, operator_id: str = "pse") -> NcRfgProfile:
    """Złożenie profilu z kopii katalogu — ta sama funkcja, co profil produkcyjny."""
    return modul_loadera._zloz_profil(operator_id, katalog / "warstwy", katalog / "operatorzy")


def _surowe(plik: str) -> dict[str, Any]:
    dane: dict[str, Any] = yaml.safe_load((_KATALOG_PROFILU / plik).read_text(encoding="utf-8"))
    return dane


def _podstawy(wezel: Any, sciezka: str = "") -> Iterator[tuple[str, dict[str, Any]]]:
    """Każde wystąpienie klucza `rodzaj` w zrzucie profilu (każda podstawa, bez wyjątku)."""
    if isinstance(wezel, dict):
        if "rodzaj" in wezel:
            yield sciezka, wezel
        for klucz, wartosc in wezel.items():
            yield from _podstawy(wartosc, f"{sciezka}.{klucz}" if sciezka else str(klucz))
    elif isinstance(wezel, list | tuple):
        for indeks, wartosc in enumerate(wezel):
            yield from _podstawy(wartosc, f"{sciezka}.{indeks}")


def _dokument(status: str, *, wydanie: str | None = "1") -> DokumentWarstwy:
    return DokumentWarstwy(
        tytul="Dokument testowy", wydanie=wydanie, status=status, obowiazuje_od=None
    )


def _podstawa_osd(status: StatusZrodla, jednostka: str | None = "pkt 1") -> PodstawaWymagania:
    return PodstawaWymagania(
        rodzaj="OSD",
        dokument="IRiESD testowa",
        wydanie="1" if status != "NIEUSTALONE" else None,
        jednostka_redakcyjna=jednostka,
        status=status,
    )


# ---------------------------------------------------------------------------
# Warstwy profilu i ich podstawy
# ---------------------------------------------------------------------------


class TestWarstwyIPodstawy:
    def test_odwzorowanie_warstwy_na_rodzaj_podstawy(self) -> None:
        """Jedno odwzorowanie warstwa → rodzaj podstawy, dokładnie jak w karcie."""
        assert dict(RODZAJ_WARSTWY) == RODZAJ_OCZEKIWANY
        assert KOLEJNOSC_WARSTW == KOLEJNOSC_OCZEKIWANA

    @pytest.mark.parametrize("operator_id", OPERATORZY)
    def test_kolejnosc_warstw_profilu(self, operator_id: str) -> None:
        profil = load_nc_rfg_profile(operator_id)
        assert tuple(w.warstwa for w in profil.warstwy) == KOLEJNOSC_OCZEKIWANA

    def test_jeden_typ_podstawy_w_produkcie(self) -> None:
        """`ZrodloWartosci` skasowane bez aliasu; stan źródła = słownik kontraktu werdyktu."""
        assert not hasattr(pakiet_profilu, "ZrodloWartosci")
        assert not hasattr(modul_loadera, "ZrodloWartosci")
        assert get_args(StatusZrodla) == get_args(StanZrodla)
        for pole in ("zrodlo", "pokrycie_zrodlo"):
            assert WymaganieRegulacyjne.model_fields[pole].annotation is PodstawaWymagania
        assert NcRfgProfile.model_fields["klasyfikacja_zrodlo"].annotation is PodstawaWymagania

    @pytest.mark.parametrize("operator_id", OPERATORZY)
    def test_kazda_podstawa_ma_dokument_i_rodzaj_zgodny_z_warstwa(self, operator_id: str) -> None:
        """Każde wystąpienie `rodzaj` w zrzucie profilu: niepusty dokument, a dokument należy
        do warstwy, której rodzaj jest równy `rodzaj` (magazyny i OSD dzielą rodzaj OSD)."""
        profil = load_nc_rfg_profile(operator_id)
        tytuly: dict[str, set[str]] = {}
        for warstwa in profil.warstwy:
            tytuly.setdefault(RODZAJ_OCZEKIWANY[warstwa.warstwa], set()).add(warstwa.tytul)
        podstawy = list(_podstawy(profil.model_dump()))
        assert len(podstawy) >= 2 * len(profil.wymagania)
        sciezki = {sciezka for sciezka, _ in podstawy}
        for oczekiwana in (
            "klasyfikacja_zrodlo",
            "zakresy_czestotliwosci.zrodlo",
            "lfsm_o_granice.zrodlo",
            "voltage_levels.hvrt_zrodlo",
            "kryteria_akceptacji.zrodlo",
            "wymagania.0.zrodlo",
            "wymagania.0.pokrycie_zrodlo",
        ):
            assert oczekiwana in sciezki
        for sciezka, podstawa in podstawy:
            assert podstawa["dokument"].strip(), sciezka
            assert podstawa["rodzaj"] in tytuly, sciezka
            assert podstawa["dokument"] in tytuly[podstawa["rodzaj"]], sciezka

    @pytest.mark.parametrize("operator_id", OPERATORZY)
    def test_kazda_podstawa_wskazana_ma_wydanie_i_jednostke_redakcyjna(
        self, operator_id: str
    ) -> None:
        profil = load_nc_rfg_profile(operator_id)
        wskazane = [
            (sciezka, p)
            for sciezka, p in _podstawy(profil.model_dump())
            if p["status"] in ("WSKAZANE", "ZWERYFIKOWANE")
        ]
        assert wskazane, "profil bez żadnej podstawy wskazanej — test byłby pusty"
        for sciezka, podstawa in wskazane:
            assert podstawa["jednostka_redakcyjna"], sciezka
            assert podstawa["wydanie"], sciezka

    def test_jednostki_wymagan_nc_rfg(self) -> None:
        """Jednostki NC RfG typu „art. 13 ust. 1 lit. a (tabela 2)" zostają WSKAZANE; RFG_17_3
        (jednostka do potwierdzenia) — NIEUSTALONE z uwagą."""
        profil = load_nc_rfg_profile("pse")
        for wymaganie in profil.wymagania:
            if wymaganie.zrodlo.rodzaj != "ROZPORZADZENIE_UE":
                continue
            if wymaganie.id == "RFG_17_3":
                assert wymaganie.zrodlo.status == "NIEUSTALONE"
                assert wymaganie.zrodlo.jednostka_redakcyjna == "art. 17 ust. 3"
                assert "do potwierdzenia" in (wymaganie.zrodlo.uwagi_pl or "")
            else:
                assert wymaganie.zrodlo.status == "WSKAZANE", wymaganie.id
                assert (wymaganie.zrodlo.jednostka_redakcyjna or "").startswith("art. ")
        zastane = profil.wymaganie("ZASTANE_HVRT").zrodlo
        assert (zastane.rodzaj, zastane.status) == ("NIEUSTALONA", "NIEUSTALONE")
        assert zastane.uwagi_pl

    @pytest.mark.parametrize(
        "plik",
        [
            "warstwy/nc_rfg.yaml",
            "warstwy/wos.yaml",
            "warstwy/procedura_ptpiree.yaml",
            "warstwy/wipwc.yaml",
            "warstwy/magazyny.yaml",
            "warstwy/zastane.yaml",
            "operatorzy/pse.yaml",
        ],
    )
    def test_warstwa_bez_sekcji_dokument_odrzucona(self, katalog: Path, plik: str) -> None:
        _edytuj(katalog / plik, lambda d: d.pop("dokument"))
        with pytest.raises(ValueError, match="dokument"):
            _zloz(katalog)

    @pytest.mark.parametrize(
        "plik",
        [
            "warstwy/nc_rfg.yaml",
            "warstwy/wos.yaml",
            "warstwy/procedura_ptpiree.yaml",
            "warstwy/wipwc.yaml",
            "warstwy/magazyny.yaml",
            "warstwy/zastane.yaml",
            "operatorzy/pse.yaml",
        ],
    )
    def test_dokument_bez_jawnej_daty_obowiazywania_odrzucony(
        self, katalog: Path, plik: str
    ) -> None:
        """`obowiazuje_od` jest kluczem JAWNYM (null = nieustalone) w każdej warstwie."""
        _edytuj(katalog / plik, lambda d: d["dokument"].pop("obowiazuje_od"))
        with pytest.raises(ValidationError, match="obowiazuje_od"):
            _zloz(katalog)

    def test_dokument_wskazany_bez_wydania_odrzucony(self) -> None:
        with pytest.raises(ValidationError, match="bez wydania"):
            _dokument("WSKAZANE", wydanie=None)
        assert _dokument("NIEUSTALONE", wydanie=None).wydanie is None

    def test_plik_deklarujacy_inna_warstwe_odrzucony(self, katalog: Path) -> None:
        def zmien(d: dict[str, Any]) -> None:
            d["warstwa"] = "WOS"

        _edytuj(katalog / "warstwy" / "wipwc.yaml", zmien)
        with pytest.raises(ValueError, match="deklaruje warstwę"):
            _zloz(katalog)


# ---------------------------------------------------------------------------
# Stan źródła i konstrukcja podstawy
# ---------------------------------------------------------------------------


class TestStanZrodla:
    @pytest.mark.parametrize(
        ("stany", "oczekiwany"),
        [
            ([], "NIEUSTALONE"),
            (["ZWERYFIKOWANE"], "ZWERYFIKOWANE"),
            (["ZWERYFIKOWANE", "WSKAZANE"], "WSKAZANE"),
            (["WSKAZANE", "ZWERYFIKOWANE"], "WSKAZANE"),
            (["WSKAZANE", "NIEUSTALONE"], "NIEUSTALONE"),
            (["NIEUSTALONE", "ZWERYFIKOWANE", "WSKAZANE"], "NIEUSTALONE"),
        ],
    )
    def test_najslabszy_stan(self, stany: list[StatusZrodla], oczekiwany: str) -> None:
        assert najslabszy_stan(stany) == oczekiwany

    @pytest.mark.parametrize("stan_dokumentu", ["ZWERYFIKOWANE", "WSKAZANE", "NIEUSTALONE"])
    @pytest.mark.parametrize("stan_grupy", [None, "ZWERYFIKOWANE", "WSKAZANE", "NIEUSTALONE"])
    def test_stan_podstawy_to_najslabszy_z_grupy_i_dokumentu(
        self, stan_dokumentu: StatusZrodla, stan_grupy: StatusZrodla | None
    ) -> None:
        """Grupa × dokument (z jednostką redakcyjną): stan nie mocniejszy niż słabszy z nich."""
        podstawa = modul_loadera._zrodlo(
            "WOS",
            _dokument(stan_dokumentu),
            jednostka_redakcyjna="pkt 1",
            status=stan_grupy,
        )
        skladniki = [stan_dokumentu] + ([stan_grupy] if stan_grupy else [])
        assert podstawa.status == max(skladniki, key=_RANGA_STANU.__getitem__)

    @pytest.mark.parametrize("warstwa", [w for w in KOLEJNOSC_OCZEKIWANA if w != "NIEUSTALONA"])
    @pytest.mark.parametrize("stan_dokumentu", ["ZWERYFIKOWANE", "WSKAZANE"])
    @pytest.mark.parametrize("stan_grupy", [None, "ZWERYFIKOWANE", "WSKAZANE"])
    def test_bez_jednostki_redakcyjnej_nigdy_wskazane(
        self, warstwa: str, stan_dokumentu: StatusZrodla, stan_grupy: StatusZrodla | None
    ) -> None:
        """Warstwa × stan dokumentu × stan grupy: brak jednostki redakcyjnej obniża stan do
        NIEUSTALONE z uwagą nazywającą brak — jednostka nigdy nie jest dopisywana."""
        podstawa = modul_loadera._zrodlo(
            warstwa, _dokument(stan_dokumentu), status=stan_grupy, uwagi_pl="uwaga sekcji"
        )
        assert podstawa.status == "NIEUSTALONE"
        assert podstawa.jednostka_redakcyjna is None
        assert "brak jednostki redakcyjnej" in (podstawa.uwagi_pl or "")
        assert "uwaga sekcji" in (podstawa.uwagi_pl or "")
        assert podstawa.rodzaj == RODZAJ_OCZEKIWANY[warstwa]

    @pytest.mark.parametrize("warstwa", KOLEJNOSC_OCZEKIWANA)
    def test_rodzaj_podstawy_z_warstwy(self, warstwa: str) -> None:
        podstawa = modul_loadera._zrodlo(warstwa, _dokument("NIEUSTALONE", wydanie=None))
        assert podstawa.rodzaj == RODZAJ_OCZEKIWANY[warstwa]
        assert podstawa.status == "NIEUSTALONE"

    def test_nieznany_stan_zrodla_odrzucony(self) -> None:
        with pytest.raises(ValueError, match="spoza słownika"):
            modul_loadera._zrodlo(
                "WOS",
                _dokument("WSKAZANE"),
                jednostka_redakcyjna="pkt 1",
                status="POTWIERDZONE",
            )

    def test_przeetykietowanie_nie_podnosi_stanu(self, katalog: Path) -> None:
        """Stan WSKAZANE w YAML bez jednostki redakcyjnej nie podnosi stanu — ani progów WOS,
        ani reguły pokrycia WiPWC (przegląd 2026-09-23 #3)."""

        def progi_wskazane(d: dict[str, Any]) -> None:
            d["progi_klas"]["status"] = "WSKAZANE"

        def pokrycie_wskazane(d: dict[str, Any]) -> None:
            d["pokrycie_certyfikatem"]["status"] = "WSKAZANE"

        _edytuj(katalog / "warstwy" / "wos.yaml", progi_wskazane)
        _edytuj(katalog / "warstwy" / "wipwc.yaml", pokrycie_wskazane)
        profil = _zloz(katalog)
        assert profil.klasyfikacja_zrodlo.status == "NIEUSTALONE"
        assert "brak jednostki redakcyjnej" in (profil.klasyfikacja_zrodlo.uwagi_pl or "")
        for wymaganie in profil.wymagania:
            assert wymaganie.pokrycie_zrodlo.status == "NIEUSTALONE"


# ---------------------------------------------------------------------------
# Złożenie warstw: OSD > WOS > zastane
# ---------------------------------------------------------------------------


class TestZlozenieWarstw:
    @pytest.mark.parametrize("operator_id", OPERATORZY)
    @pytest.mark.parametrize(
        ("grupa", "pole_zrodla"),
        [
            ("frequency_response", ("frequency_response", "zrodlo")),
            ("reactive_power", ("reactive_power", "zrodlo")),
            ("lvrt", ("voltage_levels", "lvrt_zrodlo")),
            ("hvrt", ("voltage_levels", "hvrt_zrodlo")),
            ("p_recovery_after_fault", ("p_recovery_after_fault", "zrodlo")),
        ],
    )
    def test_nadpisanie_osd_zastepuje_wartosc_zastana(
        self, operator_id: str, grupa: str, pole_zrodla: tuple[str, str]
    ) -> None:
        """Operator × grupa: nadpisanie OSD → podstawa OSD; brak nadpisania → wartość zastana
        ze stanem NIEUSTALONE (WOS nie niesie dziś parametrów technicznych)."""
        profil = load_nc_rfg_profile(operator_id)
        nadpisania = _surowe(f"operatorzy/{operator_id}.yaml").get("nadpisania") or {}
        podstawa = getattr(getattr(profil, pole_zrodla[0]), pole_zrodla[1])
        assert podstawa.status == "NIEUSTALONE"
        if grupa in nadpisania:
            assert podstawa.rodzaj == "OSD"
            assert "nadpisanie operatora" in (podstawa.uwagi_pl or "")
        else:
            assert podstawa.rodzaj == "NIEUSTALONA"

    def test_nadpisanie_hvrt_zmienia_wartosci(self) -> None:
        zastane = _surowe("warstwy/zastane.yaml")["parametry"]["hvrt"]["punkty"]
        nadpisane = _surowe("operatorzy/enea.yaml")["nadpisania"]["hvrt"]["punkty"]
        assert [p.time_s for p in load_nc_rfg_profile("pse").voltage_levels.hvrt] == [
            p["time_s"] for p in zastane
        ]
        assert [p.time_s for p in load_nc_rfg_profile("enea").voltage_levels.hvrt] == [
            p["time_s"] for p in nadpisane
        ]

    @pytest.mark.parametrize(
        ("w_wos", "w_osd", "rodzaj", "cos_phi"),
        [
            (False, False, "NIEUSTALONA", None),
            (True, False, "WOS", 0.9),
            (False, True, "OSD", 0.85),
            (True, True, "OSD", 0.85),
        ],
    )
    def test_pierwszenstwo_osd_nad_wos_nad_zastanymi(
        self,
        katalog: Path,
        w_wos: bool,
        w_osd: bool,
        rodzaj: str,
        cos_phi: float | None,
    ) -> None:
        """Iloczyn obecności grupy w WOS i w OSD: OSD > WOS > zastane; podstawa WOS z jednostką
        redakcyjną przy dokumencie WOS wskazanym jest WSKAZANA."""
        bierna = dict(_surowe("warstwy/zastane.yaml")["parametry"]["reactive_power"])
        if w_wos:

            def dodaj_wos(d: dict[str, Any]) -> None:
                d["parametry"] = {
                    "reactive_power": {
                        **bierna,
                        "cos_phi_min": 0.9,
                        "jednostka_redakcyjna": "pkt testowy",
                    }
                }

            _edytuj(katalog / "warstwy" / "wos.yaml", dodaj_wos)
        if w_osd:

            def dodaj_osd(d: dict[str, Any]) -> None:
                d["nadpisania"] = {"reactive_power": {**bierna, "cos_phi_min": 0.85}}

            _edytuj(katalog / "operatorzy" / "pse.yaml", dodaj_osd)
        profil = _zloz(katalog)
        assert profil.reactive_power.zrodlo.rodzaj == rodzaj
        oczekiwany_cos = bierna["cos_phi_min"] if cos_phi is None else cos_phi
        assert profil.reactive_power.cos_phi_min == oczekiwany_cos
        oczekiwany_stan = "WSKAZANE" if rodzaj == "WOS" else "NIEUSTALONE"
        assert profil.reactive_power.zrodlo.status == oczekiwany_stan

    @pytest.mark.parametrize(
        ("plik", "klucz"),
        [("operatorzy/pse.yaml", "nadpisania"), ("warstwy/wos.yaml", "parametry")],
    )
    def test_nieznana_grupa_parametrow_odrzucona(
        self, katalog: Path, plik: str, klucz: str
    ) -> None:
        """Grupa o nazwie spoza katalogu byłaby cicho ignorowana — odrzucenie, nie przemilczenie."""

        def dodaj(d: dict[str, Any]) -> None:
            d[klucz] = {"reactive_powr": {"cos_phi_min": 0.9}}

        _edytuj(katalog / plik, dodaj)
        with pytest.raises(ValueError, match="nieznane grupy"):
            _zloz(katalog)

    @pytest.mark.parametrize("zrodlo_parametru", ["zastane", "nadpisanie_osd"])
    @pytest.mark.parametrize(
        "naruszenie", ["prog_ponizej", "prog_powyzej", "statyzm_ponizej", "statyzm_powyzej"]
    )
    def test_granice_lfsm_o(self, katalog: Path, zrodlo_parametru: str, naruszenie: str) -> None:
        """Źródło parametru × strona granicy: próg LFSM-O poza [min; max] Hz albo statyzm poza
        [min; max] % (granice z warstwy NC RfG) → ValueError."""
        granice = load_nc_rfg_profile("pse").lfsm_o_granice
        f_n = load_nc_rfg_profile("pse").czestotliwosc_znamionowa_hz
        odpowiedz = dict(_surowe("warstwy/zastane.yaml")["parametry"]["frequency_response"])
        if naruszenie == "prog_ponizej":
            odpowiedz["dead_band_hz"] = (granice.prog_hz_min - f_n) - 0.01
        elif naruszenie == "prog_powyzej":
            odpowiedz["dead_band_hz"] = (granice.prog_hz_max - f_n) + 0.01
        elif naruszenie == "statyzm_ponizej":
            odpowiedz["pf_droop_percent"] = granice.statyzm_pct_min - 0.5
        else:
            odpowiedz["pf_droop_percent"] = granice.statyzm_pct_max + 0.5
        if zrodlo_parametru == "zastane":

            def zmien_zastane(d: dict[str, Any]) -> None:
                d["parametry"]["frequency_response"] = odpowiedz

            _edytuj(katalog / "warstwy" / "zastane.yaml", zmien_zastane)
        else:

            def zmien_osd(d: dict[str, Any]) -> None:
                d["nadpisania"] = {"frequency_response": odpowiedz}

            _edytuj(katalog / "operatorzy" / "pse.yaml", zmien_osd)
        with pytest.raises(ValueError, match="LFSM-O"):
            _zloz(katalog)

    @pytest.mark.parametrize("granica", ["statyzm_pct_min", "statyzm_pct_max"])
    def test_statyzm_na_granicy_przyjety(self, katalog: Path, granica: str) -> None:
        wartosc = getattr(load_nc_rfg_profile("pse").lfsm_o_granice, granica)

        def zmien(d: dict[str, Any]) -> None:
            d["parametry"]["frequency_response"]["pf_droop_percent"] = wartosc

        _edytuj(katalog / "warstwy" / "zastane.yaml", zmien)
        assert _zloz(katalog).frequency_response.pf_droop_percent == wartosc

    @pytest.mark.parametrize(
        ("klucz", "wartosc", "komunikat"),
        [
            ("b_od_kw", 1500, "maksimum NC RfG"),
            ("c_od_kw", 60000, "maksimum NC RfG"),
            ("d_od_kw", 80000, "maksimum NC RfG"),
            ("b_od_kw", 20000, "niespójne"),
        ],
    )
    def test_progi_wos_poza_granicami_nc_rfg_odrzucone(
        self, katalog: Path, klucz: str, wartosc: float, komunikat: str
    ) -> None:
        def zmien(d: dict[str, Any]) -> None:
            d["progi_klas"][klucz] = wartosc

        _edytuj(katalog / "warstwy" / "wos.yaml", zmien)
        with pytest.raises(ValueError, match=komunikat):
            modul_loadera._progi_klas(katalog / "warstwy")


# ---------------------------------------------------------------------------
# Klasyfikacja modułu
# ---------------------------------------------------------------------------


def _ponizej(x: float) -> float:
    return math.nextafter(x, 0.0)


_GRANICE_MOCY = [
    (0.0, None),
    (0.5, None),
    (_ponizej(0.8), None),
    (0.8, "A"),
    (_ponizej(200.0), "A"),
    (200.0, "B"),
    (_ponizej(10000.0), "B"),
    (10000.0, "C"),
    (_ponizej(75000.0), "C"),
    (75000.0, "D"),
    (250000.0, "D"),
]


class TestKlasyfikacja:
    @pytest.mark.parametrize("napiecie_kv", [0.4, 15.0, 30.0, _ponizej(110.0)])
    @pytest.mark.parametrize(("p_max_kw", "oczekiwany"), _GRANICE_MOCY)
    def test_granice_mocy_ponizej_110_kv(
        self, p_max_kw: float, napiecie_kv: float, oczekiwany: str | None
    ) -> None:
        """Moc na granicy ±ε × napięcie nN/SN (i tuż poniżej 110 kV): progi WOS (decyzja O-1)
        — typ A od progu istotności 0,8 kW, B od 200 kW, C od 10 MW, D od 75 MW."""
        assert klasyfikuj_modul(p_max_kw, napiecie_kv) == oczekiwany
        assert klasyfikacja_modulu(p_max_kw, napiecie_kv).modul == oczekiwany

    @pytest.mark.parametrize("napiecie_kv", [110.0, 220.0])
    @pytest.mark.parametrize(("p_max_kw", "_moc_bez_napiecia"), _GRANICE_MOCY)
    def test_od_110_kv_wlacznie_zawsze_typ_d(
        self, p_max_kw: float, _moc_bez_napiecia: str | None, napiecie_kv: float
    ) -> None:
        """Reguła napięciowa typu D obejmuje 110 kV WŁĄCZNIE i każdą moc (także < 0,8 kW)."""
        assert klasyfikuj_modul(p_max_kw, napiecie_kv) == "D"
        powod = klasyfikacja_modulu(p_max_kw, napiecie_kv).powod_pl
        assert "typ D niezależnie od mocy" in powod

    def test_klasyfikacja_niesie_podstawe_wos_i_progi(self) -> None:
        wynik = klasyfikacja_modulu(500.0, 15.0)
        assert wynik.modul == "B"
        assert wynik.prog_min_kw == 0.8
        assert wynik.progi_kw == {"B": 200.0, "C": 10000.0, "D": 75000.0}
        assert wynik.napiecie_d_kv == 110.0
        assert wynik.podstawa.rodzaj == "WOS"
        assert wynik.podstawa.status == "NIEUSTALONE"
        assert wynik.podstawa.jednostka_redakcyjna is None
        assert wynik.podstawa.uwagi_pl == UWAGA_PROGOW_WOS
        for operator_id in OPERATORZY:
            assert load_nc_rfg_profile(operator_id).klasyfikacja_zrodlo == wynik.podstawa

    @pytest.mark.parametrize(
        ("p_max_kw", "napiecie_kv", "powod"),
        [
            (
                0.5,
                0.4,
                "moc 0,5 kW < 0,8 kW → moduł poniżej progu istotności art. 5 ust. 2 lit. a — "
                "wymagania NC RfG nie mają zastosowania",
            ),
            (
                100.0,
                110.0,
                "napięcie przyłączenia 110 kV ≥ 110 kV → typ D niezależnie od mocy "
                "(NC RfG art. 5 ust. 2 lit. d)",
            ),
            (
                500.0,
                15.0,
                "moc 500 kW w przedziale [200; 10000) kW (progi typów B i C wg WOS) przy "
                "napięciu przyłączenia 15 kV < 110 kV → typ B",
            ),
            (
                199.99999,
                0.4,
                "moc 199,99999 kW w przedziale [0,8; 200) kW (próg istotności NC RfG art. 5 "
                "ust. 2 lit. a i próg typu B wg WOS) przy napięciu przyłączenia 0,4 kV < 110 kV "
                "→ typ A",
            ),
            (
                20000.0,
                30.0,
                "moc 20000 kW w przedziale [10000; 75000) kW (progi typów C i D wg WOS) przy "
                "napięciu przyłączenia 30 kV < 110 kV → typ C",
            ),
            (
                75000.0,
                30.0,
                "moc 75000 kW ≥ 75000 kW (próg typu D wg WOS) przy napięciu przyłączenia "
                "30 kV < 110 kV → typ D",
            ),
        ],
    )
    def test_powod_nazywa_regule(self, p_max_kw: float, napiecie_kv: float, powod: str) -> None:
        """Powód nazywa regułę, która zadecydowała; zapis liczby dokładny (bez zaokrąglenia do
        progu na granicy)."""
        assert klasyfikacja_modulu(p_max_kw, napiecie_kv).powod_pl == powod

    @pytest.mark.parametrize(("p_max_kw", "_klasa"), _GRANICE_MOCY)
    @pytest.mark.parametrize("napiecie_kv", [0.4, 15.0, 110.0])
    def test_powod_nigdy_nie_twierdzi_ze_urzadzenie_nie_jest_modulem(
        self, p_max_kw: float, _klasa: str | None, napiecie_kv: float
    ) -> None:
        powod = klasyfikacja_modulu(p_max_kw, napiecie_kv).powod_pl
        assert "nie jest modułem" not in powod
        assert powod.strip()

    @pytest.mark.parametrize("nazwa", ["p_max_kw", "napiecie_kv"])
    @pytest.mark.parametrize("wartosc", [math.nan, math.inf, -1.0])
    def test_wejscie_nieskonczone_albo_ujemne_odrzucone(self, nazwa: str, wartosc: float) -> None:
        argumenty = {"p_max_kw": 5.0, "napiecie_kv": 0.4, nazwa: wartosc}
        with pytest.raises(ValueError, match=nazwa):
            klasyfikacja_modulu(**argumenty)

    def test_prog_minimalny_to_prog_klasyfikacji(self) -> None:
        assert prog_minimalny_modulu_kw() == klasyfikacja_modulu(1.0, 0.4).prog_min_kw

    @pytest.mark.parametrize("operator_id", OPERATORZY)
    def test_klasy_modulow_profilu_zgodne_z_klasyfikacja(self, operator_id: str) -> None:
        """Opis klas w profilu i funkcja klasyfikacji czytają te same progi (predykaty parami)."""
        for klasa in load_nc_rfg_profile(operator_id).module_types:
            assert klasyfikuj_modul(klasa.threshold_kw_min, 15.0) == klasa.id
            if klasa.threshold_kw_max is not None:
                assert klasyfikuj_modul(_ponizej(klasa.threshold_kw_max), 15.0) == klasa.id


# ---------------------------------------------------------------------------
# Warstwa WiPWC: rejestr, wersje, pokrycie certyfikatem
# ---------------------------------------------------------------------------

_PROFIL_PSE = load_nc_rfg_profile("pse")
_WPISY_SUROWE: dict[str, dict[str, Any]] = {
    wpis["id"]: wpis
    for plik in ("warstwy/nc_rfg.yaml", "warstwy/zastane.yaml", "warstwy/magazyny.yaml")
    for wpis in _surowe(plik).get("wymagania") or []
}
_POKRYCIE_SUROWE: dict[str, list[str]] = _surowe("warstwy/wipwc.yaml")["pokrycie_certyfikatem"][
    "wymagania"
]


def _sposob_z_danych_surowych(
    identyfikator: str, typ: str | None, technologia: str, certyfikat: bool
) -> str:
    """Wyrocznia z surowych YAML (typy, technologie, testy z warstwy wymagań; pokrycie z WiPWC)."""
    wpis = _WPISY_SUROWE[identyfikator]
    if typ is None or typ not in wpis["typy"] or technologia not in wpis["technologie"]:
        return "NIE_DOTYCZY"
    if certyfikat and typ in _POKRYCIE_SUROWE.get(identyfikator, []):
        return "CERTYFIKAT"
    return "TEST" if wpis["testy"] else "BRAK_METODY"


class TestWipwc:
    def test_rejestr_wskazany_nie_skopiowany(self) -> None:
        """Warstwa WiPWC WSKAZUJE istniejący snapshot wykazu — żadnej kopii rekordów."""
        rejestr = _PROFIL_PSE.wipwc.rejestr
        assert (_KATALOG_ZRODEL / rejestr.plik).resolve() == SNAPSHOT_PATH.resolve()
        assert rejestr.schemat == SNAPSHOT_SCHEMA
        surowa = _surowe("warstwy/wipwc.yaml")
        assert set(surowa) == {"warstwa", "dokument", "wersje", "rejestr", "pokrycie_certyfikatem"}

    def test_wersje_wykazu_zgodne_ze_snapshotem(self) -> None:
        """Wersje i daty publikacji DOKŁADNIE ze snapshotu; wydanie i adres jak w manifeście."""
        manifest = get_ptpiree_catalog_manifest()
        z_manifestu = {z["wipwc_version"]: z["publication_date"] for z in manifest["sources"]}
        z_profilu = {w.wersja: w.data_publikacji.isoformat() for w in _PROFIL_PSE.wipwc.wersje}
        assert z_profilu == z_manifestu
        dokument = _PROFIL_PSE.wersja_warstwy("WIPWC", None)
        assert dokument.wydanie == manifest["current_wipwc_version"]
        assert dokument.adres == manifest["source_page_url"]
        assert dokument.status == "WSKAZANE"
        biezaca = next(w for w in _PROFIL_PSE.wipwc.wersje if w.wersja == dokument.wydanie)
        assert biezaca.akceptowana_od is not None
        assert biezaca.akceptowana_od.isoformat() == manifest["accepted_from"]
        assert dokument.obowiazuje_od == biezaca.akceptowana_od

    @pytest.mark.parametrize(
        ("opis", "zmiana", "komunikat"),
        [
            ("obowiązywanie ≠ akceptacja", ("dokument", "obowiazuje_od", "2024-12-01"), "obowiąz"),
            ("wydanie spoza wersji", ("dokument", "wydanie", "1.4"), "spoza wersji"),
            ("rejestr nie istnieje", ("rejestr", "plik", "brak/rejestru.json"), "nie istnieje"),
        ],
    )
    def test_wadliwa_warstwa_wipwc_odrzucona(
        self, katalog: Path, opis: str, zmiana: tuple[str, str, str], komunikat: str
    ) -> None:
        sekcja, klucz, wartosc = zmiana

        def zmien(d: dict[str, Any]) -> None:
            d[sekcja][klucz] = wartosc

        _edytuj(katalog / "warstwy" / "wipwc.yaml", zmien)
        with pytest.raises(ValueError, match=komunikat):
            _zloz(katalog)

    def test_powtorzona_albo_odwrocona_wersja_odrzucona(self, katalog: Path) -> None:
        def powtorz(d: dict[str, Any]) -> None:
            d["wersje"].append(dict(d["wersje"][0]))

        _edytuj(katalog / "warstwy" / "wipwc.yaml", powtorz)
        with pytest.raises(ValueError, match="powtórzone wersje"):
            _zloz(katalog)
        with pytest.raises(ValidationError, match="odwrócone"):
            modul_loadera.WersjaWykazuWipwc(
                wersja="9",
                data_publikacji=date(2026, 1, 1),
                akceptowana_od=date(2026, 6, 1),
                akceptowana_do=date(2026, 1, 1),
            )

    @pytest.mark.parametrize("operator_id", OPERATORZY)
    def test_pokrycie_przeniesione_jeden_do_jednego(self, operator_id: str) -> None:
        profil = load_nc_rfg_profile(operator_id)
        assert {w.id: w.certyfikat_pokrywa_typy for w in profil.wymagania} == (
            POKRYCIE_SPRZED_KARTY
        )

    def test_pole_pokrycia_zniknelo_z_warstw_wymagan(self) -> None:
        for plik in ("warstwy/nc_rfg.yaml", "warstwy/zastane.yaml"):
            for wpis in _surowe(plik)["wymagania"]:
                assert "certyfikat_pokrywa_typy" not in wpis, (plik, wpis["id"])

    @pytest.mark.parametrize("operator_id", OPERATORZY)
    def test_podstawa_pokrycia_wipwc_nieustalona(self, operator_id: str) -> None:
        for wymaganie in load_nc_rfg_profile(operator_id).wymagania:
            podstawa = wymaganie.pokrycie_zrodlo
            assert podstawa.rodzaj == "WIPWC"
            assert podstawa.status == "NIEUSTALONE"
            assert podstawa.wydanie == "1.3"
            assert podstawa.jednostka_redakcyjna is None
            assert podstawa.uwagi_pl == UWAGA_POKRYCIA

    def test_wyrocznia_obejmuje_caly_katalog(self) -> None:
        assert set(_WPISY_SUROWE) == {w.id for w in _PROFIL_PSE.wymagania}

    @pytest.mark.parametrize("certyfikat", [True, False])
    @pytest.mark.parametrize("technologia", ["PPM", "SPGM", "MAGAZYN"])
    @pytest.mark.parametrize("typ", ["A", "B", "C", "D", None])
    @pytest.mark.parametrize(
        "wymaganie", _PROFIL_PSE.wymagania, ids=[w.id for w in _PROFIL_PSE.wymagania]
    )
    def test_sposob_wykazania_iloczyn_cech(
        self,
        wymaganie: WymaganieRegulacyjne,
        typ: str | None,
        technologia: str,
        certyfikat: bool,
    ) -> None:
        """KAŻDE wymaganie katalogu × typ × technologia × certyfikat → sposób wykazania zgodny
        z danymi surowymi warstw (pokrycie czytane z WiPWC, nie z warstwy wymagań)."""
        assert wymaganie.sposob_wykazania(typ, technologia, certyfikat) == (
            _sposob_z_danych_surowych(wymaganie.id, typ, technologia, certyfikat)
        )

    @pytest.mark.parametrize(
        ("identyfikator", "typ", "technologia", "certyfikat", "oczekiwany"),
        [
            ("RFG_13_1A", "A", "PPM", True, "CERTYFIKAT"),
            ("RFG_13_1A", "A", "PPM", False, "BRAK_METODY"),
            ("RFG_13_2", "A", "PPM", False, "TEST"),
            ("RFG_13_2", "B", "SPGM", True, "CERTYFIKAT"),
            ("RFG_13_2", "A", "MAGAZYN", True, "NIE_DOTYCZY"),
            ("RFG_13_6", "B", "PPM", True, "NIE_DOTYCZY"),
            ("RFG_14_2", "B", "PPM", True, "CERTYFIKAT"),
            ("RFG_14_3", "B", "PPM", True, "TEST"),
            ("RFG_14_3", "A", "PPM", True, "NIE_DOTYCZY"),
            ("RFG_14_4", "B", "PPM", True, "BRAK_METODY"),
            ("RFG_20_2B", "B", "SPGM", False, "NIE_DOTYCZY"),
            ("RFG_20_2B", "B", "PPM", True, "TEST"),
            ("ZASTANE_HVRT", "B", "SPGM", True, "TEST"),
            ("RFG_13_1B", None, "PPM", True, "NIE_DOTYCZY"),
        ],
    )
    def test_sposob_wykazania_punkty_zakotwiczenia(
        self,
        identyfikator: str,
        typ: str | None,
        technologia: str,
        certyfikat: bool,
        oczekiwany: str,
    ) -> None:
        """Wartości przypięte literalnie — niezależnie od wyroczni z danych surowych."""
        wymaganie = _PROFIL_PSE.wymaganie(identyfikator)
        assert wymaganie.sposob_wykazania(typ, technologia, certyfikat) == oczekiwany

    def test_pokrycie_dla_nieistniejacego_wymagania_odrzucone(self, katalog: Path) -> None:
        def dodaj(d: dict[str, Any]) -> None:
            d["pokrycie_certyfikatem"]["wymagania"]["RFG_99_9"] = ["A"]

        _edytuj(katalog / "warstwy" / "wipwc.yaml", dodaj)
        with pytest.raises(ValueError, match="spoza katalogu"):
            _zloz(katalog)

    def test_pokrycie_typu_spoza_wymagania_odrzucone(self, katalog: Path) -> None:
        def dodaj(d: dict[str, Any]) -> None:
            d["pokrycie_certyfikatem"]["wymagania"]["RFG_13_6"] = ["A", "B"]

        _edytuj(katalog / "warstwy" / "wipwc.yaml", dodaj)
        with pytest.raises(ValueError, match="nie dotyczy"):
            _zloz(katalog)


# ---------------------------------------------------------------------------
# Warstwa magazynów energii
# ---------------------------------------------------------------------------


class TestMagazyny:
    @pytest.mark.parametrize("operator_id", OPERATORZY)
    def test_zadne_wymaganie_nc_rfg_nie_dotyczy_magazynu(self, operator_id: str) -> None:
        """Operator × wymaganie × typ × certyfikat: magazyn (art. 3 ust. 2 lit. d) → NIE_DOTYCZY."""
        for wymaganie in load_nc_rfg_profile(operator_id).wymagania:
            assert "MAGAZYN" not in wymaganie.technologie
            for typ in ("A", "B", "C", "D"):
                assert not wymaganie.dotyczy(typ, "MAGAZYN")
                for certyfikat in (True, False):
                    assert wymaganie.sposob_wykazania(typ, "MAGAZYN", certyfikat) == ("NIE_DOTYCZY")

    @pytest.mark.parametrize("operator_id", OPERATORZY)
    def test_warstwa_magazynow_obecna_nieustalona_pusta(self, operator_id: str) -> None:
        dokument = load_nc_rfg_profile(operator_id).wersja_warstwy("MAGAZYNY", None)
        assert dokument.status == "NIEUSTALONE"
        assert dokument.wydanie is None
        assert "magazyn" in dokument.tytul.lower()
        assert _surowe("warstwy/magazyny.yaml")["wymagania"] == []

    def test_wymaganie_warstwy_magazynow_ma_rodzaj_osd(self, katalog: Path) -> None:
        def dodaj(d: dict[str, Any]) -> None:
            d["wymagania"] = [
                {
                    "id": "MAG_PROBA",
                    "nazwa_pl": "Wymaganie próbne warstwy magazynów",
                    "typy": ["A", "B"],
                    "technologie": ["MAGAZYN"],
                    "jednostka_redakcyjna": None,
                    "testy": [],
                }
            ]

        _edytuj(katalog / "warstwy" / "magazyny.yaml", dodaj)
        wymaganie = _zloz(katalog).wymaganie("MAG_PROBA")
        assert wymaganie.zrodlo.rodzaj == "OSD"
        assert wymaganie.zrodlo.status == "NIEUSTALONE"
        assert "magazyn" in (wymaganie.zrodlo.uwagi_pl or "")
        assert wymaganie.dotyczy("A", "MAGAZYN")
        assert not wymaganie.dotyczy("A", "PPM")
        assert wymaganie.sposob_wykazania("B", "MAGAZYN", True) == "BRAK_METODY"

    @pytest.mark.parametrize(
        ("plik", "technologie"),
        [
            ("warstwy/nc_rfg.yaml", ["PPM", "MAGAZYN"]),
            ("warstwy/zastane.yaml", ["SPGM", "MAGAZYN"]),
            ("warstwy/magazyny.yaml", ["PPM"]),
        ],
    )
    def test_technologia_spoza_warstwy_odrzucona(
        self, katalog: Path, plik: str, technologie: list[str]
    ) -> None:
        def zmien(d: dict[str, Any]) -> None:
            if d["wymagania"]:
                d["wymagania"][0]["technologie"] = technologie
            else:
                d["wymagania"] = [
                    {
                        "id": "MAG_PROBA",
                        "nazwa_pl": "Wymaganie próbne",
                        "typy": ["A"],
                        "technologie": technologie,
                        "jednostka_redakcyjna": None,
                        "testy": [],
                    }
                ]

        _edytuj(katalog / plik, zmien)
        with pytest.raises(ValueError, match="spoza zakresu warstwy"):
            _zloz(katalog)


# ---------------------------------------------------------------------------
# Bank Nastaw
# ---------------------------------------------------------------------------

SLOWNIK_NASTAW = (
    "u_min_pu",
    "u_min_czas_s",
    "u_max_pu",
    "u_max_czas_s",
    "f_min_hz",
    "f_min_czas_s",
    "f_max_hz",
    "f_max_czas_s",
    "rocof_hz_s",
    "rocof_czas_s",
    "przesuniecie_fazy_deg",
)


def _pozycja_surowa(**zmiany: Any) -> dict[str, Any]:
    pozycja = {
        "id": "u_min_pu",
        "nazwa_pl": "Próg podnapięciowy",
        "wartosc": 0.8,
        "jednostka": "p.u. (U_n)",
        "jednostka_redakcyjna": "pkt testowy",
    }
    pozycja.update(zmiany)
    return pozycja


def _operator_wskazany(d: dict[str, Any]) -> None:
    d["dokument"] = {
        "tytul": "IRiESD próbna",
        "wydanie": "1",
        "status": "WSKAZANE",
        "obowiazuje_od": None,
    }


class TestBankNastaw:
    @pytest.mark.parametrize("operator_id", OPERATORZY)
    def test_bank_kazdego_operatora_nieustalony_i_pusty(self, operator_id: str) -> None:
        bank = load_nc_rfg_profile(operator_id).bank_nastaw
        assert bank.status == "NIEUSTALONE"
        assert bank.pozycje == ()
        assert bank.uwagi_pl == UWAGA_BANKU

    def test_slownik_nastaw_zamkniety(self) -> None:
        assert get_args(NastawaBanku) == SLOWNIK_NASTAW
        assert dict(JEDNOSTKI_NASTAW) == {
            "u_min_pu": "p.u. (U_n)",
            "u_min_czas_s": "s",
            "u_max_pu": "p.u. (U_n)",
            "u_max_czas_s": "s",
            "f_min_hz": "Hz",
            "f_min_czas_s": "s",
            "f_max_hz": "Hz",
            "f_max_czas_s": "s",
            "rocof_hz_s": "Hz/s",
            "rocof_czas_s": "s",
            "przesuniecie_fazy_deg": "deg",
        }

    @pytest.mark.parametrize("identyfikator", SLOWNIK_NASTAW)
    def test_pozycja_bez_podstawy_odrzucona(self, identyfikator: str) -> None:
        with pytest.raises(ValidationError, match="bez podstawy"):
            PozycjaBankuNastaw(
                id=identyfikator,
                nazwa_pl="Nastawa",
                wartosc=1.0,
                jednostka=JEDNOSTKI_NASTAW[identyfikator],
                zrodlo=_podstawa_osd("NIEUSTALONE", None),
            )

    @pytest.mark.parametrize(
        ("zmiany", "komunikat"),
        [
            ({"id": "u_min_kv"}, "u_min_kv"),
            ({"jednostka": "s"}, "słownik"),
            ({"jednostka": "p.u."}, "bez nazwanej bazy"),
            ({"wartosc": math.nan}, "finite"),
        ],
    )
    def test_pozycja_spoza_kontraktu_odrzucona(
        self, zmiany: dict[str, Any], komunikat: str
    ) -> None:
        dane = _pozycja_surowa(**zmiany)
        dane.pop("jednostka_redakcyjna")
        with pytest.raises(ValidationError, match=komunikat):
            PozycjaBankuNastaw(**dane, zrodlo=_podstawa_osd("WSKAZANE"))

    def test_pozycja_w_pliku_operatora_bez_podstawy_odrzucona(self, katalog: Path) -> None:
        """Dokument operatora NIEUSTALONE → pozycja z jednostką i tak nie ma podstawy."""

        def dodaj(d: dict[str, Any]) -> None:
            d["bank_nastaw"]["pozycje"] = [_pozycja_surowa()]

        _edytuj(katalog / "operatorzy" / "pse.yaml", dodaj)
        with pytest.raises(ValueError, match="bez podstawy"):
            _zloz(katalog)

    def test_pozycja_z_podstawa_przyjeta(self, katalog: Path) -> None:
        def dodaj(d: dict[str, Any]) -> None:
            _operator_wskazany(d)
            d["bank_nastaw"]["pozycje"] = [_pozycja_surowa()]

        _edytuj(katalog / "operatorzy" / "pse.yaml", dodaj)
        bank = _zloz(katalog).bank_nastaw
        assert len(bank.pozycje) == 1
        assert bank.pozycje[0].zrodlo.rodzaj == "OSD"
        assert bank.pozycje[0].zrodlo.status == "WSKAZANE"
        assert bank.pozycje[0].zrodlo.jednostka_redakcyjna == "pkt testowy"
        assert bank.status == "NIEUSTALONE"

    def test_pozycja_z_dokumentem_wskazanym_bez_jednostki_odrzucona(self, katalog: Path) -> None:
        def dodaj(d: dict[str, Any]) -> None:
            _operator_wskazany(d)
            pozycja = _pozycja_surowa()
            pozycja.pop("jednostka_redakcyjna")
            d["bank_nastaw"]["pozycje"] = [pozycja]

        _edytuj(katalog / "operatorzy" / "pse.yaml", dodaj)
        with pytest.raises(ValueError, match="bez podstawy"):
            _zloz(katalog)

    def test_spojnosc_sekcji_banku(self) -> None:
        pozycja = PozycjaBankuNastaw(
            id="f_max_hz",
            nazwa_pl="Próg nadczęstotliwościowy",
            wartosc=51.5,
            jednostka="Hz",
            zrodlo=_podstawa_osd("WSKAZANE"),
        )
        with pytest.raises(ValidationError, match="pusty zbiór"):
            BankNastaw(status="WSKAZANE", uwagi_pl=None, pozycje=())
        with pytest.raises(ValidationError, match="wymaga uwag"):
            BankNastaw(status="NIEUSTALONE", uwagi_pl=None, pozycje=())
        with pytest.raises(ValidationError, match="mocniejszy"):
            BankNastaw(status="ZWERYFIKOWANE", uwagi_pl=None, pozycje=(pozycja,))
        with pytest.raises(ValidationError, match="powtórzone"):
            BankNastaw(status="WSKAZANE", uwagi_pl=None, pozycje=(pozycja, pozycja))
        assert BankNastaw(status="WSKAZANE", uwagi_pl=None, pozycje=(pozycja,)).pozycje

    @pytest.mark.parametrize("sekcja", ["bank_nastaw", "wykonanie_prawa"])
    @pytest.mark.parametrize("operator_id", OPERATORZY)
    def test_plik_operatora_bez_obowiazkowej_sekcji_odrzucony(
        self, katalog: Path, sekcja: str, operator_id: str
    ) -> None:
        _edytuj(katalog / "operatorzy" / f"{operator_id}.yaml", lambda d: d.pop(sekcja))
        with pytest.raises(ValueError, match=sekcja):
            _zloz(katalog, operator_id)


# ---------------------------------------------------------------------------
# Prawo operatora do określenia wymagania
# ---------------------------------------------------------------------------

WYMAGANIA_Z_PRAWEM = {"RFG_20_2A", "RFG_20_2B", "RFG_17_2"}


class TestPrawoOperatora:
    @pytest.mark.parametrize("operator_id", OPERATORZY)
    def test_prawo_operatora_dokladnie_trzy_wymagania(self, operator_id: str) -> None:
        profil = load_nc_rfg_profile(operator_id)
        assert {w.id for w in profil.wymagania if w.prawo_operatora} == WYMAGANIA_Z_PRAWEM

    @pytest.mark.parametrize("operator_id", OPERATORZY)
    def test_wykonanie_prawa_nieustalone_u_kazdego_operatora(self, operator_id: str) -> None:
        for wymaganie in load_nc_rfg_profile(operator_id).wymagania:
            assert wymaganie.operator_skorzystal_z_prawa is None
            if wymaganie.prawo_operatora:
                podstawa = wymaganie.wykonanie_prawa_zrodlo
                assert podstawa is not None
                assert (podstawa.rodzaj, podstawa.status) == ("OSD", "NIEUSTALONE")
                assert "IRiESD" in (podstawa.uwagi_pl or "")
            else:
                assert wymaganie.wykonanie_prawa_zrodlo is None

    @pytest.mark.parametrize("identyfikator", ["RFG_13_2", "RFG_99_9"])
    def test_wykonanie_prawa_dla_wymagania_bez_prawa_odrzucone(
        self, katalog: Path, identyfikator: str
    ) -> None:
        def dodaj(d: dict[str, Any]) -> None:
            _operator_wskazany(d)
            d["wykonanie_prawa"]["wymagania"] = {
                identyfikator: {"skorzystal": True, "jednostka_redakcyjna": "pkt testowy"}
            }

        _edytuj(katalog / "operatorzy" / "pse.yaml", dodaj)
        with pytest.raises(ValueError, match="nie przyznaje operatorowi prawa"):
            _zloz(katalog)

    def test_flaga_bez_podstawy_odrzucona(self, katalog: Path) -> None:
        """Dokument operatora NIEUSTALONE: flaga (także False) byłaby wartością bez podstawy."""

        def dodaj(d: dict[str, Any]) -> None:
            d["wykonanie_prawa"]["wymagania"] = {
                "RFG_20_2A": {"skorzystal": False, "jednostka_redakcyjna": "pkt testowy"}
            }

        _edytuj(katalog / "operatorzy" / "pse.yaml", dodaj)
        with pytest.raises(ValueError, match="bez podstawy"):
            _zloz(katalog)

    @pytest.mark.parametrize("skorzystal", [True, False])
    def test_flaga_z_podstawa_przyjeta(self, katalog: Path, skorzystal: bool) -> None:
        def dodaj(d: dict[str, Any]) -> None:
            _operator_wskazany(d)
            d["wykonanie_prawa"]["wymagania"] = {
                "RFG_20_2A": {"skorzystal": skorzystal, "jednostka_redakcyjna": "pkt testowy"}
            }

        _edytuj(katalog / "operatorzy" / "pse.yaml", dodaj)
        profil = _zloz(katalog)
        wymaganie = profil.wymaganie("RFG_20_2A")
        assert wymaganie.operator_skorzystal_z_prawa is skorzystal
        assert wymaganie.wykonanie_prawa_zrodlo is not None
        assert wymaganie.wykonanie_prawa_zrodlo.status == "WSKAZANE"
        assert wymaganie.wykonanie_prawa_zrodlo.jednostka_redakcyjna == "pkt testowy"
        pozostale = profil.wymaganie("RFG_20_2B")
        assert pozostale.operator_skorzystal_z_prawa is None
        assert pozostale.wykonanie_prawa_zrodlo is not None
        assert pozostale.wykonanie_prawa_zrodlo.status == "NIEUSTALONE"

    def test_prawo_operatora_musi_byc_wartoscia_logiczna(self, katalog: Path) -> None:
        def zmien(d: dict[str, Any]) -> None:
            d["wymagania"][0]["prawo_operatora"] = "false"

        _edytuj(katalog / "warstwy" / "nc_rfg.yaml", zmien)
        with pytest.raises(ValueError, match="wartością logiczną"):
            _zloz(katalog)

    @pytest.mark.parametrize(
        ("prawo", "flaga", "podstawa", "komunikat"),
        [
            (False, None, "NIEUSTALONE", "nie ma prawa"),
            (False, True, "WSKAZANE", "nie ma prawa"),
            (True, None, None, "bez podstawy stanu"),
            (True, False, "NIEUSTALONE", "bez podstawy"),
        ],
    )
    def test_walidator_wymagania_spina_flagi_prawa(
        self,
        prawo: bool,
        flaga: bool | None,
        podstawa: StatusZrodla | None,
        komunikat: str,
    ) -> None:
        dane = _PROFIL_PSE.wymaganie("RFG_20_2A").model_dump()
        dane.update(
            prawo_operatora=prawo,
            operator_skorzystal_z_prawa=flaga,
            wykonanie_prawa_zrodlo=None if podstawa is None else _podstawa_osd(podstawa),
        )
        with pytest.raises(ValidationError, match=komunikat):
            WymaganieRegulacyjne.model_validate(dane)


# ---------------------------------------------------------------------------
# Program badań
# ---------------------------------------------------------------------------


def _scenariusz_surowy(**zmiany: Any) -> dict[str, Any]:
    scenariusz = {
        "id": "S_PROBA",
        "test_id": "T14",
        "opis_pl": "Zapad próbny",
        "parametry": {"u_resztkowe": 0.05, "czas_zapadu": 0.15},
        "jednostki": {"u_resztkowe": "p.u. (U_n)", "czas_zapadu": "s"},
        "jednostka_redakcyjna": "pkt testowy",
    }
    scenariusz.update(zmiany)
    return scenariusz


class TestProgramBadan:
    @pytest.mark.parametrize("operator_id", OPERATORZY)
    def test_program_nieustalony_i_pusty(self, operator_id: str) -> None:
        program = load_nc_rfg_profile(operator_id).program_badan
        assert program.status == "NIEUSTALONE"
        assert program.scenariusze == ()
        assert program.uwagi_pl == UWAGA_PROGRAMU

    def test_scenariusz_z_podstawa_przyjety(self, katalog: Path) -> None:
        def dodaj(d: dict[str, Any]) -> None:
            d["program_badan"]["scenariusze"] = [_scenariusz_surowy()]

        _edytuj(katalog / "warstwy" / "procedura_ptpiree.yaml", dodaj)
        scenariusz = _zloz(katalog).program_badan.scenariusze[0]
        assert scenariusz.zrodlo.rodzaj == "PROCEDURA_PTPIREE"
        assert scenariusz.zrodlo.status == "WSKAZANE"
        assert scenariusz.parametry == {"u_resztkowe": 0.05, "czas_zapadu": 0.15}

    @pytest.mark.parametrize(
        ("zmiany", "blad", "komunikat"),
        [
            ({"jednostka_redakcyjna": None}, ValueError, "bez podstawy"),
            ({"test_id": "T99"}, ValueError, "nie wykazuje żadnego wymagania"),
            ({"test_id": "T1"}, ValueError, "spoza Tnn"),
            ({"jednostki": {"u_resztkowe": "p.u. (U_n)"}}, ValueError, "bez jednostki"),
            ({"jednostki": {"u_resztkowe": "pu", "czas_zapadu": "s"}}, ValueError, "bazy"),
            ({"parametry": {}, "jednostki": {}}, ValueError, "brak parametrów"),
        ],
    )
    def test_scenariusz_spoza_kontraktu_odrzucony(
        self, katalog: Path, zmiany: dict[str, Any], blad: type[Exception], komunikat: str
    ) -> None:
        def dodaj(d: dict[str, Any]) -> None:
            d["program_badan"]["scenariusze"] = [_scenariusz_surowy(**zmiany)]

        _edytuj(katalog / "warstwy" / "procedura_ptpiree.yaml", dodaj)
        with pytest.raises(blad, match=komunikat):
            _zloz(katalog)

    def test_scenariusz_bez_podstawy_odrzucony_przy_konstrukcji(self) -> None:
        dane = _scenariusz_surowy()
        dane.pop("jednostka_redakcyjna")
        with pytest.raises(ValidationError, match="bez podstawy"):
            ScenariuszBadania(
                **dane,
                zrodlo=PodstawaWymagania(
                    rodzaj="PROCEDURA_PTPIREE", dokument="Procedura", status="NIEUSTALONE"
                ),
            )

    def test_program_pusty_nie_moze_byc_wskazany(self) -> None:
        with pytest.raises(ValidationError, match="pusty zbiór"):
            ProgramBadan(status="WSKAZANE", uwagi_pl=None, scenariusze=())

    def test_brak_sekcji_programu_odrzucony(self, katalog: Path) -> None:
        _edytuj(katalog / "warstwy" / "procedura_ptpiree.yaml", lambda d: d.pop("program_badan"))
        with pytest.raises(ValueError, match="program_badan"):
            _zloz(katalog)


# ---------------------------------------------------------------------------
# Wersje warstw po dacie
# ---------------------------------------------------------------------------

UWAGA_BEZ_DATY = "wersja dobrana bez daty obowiązywania (nieustalona)"


class TestWersjeWarstw:
    @pytest.mark.parametrize("operator_id", OPERATORZY)
    def test_daty_obowiazywania_nieustalone_poza_wipwc(self, operator_id: str) -> None:
        daty = {w.warstwa: w.obowiazuje_od for w in load_nc_rfg_profile(operator_id).warstwy}
        manifest = get_ptpiree_catalog_manifest()
        assert daty.pop("WIPWC") == date.fromisoformat(manifest["accepted_from"])
        assert set(daty.values()) == {None}

    @pytest.mark.parametrize("warstwa", KOLEJNOSC_OCZEKIWANA)
    def test_wersja_bez_daty_to_dokument_warstwy(self, warstwa: str) -> None:
        pozycja = next(w for w in _PROFIL_PSE.warstwy if w.warstwa == warstwa)
        dokument = _PROFIL_PSE.wersja_warstwy(warstwa, None)
        assert dokument.model_dump() == pozycja.model_dump(exclude={"warstwa"})

    @pytest.mark.parametrize("data", [date(2019, 1, 1), date(2026, 9, 23)])
    @pytest.mark.parametrize("warstwa", [w for w in KOLEJNOSC_OCZEKIWANA if w != "WIPWC"])
    def test_data_przy_nieustalonym_obowiazywaniu_daje_uwage(
        self, warstwa: str, data: date
    ) -> None:
        pozycja = next(w for w in _PROFIL_PSE.warstwy if w.warstwa == warstwa)
        dokument = _PROFIL_PSE.wersja_warstwy(warstwa, data)
        assert UWAGA_BEZ_DATY in (dokument.uwagi_pl or "")
        assert dokument.status == pozycja.status
        assert (dokument.tytul, dokument.wydanie) == (pozycja.tytul, pozycja.wydanie)

    @pytest.mark.parametrize(
        ("data", "status", "uwaga"),
        [
            (date(2024, 11, 1), "WSKAZANE", None),
            (date(2026, 9, 23), "WSKAZANE", None),
            (date(2024, 10, 31), "NIEUSTALONE", "poprzedza obowiązywanie"),
        ],
    )
    def test_wersja_wipwc_po_dacie(self, data: date, status: str, uwaga: str | None) -> None:
        dokument = _PROFIL_PSE.wersja_warstwy("WIPWC", data)
        assert dokument.status == status
        if uwaga is None:
            assert dokument.uwagi_pl is None
        else:
            assert uwaga in (dokument.uwagi_pl or "")

    def test_znacznik_czasu_odrzucony(self) -> None:
        with pytest.raises(TypeError, match="date"):
            _PROFIL_PSE.wersja_warstwy("WOS", datetime(2026, 9, 23, 12, 0))


# ---------------------------------------------------------------------------
# Determinizm i wersja profilu
# ---------------------------------------------------------------------------


class TestDeterminizm:
    @pytest.mark.parametrize("operator_id", OPERATORZY)
    def test_skrot_identyczny_w_dwoch_zlozeniach(self, operator_id: str) -> None:
        pierwsze = modul_loadera._zloz_profil(operator_id)
        drugie = modul_loadera._zloz_profil(operator_id)
        assert pierwsze.skrot_profilu == drugie.skrot_profilu
        assert pierwsze.model_dump() == drugie.model_dump()
        assert load_nc_rfg_profile(operator_id).skrot_profilu == pierwsze.skrot_profilu

    def test_skrot_zalezy_od_nadpisania_hvrt(self, katalog: Path) -> None:
        """Ten sam operator z nadpisaniem HVRT i bez — jedyna różnica złożenia zmienia skrót."""
        z_nadpisaniem = _zloz(katalog, "enea")
        bez_katalog = katalog.parent / "bez_nadpisania"
        shutil.copytree(katalog, bez_katalog)
        _edytuj(bez_katalog / "operatorzy" / "enea.yaml", lambda d: d["nadpisania"].pop("hvrt"))
        bez_nadpisania = _zloz(bez_katalog, "enea")
        assert z_nadpisaniem.voltage_levels.hvrt_zrodlo.rodzaj == "OSD"
        assert bez_nadpisania.voltage_levels.hvrt_zrodlo.rodzaj == "NIEUSTALONA"
        assert z_nadpisaniem.skrot_profilu != bez_nadpisania.skrot_profilu
        assert load_nc_rfg_profile("enea").skrot_profilu == z_nadpisaniem.skrot_profilu
        assert load_nc_rfg_profile("pse").skrot_profilu != z_nadpisaniem.skrot_profilu

    @pytest.mark.parametrize("operator_id", OPERATORZY)
    def test_wersja_profilu_zawiera_wipwc(self, operator_id: str) -> None:
        profil = load_nc_rfg_profile(operator_id)
        assert "WiPWC 1.3" in profil.wersja_profilu
        assert profil.wersja_profilu.startswith(
            "NC RfG 2016/631 · WOS 2018 · procedura PTPiREE 3.0 · WiPWC 1.3 · "
        )

    def test_operatorzy_dostepni(self) -> None:
        assert tuple(list_available_operators()) == OPERATORZY
