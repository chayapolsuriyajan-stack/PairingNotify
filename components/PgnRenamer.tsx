'use client';

import Link from '@/components/NavLink';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Screen } from '@/components/Screen';
import { parseChessResultsRows, rowsFromCard } from '@/lib/pgn/rows.js';
import { parseTournamentRef } from '@/lib/ref.js';
import { SCORES, missingFields, planGames, renameStudy } from '@/lib/pgn/study.js';
import { pad2, tidyName } from '@/lib/client/format';
import { DEFAULT_PGN_PREFS, loadPgnPrefs, savePgnPrefs, type NameOrder, type PgnPrefs } from '@/lib/client/pgnPrefs';
import type { PlayerResponse } from '@/lib/client/types';
import { Button, Chip, Panel, SectionHeader } from './ui';
import { Loading, toast } from './Motion';
import { Segmented } from './Segmented';
import { TopBar } from './TopBar';
import { useAccount } from './useAccount';
import { useJson } from './useJson';

type Edit = { opponent?: string; score?: string };
type RowsMode = 'tournament' | 'paste';
/** A player's card in one tournament: where "auto fill" reads the opponents from. */
type Source = { id: string; startNo: number };

/** Where a pre-filled value came from, in the words the screen uses. */
const SOURCE: Record<string, string> = {
  tags: 'PGN tags',
  'chess-results': 'chess-results',
  name: 'chapter name',
  comment: 'result comment',
};

const SCORE_LABEL: Record<string, string> = {
  '': 'Score…',
  '1-0': '1-0 (won)',
  '0-1': '0-1 (lost)',
  '1/2-1/2': '1/2-1/2 (draw)',
};

/** "Lumpoon 2026" -> "lumpoon-2026-renamed.pgn" */
function fileNameFor(studyName: string): string {
  const slug = studyName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return `${slug || 'study'}-renamed.pgn`;
}

/**
 * PGN RENAMER: takes a PGN exported from a Lichess study and renames every chapter to
 * "<Opponent> <Score>" (score from your side), ready to import into a new study. Opponents
 * and results come from the PGN itself and, when it has nothing to go on, from rows you
 * paste off your chess-results player page. Everything is editable before you export, and
 * nothing but the [Event] (and [ChapterName]) tags is ever changed (lib/pgn/study.js).
 */
