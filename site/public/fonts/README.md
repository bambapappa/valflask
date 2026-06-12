# Fonter — provenans och regenerering

Självhostade per SPEC §11 (inga runtime-anrop till externa font-CDN). Alla under SIL OFL 1.1 — licensfiler ligger bredvid. Total budget ≤ 170 kB woff2 (nuvarande: ~148 kB).

| Fil | Ursprung | Innehåll |
|---|---|---|
| `anton-latin-400-normal.woff2` | npm `@fontsource/anton@5` (verbatim) | Google-subset "latin" (inkl. åäö). Anton sätter aldrig tal — behöver ej symbolglyfer. |
| `ibm-plex-mono-latin-*-normal.woff2` | npm `@ibm/plex-mono@2.5.0` → pyftsubset | Eget subset, se nedan. **Obs:** "latin" i filnamnet är historiskt (stabil sökväg); innehållet är latin + symboler. |
| `source-serif-4-latin-wght-normal.woff2` | npm `source-serif@4.5.1` `VAR/SourceSerif4Variable-Roman.ttf` → instancer + pyftsubset | Variabel `wght` 400–700, `opsz` pinnad till 20. tnum bevarad. |
| `source-serif-4-latin-400-italic.woff2` | npm `source-serif@4.5.1` `TTF/SourceSerif4-It.ttf` → pyftsubset | Statisk italic 400 (citat). |

## Varför eget subset?

Fontsources färdiga "latin"-subset saknar `≈` (U+2248) — som §8 kräver framför varje LLM-estimat — samt `→` (U+2192) och `↗` (U+2197) som UI:t använder. Verifierat 2026-06-12; därför subsetfas från kompletta releaser.

## Teckenset (UNI)

```
U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0300-030F,U+0329,
U+2000-206F,U+20AC,U+2122,U+2190-2199,U+2212,U+2215,U+2248,U+FEFF,U+FFFD
```

## Regenerering (kräver `pip install fonttools brotli`)

```sh
npm i @fontsource/anton @ibm/plex-mono source-serif
UNI='<teckensetet ovan, utan radbrytningar>'
P=node_modules/@ibm/plex-mono/fonts/complete/woff2
pyftsubset $P/IBMPlexMono-Regular.woff2 --flavor=woff2 --layout-features='*' --unicodes="$UNI" \
  --output-file=ibm-plex-mono-latin-400-normal.woff2
pyftsubset $P/IBMPlexMono-Bold.woff2    --flavor=woff2 --layout-features='*' --unicodes="$UNI" \
  --output-file=ibm-plex-mono-latin-700-normal.woff2
fonttools varLib.instancer node_modules/source-serif/VAR/SourceSerif4Variable-Roman.ttf \
  wght=400:700 opsz=20 -o ss4-wght.ttf
pyftsubset ss4-wght.ttf --flavor=woff2 --layout-features='*' --unicodes="$UNI" \
  --output-file=source-serif-4-latin-wght-normal.woff2
pyftsubset node_modules/source-serif/TTF/SourceSerif4-It.ttf --flavor=woff2 --layout-features='*' \
  --unicodes="$UNI" --output-file=source-serif-4-latin-400-italic.woff2
cp node_modules/@fontsource/anton/files/anton-latin-400-normal.woff2 .
```

## Verifiering efter regenerering

Kontrollera med fontTools att (a) `åäöÅÄÖ≈–→↗` finns i cmap för mono + serif, (b) GSUB-featuren `tnum` finns i serif-filerna, (c) `fvar` har `wght`-axeln i variabelfilen.
