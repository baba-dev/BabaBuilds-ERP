# Invoice fonts

Noto Sans Regular and Bold (SIL Open Font License 1.1, see `OFL.txt`), used by the invoice designs that set
`fonts: "unicode"` so the rupee sign and Devanagari names print correctly.

The files are pre-subset to keep invoice PDFs small, because the fonts are embedded whole (fontkit's run-time
subsetting drops glyph outlines for this font). Regenerate from the full Noto Sans TTFs with fonttools:

```bash
pyftsubset NotoSans-Regular.ttf --layout-features='*' --no-hinting --notdef-outline --name-IDs='*' \
  --unicodes="U+0020-007E,U+00A0-00FF,U+0100-017F,U+2010-2027,U+2030-203A,U+2044,U+20A0-20CF,U+2122,U+2190-2193,U+2212,U+25CC,U+200C-200D,U+0900-097F,U+A8E0-A8FF,U+1CD0-1CFF" \
  --output-file=NotoSans-Regular.ttf
```

(Same for Bold.) Covered: Latin, Latin-1/Extended-A, general punctuation, currency symbols (including the rupee sign),
and Devanagari with its shaping tables.
