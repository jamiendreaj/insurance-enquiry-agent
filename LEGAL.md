# Why the rules are what they are

This file exists because the guardrails in this repository make claims about
regulation, and a claim about regulation that nobody can check is just an
assertion with a citation-shaped hole in it.

**It is not legal advice and I am not a lawyer.** It records what the rules
were built from, so that someone who *is* can tell me where I am wrong. Any
firm deploying this should have its own compliance function read it against its
own permissions.

---

## The line that defines the whole agent

Insurance has a distinction running through it that most domains do not:

| | |
| --- | --- |
| **Information** | Describing what a product objectively is. Generally permitted. |
| **Advice** | A *personal recommendation* to a specific customer about a specific product. A **regulated activity**. |

*"The schedule shows an excess of €250"* is information. *"You should take the
flood cover"* is advice. The gap between them is one sentence, and it is
usually the last sentence of an otherwise correct answer, written by a model
trying to be helpful.

Giving advice without the right permission is an offence in most jurisdictions.
Guidance in both the UK and US treats the test the same way: the question is
whether the output is a personal recommendation, not whether it was framed as
one. US state insurance departments take an equivalent line — recommending
policy changes, discussing specific coverages and beginning a sale are all
licensed activity, and an unlicensed person asked for advice must hand the
question to a licensed producer.

**This is why the agent escalates so much.** Escalation is not a limitation
here. It is the correct answer to most of the job.

### Authorisation belongs to people, not to software

A chatbot deployed by an authorised firm *can* carry out regulated activity on
that firm's behalf — but only within permissions the firm actually holds, and
with a journey built for it. A firm config in this repository cannot grant
that. `authorised_to_advise: true` changes one line of the prompt and changes
none of the rules, because a JSON file is not a regulator.

---

## The second constraint, which most people miss

**Whatever this agent says is said by the firm.**

In 2024 a tribunal held an airline responsible for inaccurate information its
chatbot gave a customer. The reasoning generalises: the firm published the
chatbot, so the chatbot's statements are the firm's statements. Insurance
regulators are reported to take the same view of chatbot responses about policy
terms.

That has a concrete engineering consequence, and it is the rule this agent is
really built around:

> **Quote the wording, or escalate. Never paraphrase.**

A paraphrase of a clause is **a new policy term that nobody underwrote**, now
attributable to the firm. "The policy covers accidental damage in the kitchen"
is a sentence the firm is answerable for and never wrote.

So `get_wording` returns clauses verbatim, the prompt requires quotation marks
and a named section, and `guardrails.js` blocks any sentence that asserts what
a policy covers without carrying a quotation. The plain-English summary is not
a kindness. It is an unreviewed contract variation.

---

## "Is this covered?"

The single most dangerous question in the domain, because the
honest-sounding answer is almost always wrong.

Whether a particular loss is covered is a **claims decision**, made against the
facts by someone authorised to make it. An agent that answers has decided a
claim — and because the firm is answerable for what it says, arguably decided
it in the customer's favour.

Saying *no* is the same offence as saying *yes*. Both apply the wording to
facts. The agent may quote the clause. It may not apply it.

---

## What the agent structurally cannot do

Four acts require a licence, so there is **no tool** for any of them:

| Not a tool | Why |
| --- | --- |
| `get_quote` | Pricing is a rating decision. |
| `check_if_covered` | A claims decision. |
| `recommend_product` | The regulated activity itself. |
| `amend_policy` | Binding or varying cover. |

These are not missing features. **A tool the model can reach for is a tool it
will eventually use**, and none of the four has a safe version. There is a test
asserting they do not exist.

---

## Vulnerability

`escalate_to_human` sets urgency automatically: a vulnerable circumstance —
bereavement, illness, financial difficulty — is `immediate`, a live claim or a
complaint is `same_day`. The model does not get to decide this.

A customer in difficulty sitting in a normal queue is a worse outcome than a
wrong answer, and at that moment the agent is the only thing that has read the
message.

---

## What this does not cover

- **Specific permissions.** Whether a given firm may advise on a given product
  is a question about that firm's authorisation, not about this software.
- **Claims handling**, which is a different regulated activity with its own
  rules and is entirely out of scope.
- **Data protection.** GDPR applies to everything this agent collects. The
  `record_enquiry` allow-list is a data-minimisation measure, but this
  repository does not attempt a full GDPR treatment — see the sibling
  `property-enquiry-agent`, where that axis is modelled explicitly.
- **Any jurisdiction's specific wording requirements**, disclosure rules, or
  record-keeping obligations.

---

## Sources

Secondary sources, read 26 October 2026 — industry and regulatory commentary
rather than primary text. They were used to find the shape of the problem, not
to settle it. Anyone relying on this should read the applicable handbook,
directive or state code directly.

- [FCA sounds the alarm on unregulated AI financial advice](https://www.cityam.com/fca-sounds-the-alarm-on-rise-of-unregulated-ai-financial-advice/)
- [AI customer support for UK insurance — FCA considerations](https://www.lorikeetcx.ai/articles/ai-support-uk-insurance-guide)
- [AI chatbot for UK financial services — COBS compliance](https://www.softomatesolutions.com/blog/ai-chatbot-uk-financial-services-fca-cobs-2026/)
- [Policy question chatbots — information vs advice](https://theneuralbase.com/ai-for-insurance/learn/intermediate/policy-question-chatbots/)
- [AI chatbots for insurance agencies: answer and collect, never quote or bind](https://chattermate.chat/ai-chatbot-for-insurance-agencies/)
- [The risks of AI insurance advice](https://www.curabba.com/danger-using-ai-for-insurance-advice/)
- [The AI advice gap — what happens when the machine says yes](https://www.techradar.com/pro/the-ai-advice-gap-what-happens-when-the-machine-says-yes)
