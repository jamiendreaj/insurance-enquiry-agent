/**
 * A second pair of eyes on the finished reply.
 *
 * Insurance has a line through it that most domains do not: the difference
 * between INFORMATION and ADVICE.
 *
 *   Information  — describing what a product objectively is.
 *                  "The policy wording says flooding is excluded."
 *   Advice       — a personal recommendation to a specific person.
 *                  "You should take the flood cover."
 *
 * The first is generally permitted. The second is a regulated activity, and
 * doing it without the right permission is an offence in most of the world.
 * The sentence that crosses the line is rarely dramatic; it is usually the
 * model being helpful at the end of an otherwise correct answer.
 *
 * And there is a second constraint most people miss. A 2024 tribunal held an
 * airline responsible for what its chatbot told a customer. So whatever this
 * agent says about a policy is a statement BY THE FIRM about that policy. It
 * does not get to paraphrase cover. It quotes the wording, or it escalates.
 */

/* ── 1. advice: a personal recommendation ─────────────────────────────── */

const ADVICE = [
  // the direct form
  // The adverb slot is not optional decoration. "You should DEFINITELY add
  // the flood cover" is the sentence a helpful model actually writes, and a
  // pattern without it reads as a clean pass.
  /\byou\s+(?:really\s+|probably\s+)?(?:should|ought\s+to|need\s+to|must|might\s+want\s+to|may\s+want\s+to)\s+(?:\w+ly\s+)?(?:take|get|buy|choose|add|go\s+for|opt\s+for|consider|increase|reduce|drop|cancel|switch|look\s+at)\b/i,
  /\bi(?:'d|\s+would)\s+(?:recommend|suggest|advise|go\s+(?:for|with))\b/i,
  /\b(?:my|our)\s+(?:advice|recommendation)\s+(?:is|would\s+be)\b/i,
  // the softened form, which is the one that actually gets written
  /\b(?:the\s+)?best\s+(?:option|policy|cover|choice|one)\s+for\s+you\b/i,
  /\b(?:this|that)\s+(?:one|policy|option)\s+(?:would|will)\s+(?:suit|work\s+(?:for|best\s+for))\s+you\b/i,
  /\byou(?:'d|\s+would)\s+be\s+(?:better\s+off|fine|covered)\s+(?:with|taking|choosing)\b/i,
  /\b(?:don'?t|do\s+not)\s+bother\s+with\b/i,
  /\byou\s+(?:probably\s+)?(?:don'?t|do\s+not)\s+need\b/i,
  // sufficiency, which is advice wearing a different hat
  /\b(?:that\s+)?(?:should|will)\s+be\s+enough\s+cover\b/i,
  /\b(?:you(?:'re|\s+are)\s+)?(?:adequately|sufficiently|fully)\s+covered\b/i,
];

/* ── 2. coverage determinations ───────────────────────────────────────── */

/**
 * "Is this covered?" is the single most dangerous question in the domain.
 *
 * Whether a particular loss is covered is a claims decision, made against the
 * facts by someone authorised to make it. An agent that answers it has decided
 * a claim — and because the firm is answerable for what the agent says, it has
 * arguably decided it in the customer's favour.
 *
 * The agent may quote the wording. It may not apply it.
 */
const COVERAGE_DETERMINATION = [
  /\b(?:yes|yep|yeah)[,.]?\s+(?:that(?:'s|\s+is)|it(?:'s|\s+is)|you(?:'re|\s+are))\s+covered\b/i,
  /\b(?:that|this|it)\s+(?:would|will|should)\s+be\s+covered\b/i,
  /\b(?:you|that|this)\s+(?:can|could|should)\s+(?:definitely\s+)?claim\b/i,
  /\b(?:that(?:'s|\s+is)|it(?:'s|\s+is))\s+(?:not\s+covered|excluded|outside\s+the\s+policy)\b/i,
  /\byour\s+claim\s+(?:would|will|should)\s+(?:be\s+)?(?:paid|accepted|approved|declined|rejected)\b/i,
  /\b(?:the\s+)?(?:excess|deductible)\s+(?:would|will)\s+not\s+apply\b/i,
];

/* ── 3. quoting and binding ───────────────────────────────────────────── */

/** A premium nobody rated. Same shape as every other price guardrail here. */
const PRICE = /(?:€|EUR\s?|£|\$)\s?(\d[\d.,]*)|(\d[\d.,]*)\s?(?:€|euro|EUR|£|\$)/gi;

function numbersIn(text) {
  const out = new Set();
  for (const m of text.matchAll(PRICE)) {
    const raw = (m[1] ?? m[2] ?? '').replace(/[.,](?=\d{3}\b)/g, '').replace(',', '.');
    const n = Number.parseFloat(raw);
    if (Number.isFinite(n)) out.add(n);
  }
  return out;
}

function authorisedNumbers(toolResults, policy) {
  const ok = new Set();
  const walk = (v) => {
    if (typeof v === 'number') ok.add(v);
    else if (typeof v === 'string') for (const n of numbersIn(v)) ok.add(n);
    else if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === 'object') Object.values(v).forEach(walk);
  };
  toolResults.forEach(walk);
  walk(policy ?? {});
  return ok;
}

/** Cover placed, which only an authorised person can do. */
const BINDING = [
  /\b(?:you(?:'re|\s+are)\s+(?:now\s+)?(?:covered|on\s+cover|insured)\s+from\b)/i,
  /\b(?:i(?:'ve|\s+have)\s+)?(?:added|arranged|set\s+up|put)\s+(?:the\s+)?(?:cover|policy|it)\s+(?:on|in\s+place|live)\b/i,
  /\byour\s+(?:policy|cover)\s+(?:is\s+)?(?:now\s+)?(?:active|in\s+force|live|bound)\b/i,
  /\b(?:consider\s+(?:it|yourself)\s+covered|cover\s+starts\s+(?:today|now|immediately))\b/i,
];

/* ── 4. the paraphrase rule ───────────────────────────────────────────── */

/**
 * Words that assert what the policy says, without the policy saying it.
 *
 * A reply may state a policy term only by quoting it. If the text asserts
 * cover in its own words — "the policy covers X" — and carries no quotation,
 * the agent has written a policy term the firm never wrote, and the firm is
 * answerable for it.
 */
const ASSERTS_TERM =
  /\b(?:the\s+)?(?:policy|cover|wording|schedule)\s+(?:covers|includes|excludes|pays|protects|does\s+not\s+cover)\b/i;

/** Evidence of an actual quotation rather than a paraphrase. */
const HAS_QUOTE = /[""].{8,}[""]|"[^"]{8,}"|«.{8,}»/;

/* ── 5. the rest ──────────────────────────────────────────────────────── */

const PAYMENT = /\b(?:card\s+number|cvv|iban|sort\s+code|bank\s+transfer\s+to)\b/i;

/** Anything that pretends a human has signed it off. */
const FALSE_AUTHORITY =
  /\b(?:i(?:'ve|\s+have)\s+(?:checked|confirmed)\s+with\s+(?:the\s+)?(?:underwriter|insurer|claims)|the\s+underwriter\s+(?:says|has\s+agreed|confirmed))\b/i;

/* ── the check ────────────────────────────────────────────────────────── */

export function check(reply, { toolResults = [], policy = {}, expectLanguage = null } = {}) {
  const issues = [];
  const add = (rule, severity, detail) => issues.push({ rule, severity, detail });

  for (const re of ADVICE) {
    const hit = reply.match(re);
    if (hit) { add('personal_recommendation', 'block', `Advice, not information: "${hit[0].trim()}".`); break; }
  }

  for (const re of COVERAGE_DETERMINATION) {
    const hit = reply.match(re);
    if (hit) { add('coverage_determination', 'block', `Decides cover: "${hit[0].trim()}".`); break; }
  }

  for (const re of BINDING) {
    const hit = reply.match(re);
    if (hit) { add('binding_cover', 'block', `Puts cover in place: "${hit[0].trim()}".`); break; }
  }

  const authorised = authorisedNumbers(toolResults, policy);
  for (const n of numbersIn(reply)) {
    if (!authorised.has(n)) add('unquoted_premium', 'block', `States ${n}, which no tool or document returned.`);
  }

  // The paraphrase rule: assert a term, and you must be quoting one.
  if (ASSERTS_TERM.test(reply) && !HAS_QUOTE.test(reply)) {
    add('paraphrased_policy_term', 'block',
      'States what the policy covers without quoting the wording. The firm is answerable for this sentence.');
  }

  if (PAYMENT.test(reply)) add('payment_detail', 'block', 'Mentions card or bank details.');
  if (FALSE_AUTHORITY.test(reply)) {
    add('false_authority', 'block', 'Claims a person or underwriter has confirmed something.');
  }

  if (/\b(?:usually|typically|normally|generally|in\s+most\s+cases|i\s+think|should\s+be\s+fine)\b/i.test(reply)) {
    add('hedged_fact', 'warn', 'Hedging usually marks a term the wording did not contain.');
  }

  return { ok: !issues.some((i) => i.severity === 'block'), issues };
}

export { ADVICE, COVERAGE_DETERMINATION, BINDING, ASSERTS_TERM, HAS_QUOTE };
