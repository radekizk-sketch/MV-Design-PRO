"""Testy klasy FAB-G: tabliczka transformatora WN/SN GPZ wyłącznie z katalogu.

Karta FAB-G domyka dług 7 rejestru V12K-315 (ta sama klasa defektu co
D2/`add_transformer_sn_nn`, zostawiona świadomie w karcie FAB-D1): operacja
`add_grid_source_sn` fabrykowała tabliczkę transformatora(ów) WN/SN GPZ
(25 MVA @ 110 kV, uk=12%, pk=120 kW, p0=25 kW, i0=0,2%, YNd11), gdy ładunek
milczał — mapa katalogowa `GPZ_WN_SN_TRANSFORMER_CATALOG_BY_VOLTAGE_AND_POWER`
istniała, ale wybór ROZMIARU transformatora (moc, napięcie górne) nigdy nie
wymagał jawnej decyzji projektanta.

Operacja wymaga teraz jednego z:
(a) `transformer_catalog_ref` / `transformer_catalog_binding` wskazanych wprost;
(b) jawnej pary `hv_voltage_kv` + `transformer_sn_mva`, która JEDNOZNACZNIE
    wskazuje pozycję w mapie (napięcie SN pochodzi z już rozstrzygniętego
    `voltage_kv` operacji).
Brak obu dróg i para spoza mapy kończą się TYM SAMYM kodem `catalog.ref_required`
istniejącej bramy katalogowej, z listą dopuszczalnych par w komunikacie PL.

UWAGA (zweryfikowane empirycznie przed naprawą, probe_gpz.py): katalog niesie
dla `tr-wn-sn-110-15-25mva-yd11` uk_percent=11.0 / i0_percent=0.35 /
vector_group="Yd11" — usunięte literały (`or 12.0` / `or 0.2` / `or "YNd11"`)
NIE zmieniają żadnej wartości w istniejących sieciach testowych, bo
`_apply_materialized_transformer_fields` już PRZED tą kartą nadpisywała je
bezwarunkowo katalogiem, ilekroć operacja w ogóle się powiodła. Naprawiony
jest wyłącznie sam WYMÓG jawności — nie liczby.
"""

from __future__ import annotations

from enm.domain_operations import execute_domain_operation
from enm.models import EnergyNetworkModel, ENMDefaults, ENMHeader


def _empty_enm(sn_nominal_kv: float = 15.0) -> dict:
    enm = EnergyNetworkModel(
        header=ENMHeader(name="fab_g_test", defaults=ENMDefaults(sn_nominal_kv=sn_nominal_kv)),
    )
    return enm.model_dump(mode="json")


def _base_payload(**nadpisania: object) -> dict:
    payload: dict[str, object] = {
        "voltage_kv": 15.0,
        "sk3_mva": 250.0,
        "catalog_ref": "src-gpz-15kv-250mva-rx010",
    }
    payload.update(nadpisania)
    return payload


class TestBrakTypuIBrakParyOdrzucone:
    """Iloczyn cech: brak obu pól × obecność jednego z pary bez drugiego ×
    tryb ręczny źródła (manual_equivalent nie zwalnia transformatora z bramy)."""

    def test_brak_obu_pol_daje_catalog_ref_required(self) -> None:
        wynik = execute_domain_operation(_empty_enm(), "add_grid_source_sn", _base_payload())
        assert wynik.get("error_code") == "catalog.ref_required", wynik
        assert wynik.get("snapshot") is None
        assert "hv_voltage_kv" in str(wynik.get("error"))
        assert "transformer_sn_mva" in str(wynik.get("error"))

    def test_tylko_hv_voltage_kv_bez_mocy_odrzucone(self) -> None:
        wynik = execute_domain_operation(
            _empty_enm(), "add_grid_source_sn", _base_payload(hv_voltage_kv=110.0)
        )
        assert wynik.get("error_code") == "catalog.ref_required", wynik
        assert wynik.get("snapshot") is None

    def test_tylko_moc_bez_hv_voltage_kv_odrzucone(self) -> None:
        wynik = execute_domain_operation(
            _empty_enm(), "add_grid_source_sn", _base_payload(transformer_sn_mva=25.0)
        )
        assert wynik.get("error_code") == "catalog.ref_required", wynik
        assert wynik.get("snapshot") is None

    def test_manual_equivalent_zrodla_nie_zwalnia_transformatora_z_bramy(self) -> None:
        """Tryb ekspercki źródła (manual_equivalent) dotyczy WYŁĄCZNIE źródła —
        transformator WN/SN GPZ powstaje niezależnie od trybu źródła, więc
        MUSI przejść przez tę samą bramę katalogową."""
        payload = {
            "voltage_kv": 15.0,
            "manual_equivalent": {"sk3_mva": 250.0, "rx_ratio": 0.1},
        }
        wynik = execute_domain_operation(_empty_enm(), "add_grid_source_sn", payload)
        assert wynik.get("error_code") == "catalog.ref_required", wynik
        assert wynik.get("snapshot") is None


