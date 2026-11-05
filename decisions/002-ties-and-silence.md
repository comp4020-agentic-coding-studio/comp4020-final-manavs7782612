# 002 — Ties, empty elections and silent Presenters

- **Tied election** (including nobody voting): the candidate who declared first
  wins, then the lower citizen id. Standing early is rewarded; it's never random.
- **No candidates**: the election lapses and a new one opens immediately.
- **Tied bill**: fails. A bill needs strictly more yeas than nays.
- **Presenter tables nothing before the drafting window ends**: the bill round
  resolves `failed` with no text, 0–0, and the table goes back to an election.
- **Empty table**: no new rounds open while nobody is connected, so an idle
  server doesn't fill the record with lapsed elections.
