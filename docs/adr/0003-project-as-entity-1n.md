# ADR 0003: Projekt ako samostatná entita (1 projekt : N rep, N webov)

**Status:** Prijaté · 2026-10-12

## Kontext

Pôvodný návrh predpokladal pár 1 repo ↔ 1 web. Fáza 0 na reálnych dátach ukázala:

- jedno repo poháňa viac webov (napr. jedno portfólio repo nasadené na dvoch doménach),
- weby bez repa (ručný upload),
- repá bez webu (knižnice, CLI, backendy),
- názvy webov a rep sa často nezhodujú, takže párovanie podľa mena nie je spoľahlivé.

## Rozhodnutie

**Projekt** je samostatná entita. Repá a weby sú surové dáta zo zdrojov, na projekt sú naviazané cez väzobné tabuľky (`project_repos`, `project_sites`). Každá väzba nesie `matchSource`.

## Dôsledky

- Discovery najprv zoskupuje podľa repa, potom pridá osirelé weby a repá ako samostatné projekty.
- Používateľ môže projekty spájať a rozdeľovať v editore bez zásahu do surových dát.
- Re-sync nikdy neprepíše používateľské rozhodnutia (viditeľnosť, texty, väzby označené `manual`).