class TestParaSpozaMapyOdrzuconaTymSamymKodem:
    """Para obecna, ale nierozstrzygalna — brak rekordu (moc) albo niedozwolona
    strona górna (napięcie) — oba przypadki kończą się TYM SAMYM kodem."""

    def test_moc_spoza_typoszeregu_daje_ten_sam_kod_z_lista_par(self) -> None:
        wynik = execute_domain_operation(
            _empty_enm(),
            "add_grid_source_sn",
            _base_payload(hv_voltage_kv=110.0, transformer_sn_mva=999.0),
        )
        assert wynik.get("error_code") == "catalog.ref_required", wynik
        assert wynik.get("snapshot") is None
        assert "999" in str(wynik.get("error"))
        assert "110/15 kV 25 MVA" in str(wynik.get("error"))

    def test_niedozwolone_napiecie_gornej_strony_daje_ten_sam_kod(self) -> None:
        wynik = execute_domain_operation(
            _empty_enm(),
            "add_grid_source_sn",
            _base_payload(hv_voltage_kv=220.0, transformer_sn_mva=25.0),
        )
        assert wynik.get("error_code") == "catalog.ref_required", wynik
        assert wynik.get("snapshot") is None
        assert "220" in str(wynik.get("error"))


class TestTypJawnyDajeTabliczkeZKatalogu:
    """Iloczyn cech: napięcie SN (15/20 kV) × moc z typoszeregu — tabliczka
    ZAWSZE 1:1 z katalogu, nigdy z literału (i0=0.35, nie 0.2; Yd11, nie YNd11)."""

    @staticmethod
    def _transformer(wynik: dict) -> dict:
        assert wynik.get("error") is None, wynik.get("error")
        return wynik["snapshot"]["transformers"][0]

    def test_typ_15kv_25mva_tabliczka_1_do_1_z_katalogu(self) -> None:
        wynik = execute_domain_operation(
            _empty_enm(),
            "add_grid_source_sn",
            _base_payload(transformer_catalog_ref="tr-wn-sn-110-15-25mva-yd11"),
        )
        tr = self._transformer(wynik)
        assert tr["sn_mva"] == 25.0
        assert tr["uhv_kv"] == 110.0
        assert tr["ulv_kv"] == 15.0
        assert tr["uk_percent"] == 11.0
        assert tr["pk_kw"] == 120.0
        assert tr["p0_kw"] == 25.0
        assert tr["i0_percent"] == 0.35  # NIE 0.2 (dawny fabrykowany literał)
        assert tr["vector_group"] == "Yd11"  # NIE "YNd11" (dawny fabrykowany literał)
        assert tr["catalog_ref"] == "tr-wn-sn-110-15-25mva-yd11"
        assert tr["source_mode"] == "KATALOG"
        assert tr["parameter_source"] == "CATALOG"
        assert tr["overrides"] == []

    def test_typ_20kv_40mva_tabliczka_1_do_1_z_katalogu(self) -> None:
        wynik = execute_domain_operation(
            _empty_enm(sn_nominal_kv=20.0),
            "add_grid_source_sn",
            {
                "voltage_kv": 20.0,
                "catalog_ref": "src-gpz-20kv-250mva-rx010",
                "transformer_catalog_ref": "tr-wn-sn-110-20-40mva-yd11",
            },
        )
        tr = self._transformer(wynik)
        assert tr["sn_mva"] == 40.0
        assert tr["uhv_kv"] == 110.0
        assert tr["ulv_kv"] == 20.0
        assert tr["catalog_ref"] == "tr-wn-sn-110-20-40mva-yd11"

    def test_szyna_110kv_ma_napiecie_z_katalogu_nie_fabrykowane_niezaleznie(self) -> None:
        """Szyna górnego uzwojenia dostaje `voltage_kv` z TEGO SAMEGO typu
        katalogowego co `transformer['uhv_kv']` — zero niezależnego,
        fabrykowanego `110.0` obok materializacji."""
        wynik = execute_domain_operation(
            _empty_enm(),
            "add_grid_source_sn",
            _base_payload(transformer_catalog_ref="tr-wn-sn-110-15-25mva-yd11"),
        )
        snapshot = wynik["snapshot"]
        tr = snapshot["transformers"][0]
        hv_bus = next(b for b in snapshot["buses"] if b["ref_id"] == tr["hv_bus_ref"])
        assert hv_bus["voltage_kv"] == tr["uhv_kv"] == 110.0

    def test_dwa_transformatory_gpz_dostaja_ta_sama_poprawna_tabliczke(self) -> None:
        """Iloczyn cech: brama × wielokrotność transformatorów w jednym GPZ —
        pętla materializacji nie może "zgubić" jawności przy drugiej i kolejnej
        iteracji."""
        wynik = execute_domain_operation(
            _empty_enm(),
            "add_grid_source_sn",
            _base_payload(
                sections_count=2,
                transformer_count=2,
                transformer_catalog_ref="tr-wn-sn-110-15-25mva-yd11",
            ),
        )
        assert wynik.get("error") is None, wynik.get("error")
        transformatory = wynik["snapshot"]["transformers"]
        assert len(transformatory) == 2
        for tr in transformatory:
            assert tr["sn_mva"] == 25.0
            assert tr["i0_percent"] == 0.35
            assert tr["catalog_ref"] == "tr-wn-sn-110-15-25mva-yd11"


