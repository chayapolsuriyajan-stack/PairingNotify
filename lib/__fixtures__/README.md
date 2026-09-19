# Fixtures

`synthetic-*.html` are hand-written pages that reproduce the *structure* of
chess-results output (a nav table, then the data table, header labels, `CRs1`/`CRs2`
row classes, `&nbsp;` padding, a colour glyph column). They let the parsers be tested
offline and they pin the intended behaviour — but they are **not** real chess-results
output, so passing tests do not prove the parsers work against the live site.

To get real fixtures, run the **Capture chess-results fixtures** workflow with a
tournament id, download the artifact, and drop the HTML in here as `real-*.html`.
`capture-fixtures.js` also runs every parser against what it downloads, so the workflow
log tells you straight away whether anything has drifted.
