# 90-second walkthrough script

Open the live demo (real `vitejs/vite` issues). Screen at 1440×900, dark mode.

| Time | On screen | Say |
|---|---|---|
| 0:00–0:10 | Landing: briefing line + first card + "Prepared for you" | "Maintainers triage issues in a table or ask a chatbot. Next Move does neither. It has already read all the open issues in Vite." |
| 0:10–0:25 | Point at the briefing, then the tray | "It prepared the routine actions on its own: duplicates, missing repros, docs. Nothing is sent until I approve. The rest need my judgement, most urgent first." |
| 0:25–0:40 | First card: evidence lines, drafted action, labels | "One decision at a time. What it thinks, why, with quotes from the issue, and the exact action: labels from this repo, a drafted reply." Press ⏎. |
| 0:40–0:55 | Find a card it gets wrong (or the "not sure" card) → N → pick alternative → ⏎ | "When it's wrong it costs one key. Not this, pick the right reading, done. And it learned: this toast shows how much the model moved, and which queued cards it re-read." |
| 0:55–1:05 | Tray → open one → "Wrong — let me decide" | "Same for its own initiative. I reject one, it comes back as a question, and every other prepared action is re-checked." |
| 1:05–1:15 | Approve all → History → Download gh script / Undo | "Everything goes through a ledger. Undo, or export a reviewed GitHub CLI script. With a token it applies directly." |
| 1:15–1:30 | "What this replaces" tab | "Here's what it replaces: the dashboard and the Ask-AI box, built from the same data. Around a hundred clicks there, a handful of keystrokes here. The system does the routing, I make the calls." |

Backup: if GitHub rate-limits the recording machine, the deployed build falls back to a CI snapshot of the same repo automatically.