class TestParaZMapyDajeTenSamTypCoJawny:
    """Predykaty parami (KLASA NIE INSTANCJA): droga (b, para) i droga (a, jawny
    ref) muszą wskazywać TEN SAM rekord katalogowy — tożsamość modelu, nie
    tylko tożsamość liczb z osobna."""

    def test_para_i_jawny_ref_daja_identyczny_model(self) -> None:
        wynik_para = execute_domain_operation(
            _empty_enm(),
            "add_grid_source_sn",
            _base_payload(hv_voltage_kv=110.0, transformer_sn_mva=25.0),
        )
        wynik_ref = execute_domain_operation(
            _empty_enm(),
            "add_grid_source_sn",
            _base_payload(transformer_catalog_ref="tr-wn-sn-110-15-25mva-yd11"),
        )
        assert wynik_para.get("error") is None, wynik_para.get("error")
        assert wynik_ref.get("error") is None, wynik_ref.get("error")
        tr_para = wynik_para["snapshot"]["transformers"][0]
        tr_ref = wynik_ref["snapshot"]["transformers"][0]
        assert tr_para["catalog_ref"] == tr_ref["catalog_ref"] == "tr-wn-sn-110-15-25mva-yd11"
        pola_tabliczki = (
            "sn_mva",
            "uhv_kv",
            "ulv_kv",
            "uk_percent",
            "pk_kw",
            "p0_kw",
            "i0_percent",
            "vector_group",
        )
        for pole in pola_tabliczki:
            assert tr_para[pole] == tr_ref[pole], pole
        # Tożsamość HASHA modelu (nie tylko pól tabliczki) — obie drogi muszą
        # wyprodukować DOKŁADNIE ten sam snapshot, bo obie rozstrzygają się do
        # tej samej pozycji katalogu.
        assert wynik_para["layout"]["layout_hash"] == wynik_ref["layout"]["layout_hash"]


class TestBrakMechanizmuOverrideDlaTransformatora:
    """Karta FAB-G §0: „sprawdź — nie dobudowuj nowego". Transformator WN/SN
    GPZ NIE MA (jeszcze) kanału OVERRIDE — `overrides` jest zawsze puste, a
    proweniencja ZAWSZE CATALOG po udanej materializacji. Test przypina TEN
    stan wprost (deklaracja bez testu = fałszywa pewność), żeby przyszłe,
    częściowe dodanie override (np. tylko `parameter_source` bez `overrides`,
    albo odwrotnie) było wykrywalne jako regresja."""

    def test_transformator_ma_zawsze_provenience_catalog_i_puste_overrides(self) -> None:
        wynik = execute_domain_operation(
            _empty_enm(),
            "add_grid_source_sn",
            _base_payload(transformer_catalog_ref="tr-wn-sn-110-15-25mva-yd11"),
        )
        assert wynik.get("error") is None, wynik.get("error")
        tr = wynik["snapshot"]["transformers"][0]
        assert tr["overrides"] == []
        assert tr["source_mode"] == "KATALOG"
        assert tr["parameter_source"] == "CATALOG"