export function PgnRenamer() {
  const { feed, needsLogin } = useAccount({ refreshMs: 0 });
  const [pgn, setPgn] = useState('');
  const [rowsText, setRowsText] = useState('');
  // Where the opponents come from. Until you choose, it is a tournament when there is
  // one to pick from (you follow someone), and a paste otherwise.
  const [mode, setMode] = useState<RowsMode | null>(null);
  const [pick, setPick] = useState(''); // "<id>/<startNo>" of a followed player's event, or "other"
  const [otherLink, setOtherLink] = useState('');
  const [otherStart, setOtherStart] = useState('');
  const [prefs, setPrefs] = useState<PgnPrefs>(DEFAULT_PGN_PREFS);
  const [prefsLoaded, setPrefsLoaded] = useState(false);
  // What you typed over the pre-filled values, by game. Cleared when the PGN changes,
  // because the game numbers no longer mean the same games.
  const [edits, setEdits] = useState<Record<number, Edit>>({});
  const fileInput = useRef<HTMLInputElement>(null);
  const outputBox = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    setPrefs(loadPgnPrefs());
    setPrefsLoaded(true);
  }, []);
  useEffect(() => {
    if (prefsLoaded) savePgnPrefs(prefs);
  }, [prefsLoaded, prefs]);

  const setPref = <K extends keyof PgnPrefs>(key: K, value: PgnPrefs[K]) => setPrefs((p) => ({ ...p, [key]: value }));

  // The tournaments of the players you follow (you first), one choice per player and event.
  const options = useMemo(() => {
    const follows = [...(feed.data?.feed.follows ?? [])].sort((a, b) => Number(b.isMe) - Number(a.isMe));
    const seen = new Map<string, { key: string; label: string } & Source>();
    for (const follow of follows) {
      for (const t of follow.tournaments) {
        const key = `${t.id}/${t.startNo}`;
        if (!seen.has(key)) seen.set(key, { key, id: t.id, startNo: t.startNo, label: `${tidyName(follow.playerName)} · ${t.title}` });
      }
    }
    return [...seen.values()];
  }, [feed.data]);

  const rowsMode: RowsMode = mode ?? (options.length > 0 ? 'tournament' : 'paste');

  // "Another tournament": a pasted chess-results link (its snr= is the start number) or
  // an event number plus the start number typed in. Needed for a study of an event that
  // is no longer in your followed players' lists.
  const otherRef = useMemo(() => parseTournamentRef(otherLink), [otherLink]);
  const otherStartNo = otherRef?.startNo ?? (/^\d+$/.test(otherStart.trim()) ? Number(otherStart.trim()) : null);
  const source: Source | null = useMemo(() => {
    if (rowsMode !== 'tournament') return null;
    if (pick === 'other') return otherRef && otherStartNo ? { id: otherRef.id, startNo: otherStartNo } : null;
    return options.find((o) => o.key === pick) ?? null;
  }, [rowsMode, pick, options, otherRef, otherStartNo]);

  const card = useJson<PlayerResponse>(source ? `/api/cr/${source.id}/player/${source.startNo}` : null);
  // useJson keeps the previous answer until the new one lands: only trust the one that
  // belongs to the card being asked for.
  const cardRows = useMemo(
    () => (card.data && source && card.data.id === source.id && card.data.startNo === source.startNo ? rowsFromCard(card.data.rounds) : []),
    [card.data, source],
  );

  const parsedRows = useMemo(() => parseChessResultsRows(rowsText), [rowsText]);
  const rows: { name: string; score: string; opponentNo?: number | null }[] =
    rowsMode === 'tournament' ? cardRows : parsedRows.rows;
  const plan = useMemo(
    () => planGames(pgn, { username: prefs.username, rows, nameOrder: prefs.nameOrder }),
    [pgn, prefs.username, prefs.nameOrder, rows],
  );
  const entries = useMemo(() => plan.entries.map((entry) => ({ ...entry, ...edits[entry.index] })), [plan, edits]);
  const result = useMemo(
    () => renameStudy(pgn, entries, { template: prefs.template, updateChapterName: prefs.updateChapterName }),
    [pgn, entries, prefs.template, prefs.updateChapterName],
  );

  /**
   * The opponent's page in the event the rows were read from. Only offered while the
   * opponent is still the one the tournament gave: type over it and the link would go
   * to someone else.
   */
  const pageHref = (entry: (typeof entries)[number]): string | null => {
    const opponentNo = rows[entry.index]?.opponentNo;
    if (!source || !opponentNo || entry.opponentFrom !== 'chess-results' || edits[entry.index]?.opponent !== undefined) return null;
    return `/t/${source.id}/p/${opponentNo}?me=${source.startNo}`;
  };

  const games = entries.length;
  const renamed = result.names.filter(Boolean).length;
  const templateOk = prefs.template.includes('{opponent}') || prefs.template.includes('{score}');

  const edit = (index: number, patch: Edit) =>
    setEdits((current) => ({ ...current, [index]: { ...current[index], ...patch } }));

  function changePgn(text: string) {
    setPgn(text);
    setEdits({});
  }

  async function loadFile(file: File | undefined) {
    if (!file) return;
    try {
      changePgn(await file.text());
      toast(`Loaded ${file.name}`, 'ok');
    } catch {
      toast('Could not read that file', 'alert');
    }
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(result.text);
    } catch {
      // No async clipboard (an older WebView, or a page that is not https): select the
      // text in the box and use the old command instead.
      const box = outputBox.current;
      box?.focus();
      box?.select();
      if (!box || !document.execCommand('copy')) {
        toast('Copy failed. Select the text and copy it by hand', 'alert');
        return;
      }
    }
    toast(`PGN copied · ${renamed} of ${games} renamed`, 'ok');
  }

  function download() {
    try {
      const url = URL.createObjectURL(new Blob([result.text], { type: 'application/x-chess-pgn' }));
      const link = document.createElement('a');
      link.href = url;
      link.download = fileNameFor(plan.studyName);
      document.body.append(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch {
      toast('Downloading is not available here. Use Copy', 'alert');
    }
  }

  return (
    <Screen>
      <TopBar caption="AIC // STUDY RENAMER" title="PGN" />
      <p className="ef-help">
        <Link className="ef-link" href="/t">
          ◀ Events
        </Link>
      </p>

      <Panel code="01 / STUDY" title="Lichess study PGN" serial="AIC-PN-PGN">
        <div className="ef-form">
          <label className="ef-field">
            <span className="ef-field__label">Paste the PGN you exported from the study</span>
            <span className="ef-focus">
              <textarea
                className="ef-input ef-textarea"
                rows={7}
                spellCheck={false}
                autoCapitalize="off"
                placeholder={'[Event "Lumpoon 2026: Viriya 1-0"]\n[Result "*"]\n…'}
                value={pgn}
                onChange={(e) => changePgn(e.target.value)}
              />
            </span>
          </label>
          <div className="ef-actions">
            <Button variant="secondary" onClick={() => fileInput.current?.click()}>
              Upload .pgn
            </Button>
            {pgn && (
              <Button variant="secondary" onClick={() => changePgn('')}>
                Clear
              </Button>
            )}
          </div>
          <input
            ref={fileInput}
            type="file"
            hidden
            accept=".pgn,.txt,text/plain,application/x-chess-pgn"
            onChange={(e) => {
              loadFile(e.target.files?.[0]);
              e.target.value = ''; // so the same file can be picked again
            }}
          />
          {pgn.trim() && games === 0 && (
            <p className="ef-error">No games found. Every game has to start with a line that begins [Event &quot;</p>
          )}
          {games > 0 && (
            <p className="ef-help">
              <Chip tone="ok">
                {games} game{games === 1 ? '' : 's'}
              </Chip>
            </p>
          )}

          <label className="ef-field">
            <span className="ef-field__label">Your Lichess username (optional)</span>
            <span className="ef-focus">
              <input
                className="ef-input"
                autoComplete="off"
                autoCapitalize="none"
                spellCheck={false}
                placeholder="chayapol"
                value={prefs.username}
                onChange={(e) => setPref('username', e.target.value)}
              />
            </span>
          </label>
          <p className="ef-help">
            Only used when a game has White and Black tags: it tells the tool which side you were, so the score is yours.
          </p>
        </div>
      </Panel>

      <Panel code="02 / OPPONENTS" title="Opponents and results">
        <div className="ef-form">
          <p className="ef-help">
            Study exports often have no player names and a result of &quot;*&quot;. Read them from the tournament instead:
            opponents and results are taken from the player&apos;s card, round by round, and matched to games in order, round
            1 first.
          </p>
          <Segmented<RowsMode>
            label="Where the opponents come from"
            value={rowsMode}
            onChange={setMode}
            options={[
              { value: 'tournament', label: 'Tournament' },
              { value: 'paste', label: 'Paste rows' },
            ]}
          />

          {rowsMode === 'tournament' && (
            <>
              <label className="ef-field">
                <span className="ef-field__label">Whose tournament</span>
                <span className="ef-focus">
                  <select className="ef-input" aria-label="Tournament" value={pick} onChange={(e) => setPick(e.target.value)}>
                    <option value="">Choose a tournament…</option>
                    {options.map((option) => (
                      <option key={option.key} value={option.key}>
                        {option.label}
                      </option>
                    ))}
                    <option value="other">Another tournament…</option>
                  </select>
                </span>
              </label>
              {needsLogin && (
                <p className="ef-help">
                  Unlock the app on the{' '}
                  <Link className="ef-link" href="/follow">
                    Follow
                  </Link>{' '}
                  tab to list your followed players&apos; tournaments here.
                </p>
              )}
              {!needsLogin && feed.data && options.length === 0 && (
                <p className="ef-help">
                  Follow yourself on the{' '}
                  <Link className="ef-link" href="/follow">
                    Follow
                  </Link>{' '}
                  tab to pick from your tournaments, or choose another tournament.
                </p>
              )}

              {pick === 'other' && (
                <>
                  <label className="ef-field">
                    <span className="ef-field__label">Your player card on chess-results</span>
                    <span className="ef-focus">
                      <input
                        className="ef-input"
                        inputMode="url"
                        autoComplete="off"
                        spellCheck={false}
                        placeholder="https://chess-results.com/tnr1486488.aspx?art=9&snr=5"
                        value={otherLink}
                        onChange={(e) => setOtherLink(e.target.value)}
                      />
                    </span>
                  </label>
                  {otherRef && otherRef.startNo == null && (
                    <label className="ef-field">
                      <span className="ef-field__label">Your start number</span>
                      <span className="ef-focus">
                        <input
                          className="ef-input"
                          inputMode="numeric"
                          autoComplete="off"
                          placeholder="5"
                          value={otherStart}
                          onChange={(e) => setOtherStart(e.target.value)}
                        />
                      </span>
                    </label>
                  )}
                  <p className="ef-help">
                    Open your own row on the tournament page and copy its address: it contains your start number
                    (snr=). An event number works too, with the start number typed in.
                  </p>
                  {otherLink.trim() && !otherRef && <p className="ef-error">That is not a chess-results tournament link.</p>}
                </>
              )}

              {source && card.loading && !cardRows.length && <Loading label="Reading the player card" slow />}
              {source && card.error && !card.data && (
                <p className="ef-error">
                  Could not read that tournament ({card.error}). Check the link and start number, or paste the rows instead.
                </p>
              )}
              {source && cardRows.length > 0 && card.data && (
                <p className="ef-help">
                  {cardRows.length} round{cardRows.length === 1 ? '' : 's'} read for {tidyName(card.data.header.name)}
                  {card.data.header.points != null && ` · ${card.data.header.points} pts`}
                </p>
              )}
            </>
          )}

          {rowsMode === 'paste' && (
            <>
              <p className="ef-help">
                On the player&apos;s chess-results page (the one that lists the rounds), select the table, copy it and paste it
                here.
              </p>
              <label className="ef-field">
                <span className="ef-field__label">Pasted rows</span>
                <span className="ef-focus">
                  <textarea
                    className="ef-input ef-textarea"
                    rows={5}
                    spellCheck={false}
                    autoCapitalize="off"
                    placeholder={'1\t3\t12\t\tViriya, A-Nak\t1520\tTHA\t0\t1'}
                    value={rowsText}
                    onChange={(e) => setRowsText(e.target.value)}
                  />
                </span>
              </label>
              {rowsText.trim() && (
                <p className="ef-help">
                  {parsedRows.rows.length} row{parsedRows.rows.length === 1 ? '' : 's'} read
                  {parsedRows.ignored > 0 && ` · ${parsedRows.ignored} line${parsedRows.ignored === 1 ? '' : 's'} skipped (header or bye)`}
                </p>
              )}
            </>
          )}
          {plan.warnings.map((warning) => (
            <p key={warning} className="ef-help ef-help--warn">
              {warning}
            </p>
          ))}
        </div>
      </Panel>

      <Panel code="03 / FORMAT" title="How to name chapters">
        <div className="ef-form">
          <label className="ef-field">
            <span className="ef-field__label">Name template</span>
            <span className="ef-focus">
              <input
                className="ef-input"
                autoComplete="off"
                spellCheck={false}
                value={prefs.template}
                onChange={(e) => setPref('template', e.target.value)}
              />
            </span>
          </label>
          <p className={templateOk ? 'ef-help' : 'ef-error'}>
            {templateOk
              ? 'Use {opponent} and {score}. For example: ({opponent}) {score}'
              : 'The template needs {opponent} or {score}, or every chapter would get the same name.'}
          </p>
          <div className="ef-field">
            <span className="ef-field__label">Name order</span>
            <Segmented<NameOrder>
              label="Name order"
              value={prefs.nameOrder}
              onChange={(value) => setPref('nameOrder', value)}
              options={[
                { value: 'first-last', label: 'First Last' },
                { value: 'last-first', label: 'Last, First' },
              ]}
            />
          </div>
          <label className="ef-check">
            <input
              type="checkbox"
              checked={prefs.updateChapterName}
              onChange={(e) => setPref('updateChapterName', e.target.checked)}
            />
            <span>Also update [ChapterName] to match (Lichess may read it on import)</span>
          </label>
        </div>
      </Panel>

      {games > 0 && (
        <>
          <SectionHeader index="04" caption="Check each one">
            Chapters
          </SectionHeader>
          <ul className="ef-pgn__rows">
            {entries.map((entry) => {
              const name = result.names[entry.index];
              const missing = missingFields(entry, prefs.template);
              const edited = edits[entry.index] !== undefined;
              const from = [...new Set([entry.opponentFrom, entry.scoreFrom].filter(Boolean))].map((s) => SOURCE[s]).join(' + ');
              const n = entry.index + 1;
              return (
                <li key={entry.index} className={`ef-pgn__row${missing.length ? ' ef-pgn__row--flag' : ''}`}>
                  <div className="ef-pgn__head">
                    <span className="ef-row__lead">{pad2(n)}</span>
                    <span className="ef-pgn__orig">{entry.original || '(no name)'}</span>
                    {missing.length > 0 && <Chip tone="alert">Needs {missing.join(' + ')}</Chip>}
                    {entry.notes.length > 0 && <Chip tone="info">Check</Chip>}
                  </div>
                  <div className="ef-pgn__fields">
                    <span className="ef-focus">
                      <input
                        className="ef-input"
                        autoComplete="off"
                        placeholder="Opponent"
                        aria-label={`Opponent, game ${n}`}
                        value={entry.opponent}
                        onChange={(e) => edit(entry.index, { opponent: e.target.value })}
                      />
                    </span>
                    <span className="ef-focus">
                      <select
                        className="ef-input"
                        aria-label={`Score, game ${n}`}
                        value={entry.score}
                        onChange={(e) => edit(entry.index, { score: e.target.value })}
                      >
                        {['', ...SCORES].map((score) => (
                          <option key={score} value={score}>
                            {SCORE_LABEL[score]}
                          </option>
                        ))}
                      </select>
                    </span>
                  </div>
                  {name ? (
                    <p className="ef-pgn__preview">
                      <span className="ef-pgn__arrow" aria-hidden="true">
                        ▶
                      </span>
                      {name}
                    </p>
                  ) : (
                    <p className="ef-pgn__preview ef-pgn__preview--keep">Keeps its original name until this is filled in</p>
                  )}
                  {(edited || from || pageHref(entry)) && (
                    <div className="ef-pgn__meta">
                      <span className="ef-pgn__from">{edited ? 'Edited by you' : from ? `From ${from}` : ''}</span>
                      {pageHref(entry) && (
                        <Link className="ef-link" href={pageHref(entry)!}>
                          Their page ▶
                        </Link>
                      )}
                    </div>
                  )}
                  {entry.notes.map((note) => (
                    <p key={note} className="ef-pgn__note">
                      {note}
                    </p>
                  ))}
                </li>
              );
            })}
          </ul>

          <Panel code="05 / OUTPUT" title="Renamed PGN" active>
            <div className="ef-pgn__summary">
              <Chip tone="ok">{renamed} renamed</Chip>
              {games - renamed > 0 && <Chip tone="alert">{games - renamed} kept as they were</Chip>}
            </div>
            <span className="ef-focus">
              <textarea
                ref={outputBox}
                className="ef-input ef-textarea"
                rows={8}
                readOnly
                spellCheck={false}
                aria-label="Renamed PGN"
                value={result.text}
                onFocus={(e) => e.currentTarget.select()}
              />
            </span>
            <div className="ef-actions">
              <Button arrow onClick={copy}>
                Copy
              </Button>
              <Button variant="secondary" onClick={download}>
                Download .pgn
              </Button>
            </div>
          </Panel>
        </>
      )}
    </Screen>
  );
}
