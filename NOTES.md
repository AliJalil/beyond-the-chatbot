Next Move: GitHub issue triage with no chat and no dashboard. It reads a real repo's issues (vitejs/vite by default, any public repo from the header), infers what each one needs, and shows one decision at a time with its reasons and a ready action.

WHAT TO LOOK AT
1. First screen: it has already read the tracker, prepared routine actions itself ("Prepared for you", nothing sent until approved), and queued the rest most-urgent-first. ⏎ do it, N not this, S later, E edit reply.
2. Wrong-guess recovery: close calls become "which is it?" cards; N shows ranked alternatives with evidence; every correction is an online update, the queue is re-read, and a toast shows the change (e.g. 41% → 72%). Rejecting a prepared action turns it into a question and re-checks the rest. Undo also rolls back the lesson. See docs/FAILURE_TEST.md.
3. "What this replaces": dashboard + Ask-AI built from the same data, side by side.
4. "How it decides": the live pipeline data → intent → decision → action.

KEY DECISIONS
- Intent inference = 18 explainable signals + TF-IDF duplicate search → logistic model over 9 intents; starts from priors, learns from each call, saved per repo. No hardcoded flows.
- Explainability is the UI: every card quotes the words that fired.
- Autopilot has a written policy: low-risk intents, ≥72% and 35-pt margin; security/closing questions are always human.
- Dry run by default (export gh CLI script); optional token applies via REST with undo.

AI USAGE: the model is deliberately not an LLM, so guesses stay inspectable and correctable in one key. Built with Claude as a coding assistant.

STACK: TypeScript engine (browser + Node CLI), React + Tailwind, Vite, Vitest (23 tests). CI snapshots real issues daily and deploys to Pages.

OUT OF SCOPE: shared team model, LLM reply drafting, issues beyond the last ~200 open / ~100 closed.
