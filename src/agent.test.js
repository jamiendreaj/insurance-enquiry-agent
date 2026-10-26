/**
 * Tests for the agent loop.
 *
 * `reply()` takes an injectable client, so the whole loop runs against
 * scripted responses — no network, no API key.
 *
 * Two things here are specific to this domain:
 *
 *   A regulated-activity failure is reported differently from a typo. The
 *   person clearing the queue needs to know which of these is a compliance
 *   problem and which is a mistake, and treating them alike trains people to
 *   ignore both.
 *
 *   `quoted_sections` is surfaced on the result. An answer about a policy that
 *   quoted nothing is a smell: it means the agent described cover without
 *   opening the document.
 *
 * Run with: npm test
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { reply, DEFAULT_TOKEN_BUDGET } from './agent.js';

const policy = {
  reference: 'HOM-4471',
  product: 'Home — Buildings & Contents',
  facts: { annual_premium: '€342', excess: '€250', flood_cover: 'Not shown on the schedule' },
  sections: ['Section 1 — Buildings', 'Section 3 — General exclusions'],
  wording: {
    'Section 3 — General exclusions':
      'Loss or damage caused by flood is excluded unless Flood Cover is shown in the schedule.',
    'Section 1 — Buildings': 'Accidental damage to fixed glass and sanitary ware is covered.',
  },
};

const firm = { name: 'Esempio Assicurazioni', languages: ['it', 'en'], authorised_to_advise: false };

function fake(turns) {
  let i = 0;
  return {
    messages: {
      create: async () => {
        const t = turns[Math.min(i, turns.length - 1)];
        i += 1;
        return {
          stop_reason: t.stop ?? 'end_turn',
          content: t.content ?? [{ type: 'text', text: t.text ?? '' }],
          usage: {
            input_tokens: t.input ?? 2400, output_tokens: t.output ?? 160,
            cache_read_input_tokens: 0, cache_creation_input_tokens: 0,
          },
        };
      },
    },
  };
}

const run = (turns, opts = {}) =>
  reply({ policy, firm, enquiry: 'Am I covered for flooding?', client: fake(turns), ...opts });

const QUOTED =
  'Section 3 says: "Loss or damage caused by flood is excluded unless Flood Cover is shown in ' +
  'the schedule." Your schedule does not show it, so a colleague will come back to you.';

/* ── how failures are reported ────────────────────────────────────────── */

test('a regulated-activity failure says so in plain words', async () => {
  const r = await run([{ text: 'Yes, that is covered under your policy.' }]);
  assert.equal(r.sendable, false);
  assert.match(r.blocked_because, /REGULATED ACTIVITY/);
  assert.match(r.blocked_because, /authorised person/);
});

test('advice is reported as a regulated activity', async () => {
  const r = await run([{ text: 'You should definitely add the flood cover.' }]);
  assert.match(r.blocked_because, /REGULATED ACTIVITY/);
  assert.match(r.blocked_because, /personal_recommendation/);
});

test('a paraphrase is reported as a regulated activity', async () => {
  const r = await run([{ text: 'The policy covers accidental damage in the kitchen.' }]);
  assert.match(r.blocked_because, /REGULATED ACTIVITY/);
  assert.match(r.blocked_because, /paraphrased_policy_term/);
});

test('an ordinary mistake is NOT dressed up as a compliance problem', async () => {
  // A card-details slip is a mistake. Labelling it a regulated activity would
  // train whoever reads the queue to ignore the label.
  const r = await run([{ text: 'You can give me your card number now.' }]);
  assert.equal(r.sendable, false);
  assert.equal(/REGULATED ACTIVITY/.test(r.blocked_because), false);
  assert.match(r.blocked_because, /payment_detail/);
});

test('a quoted, escalated reply is sendable', async () => {
  const r = await run([{ text: QUOTED }]);
  assert.equal(r.sendable, true);
  assert.equal(r.blocked_because, null);
});

/* ── quoting ──────────────────────────────────────────────────────────── */

test('sections the agent actually opened are reported', async () => {
  const r = await run([
    {
      content: [{
        type: 'tool_use', id: 't1', name: 'get_wording',
        input: { section: 'Section 3 — General exclusions' },
      }],
    },
    { text: QUOTED },
  ]);
  assert.deepEqual(r.quoted_sections, ['Section 3 — General exclusions']);
});

test('an answer that quoted nothing is visible as such', async () => {
  // Not a failure on its own — plenty of enquiries need no wording. But an
  // answer ABOUT cover with an empty quote list is the shape of a paraphrase
  // that slipped through, and a reviewer should be able to see it.
  const r = await run([{ text: 'Your schedule shows an excess of €250.' }]);
  assert.deepEqual(r.quoted_sections, []);
  assert.equal(r.sendable, true);
});

