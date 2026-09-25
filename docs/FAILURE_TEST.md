# Failure test: when the interface guesses wrong

A post-chat interface acts before you ask, so it will sometimes be wrong. The design goal is that a wrong guess is **visible, cheap to fix, and makes the next guess better**. It should never be silent or sticky.

Open the demo with the built-in sample so the numbers below match: `…/beyond-the-chatbot/?sample=1`.
Two of these scenarios are also automated in `tests/engine.test.ts` (search "FAILURE TEST").

## Scenario A: it isn't sure, so it asks

1. Approve the first four cards (<kbd>⏎</kbd>). Next is **#1352 "Build is slow"**: *"My build takes 3 minutes. Why?"*
2. The model reads it as *needs a reproduction* 53% vs *usage question* 41%. That margin is under 12 points, so **it does not guess**. The card says "I'm not sure about this one" and shows both readings with their evidence.
3. Press <kbd>2</kbd> (usage question), then <kbd>⏎</kbd>.
4. **Result:** the issue is redirected to Discussions. A toast shows the lesson: *"Issues like #1352 now read as usage question: 41% → 72%."* Rescoring this card gives *question 72% / needs-repro 23%*, and it would no longer abstain.

## Scenario B: it did something on its own, and it was wrong

1. In **Prepared for you**, open *"Close as duplicate of #1409"* (#1411).
2. Click **Wrong — let me decide**.
3. **Result:**
   - Nothing was ever sent. Prepared actions are only proposals.
   - The card jumps to the front **as a question**. The rejected reading is removed from the options: *"You turned down duplicate for this one. What is it instead?"*
   - The model takes a rejection step (duplicate for #1411 drops from 98% to 74%). Every other prepared action is **re-checked against the autopilot policy**. Any that fall below 72% confidence or 35 points of margin go back to the human queue instead of staying pre-approved. (#1396 drops from 98% to 82% and stays prepared.)

## Scenario C: the human was wrong

1. Approve any card, then click **Undo** on the toast (or in History).
2. **Result:** the card comes back to the front of the queue. Because it was the latest action, **the model weights are rolled back** to before that decision. The system doesn't keep a lesson you took back.
3. With a token connected, undo also reverses the change on GitHub: reopen, restore labels, delete the posted comment.

## Scenario D: the outside world fails

| Failure | What happens |
|---|---|
| GitHub rejects a write (no permission, label missing, network) | The ledger entry is marked undone, the card returns to the queue, and a toast says what failed and that **nothing was changed**. |
| Rate limit (60 req/h unauthenticated) | Clear message. The app falls back to the CI-built snapshot of a real repo, then to the sample, and the header badge shows which one is in use. |
| Repo has no matching label (e.g. no `needs reproduction`) | The action still proposes the conventional name. Label chips can be removed with one click before approving. |
| `localStorage` blocked (private mode) | Learning still works for the session. Nothing is persisted. |

## Guardrails that prevent the worst wrong guesses

- **Security reports are never prepared automatically** and always go first in the queue.
- Closing a *question* or a *stale* issue ends a conversation with a person, so those always need a human.
- Duplicates only point at **older** or **closed-as-completed** issues. It never closes the original in favour of a newer copy.
- Every card shows **why**, with quotes from the issue, so a wrong reason is visible before you approve.
