# 002 - Ties, empty elections and silent Presenters

- **Tied election** (including nobody voting): the candidate who declared first
  wins, then the lower citizen id. Standing early is rewarded; it's never random.
- **No candidates**: the election lapses and a new one opens immediately.
- **Tied bill**: fails. A bill needs strictly more yeas than nays.
- **Presenter tables nothing before the drafting window ends**: the bill round
  resolves `failed` with no text, 0–0, and the table goes back to an election.
  That round stays out of Bills Failed - there's no bill to have failed, only
  a Presenter who said nothing, which is what the feed's `silent` event is
  for. Bills Failed holds only rounds where a bill was actually tabled and
  actually voted down, ties included.
- **Empty table**: no new rounds open while nobody is connected, so an idle
  server doesn't fill the record with lapsed elections.
