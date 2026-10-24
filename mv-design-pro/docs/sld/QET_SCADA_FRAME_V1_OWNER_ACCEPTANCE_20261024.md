# MV-DESIGN PRO — QET-SCADA Frame 2.0: ostateczna decyzja właścicielska

**Data:** 24.10.2026 · **STATUS:** KONCEPCJA ZATWIERDZONA / KOD W PR #500 DO ODBIORU · **B-02: ODRZUCONE**.

## 1. Obowiązujące prawo prezentacji

**DWA STANY GRAFICZNE, DWIE RAMKI, ZERO ZBĘDNYCH OZNACZEŃ.**

| Jedyny poprawny stan łącznika | Nakładka | Geometria |
|---|---|---|
| **ZAMKNIĘTY** | czerwony `#F05260` | połączony styk ruchomy |
| **OTWARTY** | zielony `#2CCF93` | widoczna przerwa stykowa |

Nie ma trzeciej reprezentacji graficznej. Żadnych szarych i bursztynowych ramek, znaków zapytania, wykrzykników, blokad literą B ani migotania.

**Walidacja modelu nie jest stanem graficznym.** Brak położenia, sprzeczne sygnały, niewiarygodne dane lub różne stany biegunów → **BRAK_RAMKI i brak rysunku łącznika**, błąd w inspektorze oraz odmowa obliczeń wymagających jednoznacznej topologii. Nie wolno po cichu wybrać OPEN ani CLOSED.

Wyzwolenie i blokada są odrębnymi atrybutami aparatu, wyłącznie w inspektorze/zdarzeniach. Zwykła wkładka bezpiecznikowa nie jest aparatem sterowanym i nie dostaje ramki.

**Czerwony/zielony ≠ napięcie/prąd/moc.** Łącznik zamknięty nie musi przewodzić prądu, a otwarty może mieć napięcie na obu zaciskach.

## 2. Wynik zmian w PR #500

- `frontend/src/ui/sld/v3/cad/scada-frame/scadaFrameState.ts` — typ zamknięty OTWARTY/ZAMKNIĘTY, brak danych `null` → błąd, jawne fazy biegunów, `zweryfikujPolozeniaDoObliczen` blokuje prezentację/symulację przy niekompletnej topologii.
- `frontend/src/ui/sld/v3/cad/scada-frame/QetScadaFrame.tsx` — jedynie czerwona/zielona ramka SVG, bez ikon i trzeciego wariantu; nie rysuje mylącego znaku przy wadliwej informacji.
- `frontend/src/ui/sld/v3/cad/scada-frame/qetScadaProjectionAdapter.ts` — faktyczny odczyt ENM z **atomowej** `LvDomainProjectionV1`, bez tworzenia nowych stanów, wynik wersjonowany; K-S2 nie uznaje starych przebiegów za aktualne.
- `frontend/src/ui/sld/v3/cad/scada-frame/QetScadaCanvasGlyph.tsx` — używa `CadPrimitiveLayer` z istniejącego `CadSymbol` i zatwierdzonych 7 źródłowych plików QET dla odpowiednich rodzin; niemapowane rodziny korzystają z istniejącego rejestru (jawny `registry-fallback`).
- `frontend/src/ui/sld/v3/lv-domain/LvDomainView.tsx` — istniejąca kanwa nN może włączyć ramki przez `qetScadaFrames`; **domyślnie WYŁĄCZONE** do końcowego odbioru B-02. Nie istnieje drugi renderer/edytor.
- `frontend/src/lv-domain-harness-main.tsx` — parametr `?qetScada=1` w istniejącym harnessie, dane scenariuszy `SCENARIUSZE_NN` wyeksportowane przez backend bez ich ręcznego poprawiania.
- `frontend/src/qet-scada-frame-review-main.tsx` — pozostaje ekranem atlasu, nie udaje prawdziwej symulacji.

### Ekrany do kontroli w Vite

```text
/lv-domain-harness.html?scenariusz=02_two_tr_qbc_open&lod=2&theme=dark&qetScada=1
/lv-domain-harness.html?scenariusz=03_two_tr_qbc_closed&lod=2&theme=dark&qetScada=1
/lv-domain-harness.html?scenariusz=02_two_tr_qbc_open&lod=2&theme=light&qetScada=1
/lv-domain-harness.html?scenariusz=03_two_tr_qbc_closed&lod=2&theme=light&qetScada=1
/qet-scada-frame-review.html
```

To są **rzeczywiste backendowe fixtury projekcji ENM** dla sprzęgła QBC. Nie są efektem kliknięcia zmieniającego ENM na żywo. Nie oznaczać ich jako zakończonego E2E symulacji.

## 3. Stan zatwierdzenia źródła

**ZATWIERDZONE WIZUALNIE:** 7 oryginalnych plików QElectroTech `.elmt` z PR #499, geometria wariantu OTWARTY oraz sposób ramki z e²TANGO.

**NIEZATWIERDZONE:** własne warianty **ZAMKNIĘTY** z `qetPilotSourceGeometry.ts` (oznaczone `closedVerificationStatus:DRAFT`), rozszerzenia innych klas aparatów, zgodność normatywna IEC 60617 i pełna integracja z solverem oraz obliczeniami zmian.

Źródło QElectroTech: © QElectroTech team, CC BY 3.0 — atrybucja i oryginalna licencja `docs/sld/vendor/qet/ELEMENTS.LICENSE`. Odrębna licencjonowana baza IEC 60617 pozostaje wymogiem normatywnej akceptacji.

## 4. Granica obliczeń — ważna

`zweryfikujPolozeniaDoObliczen` to **dodatkowa walidacja frontendu** dla kompletu wejściowych łączników. Nie zastępuje backendowej walidacji ENM, EAZ, wysp, zwarć i solvera ani nie wprowadza nowej komendy SCADA.

Aby otworzyć B-02, należy wykazać na rzeczywistym przebiegu:

```text
kliknięcie aparatu → walidacja możliwości operacji → wersja ENM scenariusza
→ zmiana topologii / wysp → LF / SC → atomowy wynik K-S2
→ QET-SCADA Frame + odpowiednia projekcja SLD → White-Box
```

Dla brakującego/sprzecznego stanu: backend musi odmówić obliczeń wymagających jednoznacznej topologii. Brak tego dowodu = **NIE GOTOWE PRODUKCYJNIE**.

## 5. Testy i granica odbioru

- `__tests__/QetScadaFrame.test.tsx` — tylko 2 kolory, błąd bez ramki, blokada, wyzwolenie, rozbieżność biegunów i brak fałszywego wyniku K-S2.
- `__tests__/qetScadaProjectionAdapter.test.ts` — rzeczywiste fixtury backendu, sprzęgło QBC OPEN/CLOSED z różnych scenariuszy.
- `e2e/qet-scada-frame-review.spec.ts` — atlas, 2 motywy, 1400×800 i 1000×700.
- `e2e/qet-scada-lv-domain-projection.spec.ts` — rzeczywista `LvDomainView` na fixturach nN, stany QBC i obydwa motywy.
- **Nie deklarować PASS**, dopóki testy nie zakończą się potwierdzonym powodzeniem i nie ma rzeczywistych zrzutów.

**Zatwierdzona jest konwencja dwóch kolorów i geometria źródłowa QET dla otwartego położenia. B-02 pozostaje ODRZUCONE. PR #499/#500 bez scalania.**
