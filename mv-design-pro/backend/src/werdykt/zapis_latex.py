"""Typ zapisu LaTeX — oznaczenie pola, którego wartość jest wzorem, nie prozą.

Kontrakt prezentacji (``docs/uiux/KONTRAKT_PREZENTACJI_INZYNIERSKIEJ_V12_7.md``): symbol
wielkości widzi projektant wyłącznie jako wzór złożony przez KaTeX (``MathRenderer``) albo przez
renderer LaTeX dokumentu dowodowego (``application/proof_engine/latex_renderer.py``); proza
nazywa wielkości słowami. Pole niosące wzór nazywa się ``*_latex`` albo — gdy nazwa pola jest
zamrożona w kontrakcie (``SymbolDefinition.symbol``, ``ProofValue.symbol``, klucze
``ProofStep.source_keys``) — ma adnotację ``ZapisLatex``.

Adnotacja jest jedynym (obok sufiksu ``_latex``) źródłem prawdy dla ``scripts/ui_math_guard.py``:
literał trafiający do takiego pola (argument wywołania, wartość domyślna, wartość zwracana
funkcji ``-> ZapisLatex``, klucz słownika ``dict[ZapisLatex, ...]``) nie jest skanowany jako
proza. W czasie wykonania to zwykły ``str`` — oznaczenie nie zmienia serializacji ani odcisków.
"""

from __future__ import annotations

from typing import TypeAlias

#: Wzór w notacji LaTeX (np. ``I_k''``, ``Z_{th}``, ``\kappa``) — renderowany, nigdy pokazywany
#: jako tekst.
ZapisLatex: TypeAlias = str

#: Identyfikator kontraktu czytany maszynowo, nie tekst dla projektanta: nazwa kolumny arkusza
#: importu (nagłówek pliku wejściowego), klucz wyniku, identyfikator kroku, kod. Oznaczenie
#: wyłącza wartość ze skanu prozy ``scripts/ui_math_guard.py`` tak samo jak ``ZapisLatex``;
#: wartość pokazana projektantowi jako proza nie może nieść tej adnotacji.
IdentyfikatorKontraktu: TypeAlias = str
