"""Odmowa danych w odpowiedzi HTTP — JEDNA postać ciała odpowiedzi (partia integracji 10).

Odmowa danych (`OdmowaDanychError`) niesie zdanie dla projektanta bez identyfikatorów, a pola
strukturalne obok niego: `kod` i `dane` odmowy nazwanej (`OdmowaNazwana`) oraz `rekordy`
odmowy wejścia rdzenia (`OdmowaWejsciaRdzenia`). Identyfikator elementu żyje WYŁĄCZNIE
w tych polach — odpowiedź, która je gubi, odbiera interfejsowi możliwość wskazania elementu.

Dwie drogi odmowy do klienta i obie składają ciało tą samą funkcją `pola_odmowy`:

* odmowa, którą router przepuszcza, trafia do globalnego handlera `OdmowaDanychError`
  (status 422) — to droga domyślna i router NIE tłumaczy odmowy sam na `HTTPException`;
* router, którego kontrakt wymaga innego statusu (409 konflikt, 404 brak przebiegu,
  400 błędne wejście, 503 brak usługi) albo prefiksu treści, podnosi `OdmowaHttpError`
  z odmową w środku — handler buduje ciało tak samo jak dla 422.

Dawne `raise HTTPException(status_code=…, detail=str(exc))` zostawiało w odpowiedzi samo
zdanie: po przeniesieniu identyfikatorów z treści do pól (partia 10) klient tracił
identyfikator całkowicie. Pilnuje tego strażnik `odmowa_bez_identyfikatora_guard`
(przekład odmowy na `HTTPException` w warstwie API jest zakazany).
"""

from __future__ import annotations

from network_model.odmowa_danych import OdmowaDanychError, OdmowaNazwana, OdmowaWejsciaRdzenia


class OdmowaHttpError(Exception):
    """Odmowa danych ze statusem HTTP innym niż 422 albo z prefiksem zdania.

    `prefiks` poprzedza zdanie odmowy („Nie udało się złożyć dowodu obwodu nN: …"); pola
    strukturalne pochodzą z odmowy bez zmian.
    """

    def __init__(
        self, odmowa: OdmowaDanychError, *, status_code: int, prefiks: str | None = None
    ) -> None:
        self.odmowa = odmowa
        self.status_code = status_code
        self.detail = f"{prefiks}: {odmowa}" if prefiks else str(odmowa)
        super().__init__(self.detail)


def pola_odmowy(odmowa: OdmowaDanychError) -> dict[str, object]:
    """Pola strukturalne odmowy dokładane addytywnie obok `detail` (karty W10-2a / OD-17a,
    partia integracji 10): `kod` i `dane` odmowy nazwanej, `rekordy` odmowy wejścia rdzenia."""
    pola: dict[str, object] = {}
    if isinstance(odmowa, OdmowaNazwana):
        pola["kod"] = odmowa.kod
        pola["dane"] = dict(odmowa.dane)
    if isinstance(odmowa, OdmowaWejsciaRdzenia):
        pola["rekordy"] = [
            {
                "kod": rekord.kod,
                "tresc": rekord.tresc,
                "odwolania": [
                    {"rodzaj": odwolanie.rodzaj, "ref": odwolanie.ref}
                    for odwolanie in rekord.odwolania
                ],
            }
            for rekord in odmowa.rekordy
        ]
    return pola
