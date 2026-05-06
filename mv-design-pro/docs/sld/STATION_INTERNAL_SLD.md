# Wewnętrzny SLD stacji — kontrakt kanoniczny

**Status:** kanon BINDING — implementacja w PR-5
**Wersja:** v1.0

---

## 1. Cel

Stacja SN/nN nie jest ikoną. Stacja jest **obiektem zagnieżdżonym** z własną strukturą wewnętrzną:
- rozdzielnia SN (szyny + sekcje + sprzęgło),
- pola SN (wejściowe / wyjściowe / transformatorowe / pomiarowe / sprzęgłowe / DER / rezerwowe),
- transformator(y) SN/nN,
- rozdzielnica nN,
- odbiory, źródła, magazyny po stronie nN.

Użytkownik musi mieć możliwość:
- otwarcia widoku wewnętrznego stacji (double-click),
- konfiguracji każdego pola osobno,
- przepięcia kabla SN do konkretnego pola, nie do ikony.

---

## 2. Tryby widoku

### 2.1 Widok zewnętrzny (default)

Stacja w sieci terenowej jako **blok** z:
- nazwą,
- typem topologicznym (końcowa/przelotowa/odgałęźna/sekcyjna),
- statusem zasilania,
- portami zewnętrznymi (`sn_input`, `sn_output`, `sn_branch_n`, `nn_feeder_n`),
- badge braku danych jeśli niekompletna.

### 2.2 Widok wewnętrzny

Otwierany przez double-click stacji. Trzy mode:
- **modal w panelu prawym** — dla stacji prostych (≤4 pola SN);
- **dedicated workspace** — dla stacji złożonych (>4 pola SN);
- **inline expansion** — przy dużym zoomie (LOD ≥ 3) stacja może rozwinąć się w miejscu, bez przełączania widoku.

Zawartość:
- Szyna SN (pozioma, z sekcjami i sprzęgłem),
- Pola SN (pionowe tory poniżej szyny),
- Transformator(y) SN/nN (poniżej pola transformatorowego),
- Szyna nN (pozioma, poniżej transformatora),
- Odpływy nN (pionowe tory poniżej szyny nN),
- Odbiory / PV/BESS po nN.

### 2.3 Widok mieszany

Sieć terenowa pokazuje stacje zwinięte; aktualnie zaznaczona stacja rozwija się inline (LOD override per-object).

---

## 3. Szablony stacji (PR-5)

Szablon = kompozycja predefiniowanych pól, generowana przy wstawieniu stacji na ciągu.

| Szablon | Pola SN | Transformator | nN |
|---|---|---|---|
| **stacja końcowa** | 1× wejściowe + 1× transformatorowe | 1× SN/nN | szyna nN + odpływy |
| **stacja przelotowa** | 1× wejściowe + 1× wyjściowe + 1× transformatorowe | 1× SN/nN | szyna nN + odpływy |
| **stacja odgałęźna** | 1× wejściowe + 1× wyjściowe + ≥1× odgałęzienie + 1× transformatorowe | 1× SN/nN | szyna nN + odpływy |
| **stacja sekcyjna** | 2× wejściowe + 1× sprzęgłowe + (opcjonalnie) transformatorowe | opcjonalnie | opcjonalnie |
| **stacja z PV** | jw. + 1× pole PV (SN lub po nN) | dedykowany lub współdzielony | przyłącze PV |
| **stacja z BESS** | jw. + 1× pole BESS | dedykowany lub współdzielony | przyłącze BESS |
| **stacja z FW** | jw. + 1× pole FW + transformator dedykowany | dedykowany | przyłącze FW |
| **stacja odbiorcza** | 1× wejściowe + 1× transformatorowe | 1× SN/nN | szyny nN + duża liczba odpływów |
| **stacja przemysłowa** | jw. + nN niestandardowe (poziomy 0,4 / 0,69 / 6 kV itp.) | wielouzwojeniowy | wiele szyn nN |

---

## 4. Wstawianie stacji na odcinku

Scenariusz „D" rebuild-u:

1. Użytkownik wybiera kabel/linię → menu kontekstowe → „Wstaw stację transformatorową".
2. Otwiera się karta wyboru szablonu (modal).
3. Po zatwierdzeniu:
   - oryginalny odcinek dzieli się na **dwa odcinki end-to-end**;
   - powstaje stacja z portami zewnętrznymi (`sn_input` ← endpoint A oryginalnego odcinka, `sn_output` ← endpoint B oryginalnego odcinka);
   - powstają wewnętrzne pola SN zgodnie z szablonem;
   - powstaje transformator z portami `sn_transformer_in`, `nn_transformer_out`;
   - powstaje szyna nN i odpływy.

Backend: `application/sld/internal_layout.py` (PR-5).

---

## 5. Reguły wewnętrznego SLD (BINDING)

1. Pola SN mają **kanoniczną kolejność** zgodną z `frontend/.../core/canonicalFieldDetail.ts`: szyna → odłącznik szynowy → wyłącznik → odłącznik liniowy/transformatorowy → CT → uziemnik (boczny) → głowica kablowa.
2. Pole transformatorowe kończy się przyłączeniem do transformatora (port `sn_transformer`).
3. Pole pomiarowe NIE udaje pola liniowego — ma własny tor pomiarowy z VT.
4. Pole sprzęgłowe pokazuje strukturę dwustronną między sekcjami.
5. Pole DER (PV/BESS/FW) wymaga jasno określonego portu i transformatora bloku, jeśli przyłączenie po SN.
6. Stacja sekcyjna zaznacza wyraźnie sprzęgło/NOP jako punkt pracy.

---

## 6. Wewnętrzny vs zewnętrzny — synchronizacja

- Klik pola wewnątrz stacji → highlight w drzewie + inspector pola.
- Klik portu zewnętrznego → highlight właściwego pola + odcinka SN przyłączonego.
- Zmiana danych w polu wewnętrznym → recompute readiness, refresh badge stacji.
- Zmiana topologiczna (dodanie pola odgałęzienia) → ponowna klasyfikacja typu topologicznego stacji.

---

**Koniec dokumentu.**
