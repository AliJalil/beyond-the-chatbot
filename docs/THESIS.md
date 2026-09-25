# After the chatbot: interfaces that hold a belief

*Two-year thesis, ≤300 words*

Chat and dashboards fail in the same way: they make the human do the routing. A dashboard shows everything and leaves you to find what matters. A chatbot waits for you to put into words what you need. Both are fallbacks for software that doesn't know what the user needs next.

By 2028 the default AI-native interface won't be a conversation. It will be a **decision surface**: an interface that keeps a live belief about the state of the work and what each item needs, and shows only the decision that belief can't settle alone. Three patterns will define it:

1. **Belief, not answers.** The system reads the data first and forms a hypothesis per item, with evidence attached. The UI shows the hypothesis and the reason together. That makes a wrong guess obvious at a glance, and a quick look is all the checking most guesses need.

2. **Initiative with a leash.** The interface prepares work before being asked, but inside a written policy: which kinds of action, what confidence level, and what always needs a person. Autonomy becomes a setting you can inspect, not a mood of the model.

3. **Corrections as the main input.** The most valuable thing a user types isn't a prompt. It's "not this." Each correction should immediately change the next guess, and the system should say what it learned. Personalisation will come from these corrections, not from settings pages.

What changes for builders: explainability stops being a compliance feature and becomes the UI. Undo becomes infrastructure. And "time to decision" replaces "engagement" as the metric that matters.

Chat won't disappear. It stays as the escape hatch for work the system can't anticipate. But when chat is where the work happens, that is a sign the product doesn't yet understand the job.
