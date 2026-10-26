# insurance-enquiry-agent

Answers insurance enquiries from a customer's own documents — without advising,
quoting, binding, or deciding a claim.

```bash
npm test                 # 38 tests, offline, no API key
npm run reply -- --enquiry "Am I covered for flooding?"
```

---

## The line this agent is built around

Insurance has a distinction running through it that most domains do not.

| | |
| --- | --- |
| **Information** | *"The schedule shows an excess of €250."* Generally permitted. |
| **Advice** | *"You should take the flood cover."* A **regulated activity**. |

One sentence apart. And the sentence that crosses it is almost never dramatic —
it is the model being helpful in the last line of an otherwise correct answer.

So the agent gives information. A person gives advice. **Escalation is the
correct answer to most of this job, not a limitation of it.**

---

## The rule nobody else has

In 2024 a tribunal held an airline responsible for what its chatbot told a
customer. The reasoning generalises: **whatever this agent says is said by the
firm.**

Which means it does not get to describe cover in its own words.

```
BLOCKED   The policy covers accidental damage in the kitchen.

ALLOWED   Section 3 says: "Loss or damage caused by flood is excluded
          unless Flood Cover is shown in the schedule." Your schedule
          does not show it, so a colleague will confirm what that
          means for you.
```

Same subject, opposite outcome. The first is **a new policy term that nobody
underwrote**, now attributable to the firm. The second quotes the document and
hands the interpretation to a person.

> **Quote the wording, or escalate. Never paraphrase.**

The plain-English summary is not a kindness. It is an unreviewed contract
variation.

`get_wording` returns clauses verbatim so there is always something to quote —
"never paraphrase" is an empty instruction otherwise.

---

## "Is this covered?"

The most dangerous question in the domain, because the honest-sounding answer
is almost always wrong.

Whether a loss is covered is a **claims decision**, made against the facts by
someone authorised to make it. **Saying no is the same offence as saying yes.**
Both apply the wording. The agent quotes the clause; a person applies it.

---

## What it catches

| Rule | Catches |
| --- | --- |
| `personal_recommendation` | Advice, including the softened kind — *"I'd go for…"*, *"you'd be better off with…"*, *"that should be enough cover"*, *"you're adequately covered"*. And with an adverb in the way: *"you should **definitely** add…"* |
| `coverage_determination` | Deciding a claim, in either direction |
| `paraphrased_policy_term` | Stating what a policy covers without quoting it |
| `binding_cover` | *"You're now covered from today"* |
| `false_authority` | *"I've checked with the underwriter"* |
| `unquoted_premium` | Any figure no rating tool or document returned |

Plus a `hedged_fact` warning — *"policies like this normally include…"* is
usually a term the wording did not contain.

---

## Four tools, and four that deliberately do not exist

| Tool | Does |
| --- | --- |
| `get_wording` | Returns a clause **verbatim**, or `known:false` |
| `get_schedule_fact` | One figure from the schedule, or `known:false` |
| `record_enquiry` | The topic and their words. Allow-listed in code |
| `escalate_to_human` | Hands over, with an urgency it sets itself |

There is **no** `get_quote`, `check_if_covered`, `recommend_product` or
`amend_policy`. Each is a licensed act. A tool the model can reach for is a
tool it will eventually use, so there is a test asserting none of them exists.

### Vulnerability sets its own urgency

Bereavement, illness or financial difficulty escalates as `immediate`. A live
claim or complaint as `same_day`. **The model does not decide this.**

A customer in difficulty sitting in a normal queue is a worse outcome than a
wrong answer, and at that moment the agent is the only thing that has read the
message.

### Personal circumstances are refused, not stored

`record_enquiry` keeps an allow-list in code. Ask it to save a health note and
it will not:

```
record: { recorded: ["topic","customer_words"],
          refused:  ["health","income","household"] }
```

---

## Tests

```bash
npm test
```

38 tests, all offline. `reply()` takes an injectable client, so the loop runs
against scripted responses with no API key.

What the suite leans on:

- **Every form of advice**, including the softened ones and the adverb gap.
  *"You should definitely add the flood cover"* was a real miss before a test
  existed for it
- **"Should" allowed when it is information** — *"you should receive the
  renewal invitation 21 days before"* must pass. The pattern matches the verb,
  not the word
- **The paraphrase pair** — the same claim blocked unquoted, allowed quoted
- **A regulated-activity failure reported differently** from an ordinary
  mistake, and an ordinary mistake not dressed up as a compliance problem
- **`quoted_sections` surfaced** — an answer about cover that quoted nothing is
  the shape of a paraphrase that slipped through
- Truncation, refusal, a blown budget, and a clean finish returning no text

---

## Layout

```
src/
  prompt.js         three rules, stated as prohibitions
  guardrails.js     the checks that run after the model has finished
  tools.js          four tools, and the allow-list
  agent.js          the loop
  cli.js            one enquiry in, one draft out
  *.test.js         38 tests
policies/           one per document — real ones gitignored
firms/              firm config: languages, permissions
LEGAL.md            what the rules were built from, with sources
```

---

## Scope

Not in this repo and all genuinely out of scope: quoting, rating, claims
handling, policy administration, renewals pricing.

**Not legal advice.** [LEGAL.md](LEGAL.md) records what the rules were built
from so that a compliance function can say where they are wrong. Any firm
deploying this should read it against its own permissions.

MIT.
