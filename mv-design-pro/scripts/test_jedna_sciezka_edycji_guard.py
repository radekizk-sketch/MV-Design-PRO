#!/usr/bin/env python3
"""Testy strażnika jednej ścieżki edycji (karta JEDNA-SCIEZKA-EDYCJI).

Iloczyn cech, w którym chowała się klasa „kontrolka edytuje kopię modelu": rodzaj kontrolki
(natywna / komponent pola) × droga stanu (wprost do operacji / przez pośrednika / nigdzie) ×
miejsce zapisu (funkcja obsługi / ciało komponentu) × znacznik stanu widoku (z powodem / bez).
Iniekcja: dawna karta odcinka SN (osiem pól w stanie ``data``, choć plik wołał operację dla
typu katalogowego) MUSI dać osiem naruszeń.
"""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import jedna_sciezka_edycji_guard as guard  # noqa: E402

PLIK = guard.FRONTEND_SRC / "ui" / "workspace" / "surfaces" / "Proba.tsx"
BEZ_FORMULARZA = frozenset({"add_gpz_section"})

NAGLOWEK = """
import { useState } from 'react';
export function Proba() {
  const snapshot = useSnapshotStore((state) => state.snapshot);
  const executeDomainOperation = useSnapshotStore((state) => state.executeDomainOperation);
"""


def _skanuj(cialo: str) -> list[guard.Naruszenie]:
    return guard.skanuj_plik(PLIK, NAGLOWEK + cialo + "\n}\n", BEZ_FORMULARZA)


def test_iniekcja_dawnej_karty_odcinka_daje_osiem_naruszen() -> None:
    pola = "\n".join(
        f'      <NumberField label="p{i}" value={{data.p{i}}} '
        f"onChange={{(v) => setData((d) => ({{ ...d, p{i}: v }}))}} />"
        for i in range(8)
    )
    cialo = f"""
  const [data, setData] = useState({{}});
  const zmienKatalog = (id: string) => {{
    void executeDomainOperation('c', 'assign_catalog_to_element', {{ element_ref: id }});
  }};
  return (
    <div>
{pola}
      <select onChange={{(e) => zmienKatalog(e.target.value)}} />
    </div>
  );
"""
    naruszenia = _skanuj(cialo)
    assert [n.regula for n in naruszenia] == ["kontrolka_bez_zapisu"] * 8


def test_stan_wprost_w_operacji_jest_droga_zapisu() -> None:
    cialo = """
  const [dlugosc, setDlugosc] = useState('');
  const zapisz = () => {
    void executeDomainOperation('c', 'update_element_parameters', { parameters: { length_km: dlugosc } });
  };
  return <input value={dlugosc} onChange={(e) => setDlugosc(e.target.value)} onBlur={zapisz} />;
"""
    assert _skanuj(cialo) == []


def test_stan_przez_posrednika_do_zadania_backendu_jest_droga() -> None:
    cialo = """
  const [zrodlo, setZrodlo] = useState('');
  const [zapytanie, setZapytanie] = useState(null);
  useEffect(() => { if (zapytanie) pobierzOdpowiedz(zapytanie); }, [zapytanie]);
  return (
    <>
      <select value={zrodlo} onChange={(e) => setZrodlo(e.target.value)} />
      <button onClick={() => setZapytanie({ zrodlo })}>Licz</button>
    </>
  );
"""
    assert _skanuj(cialo) == []


def test_stan_w_inline_obsludze_przycisku_z_operacja_jest_droga() -> None:
    cialo = """
  const [opis, setOpis] = useState('');
  return (
    <>
      <input value={opis} onChange={(e) => setOpis(e.target.value)} />
      <button onClick={() => { void executeDomainOperation('c', 'op', { opis }); }}>Zapisz</button>
    </>
  );
"""
    assert _skanuj(cialo) == []


def test_cialo_komponentu_nie_maskuje_kontrolki_bez_zapisu() -> None:
    zagniezdzony = """
  function Wewnetrzny() {
    const [x, setX] = useState('');
    void executeDomainOperation('c', 'op', {});
    return <input value={x} onChange={(e) => setX(e.target.value)} />;
  }
  return <Wewnetrzny />;
"""
    assert [n.regula for n in _skanuj(zagniezdzony)] == ["kontrolka_bez_zapisu"]


def test_pusty_onchange_to_kontrolka_martwa() -> None:
    assert [n.regula for n in _skanuj("  return <input onChange={() => {}} />;")] == [
        "kontrolka_martwa"
    ]


def test_znacznik_stanu_widoku_z_powodem_i_bez() -> None:
    z_powodem = """
  const [q, setQ] = useState('');
  return (
    <input
      // stan-widoku: fraza wyszukiwania — filtr widoku
      value={q}
      onChange={(e) => setQ(e.target.value)}
    />
  );
"""
    assert _skanuj(z_powodem) == []
    bez_powodu = z_powodem.replace("fraza wyszukiwania — filtr widoku", "")
    assert [n.regula for n in _skanuj(bez_powodu)] == ["znacznik_bez_powodu"]


def test_plik_bez_odczytu_modelu_nie_jest_oceniany() -> None:
    tekst = """
export function Filtr() {
  const [q, setQ] = useState('');
  return <input value={q} onChange={(e) => setQ(e.target.value)} />;
}
"""
    assert guard.skanuj_plik(PLIK, tekst, BEZ_FORMULARZA) == []


def test_otwarcie_formularza_operacji_bez_formularza() -> None:
    naruszenia = _skanuj(
        "  openOperationForm('add_gpz_section', {});\n  openOperationForm('add_ct', {});"
    )
    assert [(n.regula, n.opis.split("'")[1]) for n in naruszenia] == [
        ("formularz_null", "add_gpz_section")
    ]


def test_rejestr_formularzy_czytany_z_pliku_rejestru() -> None:
    bez_formularza = guard.operacje_bez_formularza()
    assert "open_switch" in bez_formularza
    assert "update_element_parameters" not in bez_formularza


def test_allowlista_pusta() -> None:
    assert guard.ALLOWLIST == frozenset()
