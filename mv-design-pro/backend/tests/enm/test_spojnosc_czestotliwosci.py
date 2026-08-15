"""W009 — spójność częstotliwości szyny z częstotliwością studium.

DLACZEGO TA KONTROLA POWSTAŁA (karta DIAGNOZA-PRZEBIEGU). Pod kodem E-D08 w
`diagnostics/rules.py` żyła ZAŚLEPKA: deklarowała kontrolę sprzecznych
częstotliwości, była zarejestrowana w `ALL_BLOCKER_RULES`, a zwracała pustą
listę ZAWSZE — bo reguły diagnostyczne dostają `NetworkGraph`, który
częstotliwości nie przenosi. Uzasadnienie w jej docstringu („ENM nie modeluje
f") było nieprawdziwe: `Bus.frequency_hz` istnieje (`enm/models.py:181`) i MA
odbiorcę — `solver_input/v126_contracts.py:555` bierze z PIERWSZEJ szyny
częstotliwość bazową całej sieci. Sprzeczna deklaracja po cichu fałszowała więc
parametryzację analizy V12.6.

Wyrocznia musi GRYŹĆ: pozytyw (dane spójne ⇒ zero wpisów W009) i negatyw
(sprzeczna szyna ⇒ wpis W009 wskazujący TĘ szynę).

Iloczyn cech (KLASA, nie instancja): deklaracja szyny (brak / równa studium /
różna od studium) × częstotliwość studium (domyślne 50 Hz / jawne 60 Hz) —
żeby kontrola nie okazała się zaszytym porównaniem z liczbą 50.
"""

from enm.models import Bus, EnergyNetworkModel, ENMDefaults, ENMHeader
from enm.severity import BLOCKING_SEVERITIES, SEVERITY_IMPORTANT
from enm.validator import ENMValidator


def _enm(*buses: Bus, czestotliwosc_studium: float | None = None) -> EnergyNetworkModel:
    defaults = (
        ENMDefaults(frequency_hz=czestotliwosc_studium)
        if czestotliwosc_studium is not None
        else ENMDefaults()
    )
    return EnergyNetworkModel(
        header=ENMHeader(name="Test spójności częstotliwości", defaults=defaults),
        buses=list(buses),
    )


def _kody_w009(enm: EnergyNetworkModel) -> list[str]:
    return [i.code for i in ENMValidator().validate(enm).issues if i.code == "W009"]


def _wpisy_w009(enm: EnergyNetworkModel):
    return [i for i in ENMValidator().validate(enm).issues if i.code == "W009"]


def _szyna(ref_id: str, frequency_hz: float | None = None) -> Bus:
    return Bus(ref_id=ref_id, name=ref_id, voltage_kv=15.0, frequency_hz=frequency_hz)


class TestW009SpojnoscCzestotliwosci:
    def test_szyna_bez_deklaracji_nie_zglasza_nic(self) -> None:
        """Brak deklaracji = szyna pracuje na częstotliwości studium."""
        assert _kody_w009(_enm(_szyna("bus_1"))) == []

    def test_szyna_zgodna_ze_studium_nie_zglasza_nic(self) -> None:
        assert _kody_w009(_enm(_szyna("bus_1", 50.0))) == []

    def test_szyna_sprzeczna_ze_studium_zglasza_w009(self) -> None:
        wpisy = _wpisy_w009(_enm(_szyna("bus_1", 60.0)))

        assert len(wpisy) == 1
        assert wpisy[0].element_refs == ["bus_1"]
        assert "60" in wpisy[0].message_pl
        assert "50" in wpisy[0].message_pl

    def test_kontrola_odnosi_sie_do_studium_a_nie_do_zaszytych_50_hz(self) -> None:
        """Studium 60 Hz: sprzeczna jest szyna 50 Hz, nie 60 Hz.

        To jest test na ZASZYTY PRÓG — gdyby kontrola porównywała z literałem
        50.0, ten przypadek odwróciłby werdykt.
        """
        model = _enm(
            _szyna("bus_60", 60.0),
            _szyna("bus_50", 50.0),
            czestotliwosc_studium=60.0,
        )

        wpisy = _wpisy_w009(model)

        assert [w.element_refs for w in wpisy] == [["bus_50"]]

    def test_kazda_sprzeczna_szyna_ma_wlasny_wpis(self) -> None:
        """Wpis per szyna — inaczej naprawa drugiej byłaby niewidoczna."""
        model = _enm(_szyna("bus_a", 60.0), _szyna("bus_b", 16.7), _szyna("bus_ok", 50.0))

        wpisy = _wpisy_w009(model)

        assert sorted(w.element_refs[0] for w in wpisy) == ["bus_a", "bus_b"]

    def test_wpis_niesie_akcje_naprawcza_na_wlasciwej_szynie(self) -> None:
        wpis = _wpisy_w009(_enm(_szyna("bus_1", 60.0)))[0]

        assert wpis.fix_action is not None
        assert wpis.fix_action.element_ref == "bus_1"
        assert wpis.suggested_fix

    def test_sprzeczna_czestotliwosc_nie_blokuje_analiz(self) -> None:
        """Waga IMPORTANT, nie BLOCKER — rozpływ i zwarcia liczą się poprawnie.

        Solwery biorą częstotliwość studium (`_study_frequency_hz`), więc
        blokowanie ich z powodu deklaracji na szynie byłoby nieuczciwe.
        Asercja idzie po STAŁYCH kanonu wag, nie po literale — porównanie z
        napisem spoza słownika przeszłoby dla dowolnej wagi (test bez zębów).
        """
        model = _enm(_szyna("bus_1", 60.0))
        wynik = ENMValidator().validate(model)
        wpis = next(i for i in wynik.issues if i.code == "W009")

        assert wpis.severity == SEVERITY_IMPORTANT
        assert wpis.severity not in BLOCKING_SEVERITIES
        # Status modelu testowego jest FAIL z INNEGO powodu (E001: brak źródła
        # w minimalnym modelu), więc nie da się go tu użyć jako wyroczni dla
        # W009 — asercja mówi wprost to, co ma być prawdą: wśród blokad NIE MA
        # naszego kodu. Wyrocznia po statusie byłaby zaciemniona cudzym wpisem.
        assert "W009" not in {i.code for i in wynik.issues if i.severity in BLOCKING_SEVERITIES}