test('wording that is not on file returns known:false rather than inventing', async () => {
  const r = await run([
    { content: [{ type: 'tool_use', id: 't1', name: 'get_wording', input: { section: 'Section 9' } }] },
    { text: 'I do not have that section on file. A colleague will confirm it for you.' },
  ]);
  assert.equal(r.tool_calls[0].output.known, false);
  assert.deepEqual(r.quoted_sections, [], 'nothing was quoted, because nothing was found');
  assert.equal(r.sendable, true);
});

/* ── escalation and vulnerability ─────────────────────────────────────── */

test('a vulnerable circumstance escalates immediately, without the model deciding', async () => {
  // A bereaved customer in a normal queue is a worse outcome than a wrong
  // answer, and the agent is the only thing that has read the message yet.
  const r = await run([
    {
      content: [{
        type: 'tool_use', id: 't1', name: 'escalate_to_human',
        input: { reason: 'vulnerability', summary: 'Customer mentions a bereavement.' },
      }],
    },
    { text: 'I am sorry. A colleague will call you today.' },
  ]);
  assert.equal(r.escalations[0].urgency, 'immediate');
  assert.equal(r.sendable, true, 'escalating is the correct answer, not a failure');
});

test('a live claim escalates same day', async () => {
  const r = await run([
    {
      content: [{
        type: 'tool_use', id: 't1', name: 'escalate_to_human',
        input: { reason: 'live_claim', summary: 'Asks about a claim already open.' },
      }],
    },
    { text: 'A colleague will come back to you today.' },
  ]);
  assert.equal(r.escalations[0].urgency, 'same_day');
});

/* ── what may be recorded ─────────────────────────────────────────────── */

test('personal circumstances are refused, not stored', async () => {
  const r = await run([
    {
      content: [{
        type: 'tool_use', id: 't1', name: 'record_enquiry',
        input: {
          topic: 'cover_question', customer_words: 'is flooding covered',
          health: 'recovering from surgery', income: '30000', household: '2 adults',
        },
      }],
    },
    { text: QUOTED },
  ]);
  assert.deepEqual(r.refused_fields.sort(), ['health', 'household', 'income']);
  assert.deepEqual(Object.keys(r.enquiry_record).sort(), ['customer_words', 'topic']);
});

/* ── the loop ─────────────────────────────────────────────────────────── */

test('a truncated reply is never sendable', async () => {
  const r = await run([{ stop: 'max_tokens', text: 'Section 3 says' }]);
  assert.equal(r.sendable, false);
  assert.equal(r.truncated, true);
});

test('finishing with no text block is named, not crashed on', async () => {
  const r = await run([{ content: [{ type: 'thinking', thinking: 'at length...' }] }]);
  assert.equal(r.sendable, false);
  assert.match(r.blocked_because, /no text/);
});

test('the token budget stops a runaway tool loop', async () => {
  const greedy = {
    content: [{ type: 'tool_use', id: 't1', name: 'get_schedule_fact', input: { field: 'x' } }],
    input: 9000, output: 1000,
  };
  const r = await run([greedy], { tokenBudget: 25_000 });
  assert.equal(r.budget_exhausted, true);
  assert.ok(r.tokens_used >= 25_000);
  assert.ok(r.tokens_used < 60_000);
});

test('a tool that throws does not kill the run', async () => {
  const r = await run([
    { content: [{ type: 'tool_use', id: 't1', name: 'does_not_exist', input: {} }] },
    { text: QUOTED },
  ]);
  assert.ok('error' in r.tool_calls[0].output);
  assert.equal(r.sendable, true);
});

test('usage accumulates and the budget is reported', async () => {
  const r = await run([
    { content: [{ type: 'tool_use', id: 't1', name: 'get_schedule_fact', input: { field: 'excess' } }], input: 100, output: 20 },
    { text: QUOTED, input: 150, output: 30 },
  ]);
  assert.equal(r.usage.input, 250);
  assert.equal(r.token_budget, DEFAULT_TOKEN_BUDGET);
});

test('the wording and rules are sent with cache_control', async () => {
  const client = fake([{ text: QUOTED }]);
  let seen = null;
  const create = client.messages.create.bind(client.messages);
  client.messages.create = (req) => { seen = req; return create(req); };
  await reply({ policy, firm, enquiry: 'excess?', client });
  assert.equal(seen.system[0].cache_control.type, 'ephemeral');
});

test('no tool exists for the four acts that require a licence', async () => {
  const client = fake([{ text: QUOTED }]);
  let seen = null;
  const create = client.messages.create.bind(client.messages);
  client.messages.create = (req) => { seen = req; return create(req); };
  await reply({ policy, firm, enquiry: 'excess?', client });

  const names = seen.tools.map((t) => t.name);
  for (const forbidden of ['get_quote', 'check_if_covered', 'recommend_product', 'amend_policy']) {
    assert.equal(names.includes(forbidden), false,
      `${forbidden} must not exist — a tool the model can reach for is one it will use`);
  }
});
