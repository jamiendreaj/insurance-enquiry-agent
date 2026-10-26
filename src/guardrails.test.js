/**
 * Tests for the guardrails.
 *
 * Insurance has a line through it that most domains do not: information is
 * generally permitted, a personal recommendation is a regulated activity. The
 * sentence that crosses it is almost never dramatic. It is the model being
 * helpful in the last line of an otherwise correct answer.
 *
 * So the blocked cases here are deliberately mundane, and the allowed cases
 * are deliberately close to them. A guardrail that only catches the obvious
 * version catches nothing that would actually have been written.
 *
 * Run with: npm test
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { check } from './guardrails.js';

const policy = {
  annual_premium: 342,
  excess: 250,
  buildings_sum_insured: '€280,000',
  single_item_limit: '€1,500',
};
const base = { toolResults: [], policy };

const blocked = (r) => r.issues.filter((i) => i.severity === 'block').map((i) => i.rule);
const warned = (r) => r.issues.filter((i) => i.severity === 'warn').map((i) => i.rule);
const rejects = (text, rule) => {
  const r = check(text, base);
  assert.equal(r.ok, false, `should have blocked: ${text}`);
  if (rule) assert.ok(blocked(r).includes(rule), `expected ${rule}, got [${blocked(r)}] for: ${text}`);
};
const allows = (text, ctx = base) => {
  const r = check(text, ctx);
  assert.equal(r.ok, true, `should have allowed: ${text} — blocked on [${blocked(r)}]`);
};

/* ── RULE ONE: advice ─────────────────────────────────────────────────── */

test('blocks advice in its direct form', () => {
  for (const line of [
    'You should take the flood cover.',
    'You need to increase the sum insured.',
    'I would recommend the higher excess.',
    'My advice would be to switch to comprehensive.',
  ]) rejects(line, 'personal_recommendation');
});

test('blocks advice with an adverb in the way', () => {
  // The sentence a helpful model actually writes. A pattern without an adverb
  // slot reads all of these as a clean pass.
  for (const line of [
    'You should definitely add the flood cover before winter.',
    'You really should consider the higher excess.',
    'You might want to take the accidental damage option.',
    'You probably need to increase the sum insured.',
  ]) rejects(line, 'personal_recommendation');
});

test('blocks the softened forms, which are the ones that get written', () => {
  for (const line of [
    'The best option for you is the comprehensive one.',
    'That one would suit you better.',
    'You would be better off with the higher excess.',
    "Don't bother with the legal expenses add-on.",
    'You probably do not need accidental damage.',
  ]) rejects(line, 'personal_recommendation');
});

test('blocks sufficiency, which is advice wearing a different hat', () => {
  // "That'll be enough" is a recommendation about how much cover to buy.
  for (const line of [
    'That should be enough cover for a house like yours.',
    'You are adequately covered.',
    'You are fully covered for that.',
  ]) rejects(line, 'personal_recommendation');
});

test('allows "should" when it is information, not advice', () => {
  // The pattern matches the verb, not the word "should".
  allows('You should receive the renewal invitation 21 days before the date.');
  allows('The excess should appear on page two of your schedule.');
});

/* ── RULE THREE: deciding cover ───────────────────────────────────────── */

test('blocks a coverage determination either way', () => {
  // Saying no is the same offence as saying yes: both apply the wording to
  // facts, which is a decision for someone authorised to make it.
  for (const line of [
    'Yes, that is covered under your policy.',
    'That would be covered.',
    'That is not covered, I am afraid.',
    'Your claim would be paid without any problem.',
    'You can definitely claim for that.',
  ]) rejects(line, 'coverage_determination');
});

test('blocks putting cover in place', () => {
  for (const line of [
    'You are now covered from today.',
    'I have added the cover and your policy is active.',
    'Consider yourself covered.',
  ]) rejects(line, 'binding_cover');
});

test('blocks claiming a person has confirmed something', () => {
  for (const line of [
    'I have checked with the underwriter and it is fine.',
    'The underwriter has agreed to it.',
  ]) rejects(line, 'false_authority');
});

/* ── RULE TWO: quote, never paraphrase ────────────────────────────────── */

test('blocks a policy term stated in the agent\'s own words', () => {
  // The firm is answerable for this sentence, and the firm never wrote it.
  for (const line of [
    'The policy covers accidental damage to the kitchen.',
    'Your cover includes escape of water.',
    'The wording excludes anything caused by subsidence.',
  ]) rejects(line, 'paraphrased_policy_term');
});

test('allows the same claim when the wording is quoted', () => {
  allows(
    'The wording for Section 3 says: "Loss or damage caused by flood is excluded unless ' +
    'Flood Cover is shown in the schedule." Your schedule does not show it, so I have asked ' +
    'a colleague to confirm what that means for you.',
  );
});

test('a quote has to be long enough to be a quote', () => {
  // "The policy covers 'stuff'" is a paraphrase with decoration.
  rejects('The policy covers "water".', 'paraphrased_policy_term');
});

/* ── premiums ─────────────────────────────────────────────────────────── */

test('allows a premium that is on the schedule', () => {
  allows('Your annual premium is €342 and the excess is €250.');
});

test('allows a figure a tool returned', () => {
  allows('The renewal figure quoted is €389.',
    { ...base, toolResults: [{ known: true, renewal: 389 }] });
});

test('blocks a premium nobody rated', () => {
  for (const line of [
    'It would come to about €480 a year.',
    'Expect somewhere around €500.',
  ]) rejects(line, 'unquoted_premium');
});

test('reads European decimal formatting', () => {
  // "€1.500" is fifteen hundred, and it is the single item limit on file.
  allows('The single item limit on your schedule is €1.500.');
});

/* ── the rest ─────────────────────────────────────────────────────────── */

test('blocks card and bank details', () => {
  rejects('You can give me your card number now.', 'payment_detail');
  rejects('Please send it to our IBAN.', 'payment_detail');
});

test('warns on hedging without blocking', () => {
  const r = check('Policies like this normally include escape of water.', base);
  assert.equal(r.ok, true, 'a hedge is a warning, not a block');
  assert.deepEqual(warned(r), ['hedged_fact']);
});

/* ── the shape of a good reply ────────────────────────────────────────── */

test('a correct reply — quote, fact, handover — passes everything', () => {
  allows(
    'Your schedule shows an excess of €250. On flooding, Section 3 says: ' +
    '"Loss or damage caused by flood is excluded unless Flood Cover is shown in the schedule." ' +
    'Flood Cover is not shown on yours. A colleague who is authorised to advise will come back ' +
    'to you today to talk that through.',
  );
});

test('escalating is never itself a violation', () => {
  allows('That is a question for someone authorised to advise, so I have passed it to a colleague.');
  allows('I do not have that wording on file. I have asked a colleague to confirm it for you.');
});

test('reports every distinct problem in one pass', () => {
  const r = check(
    'Yes that is covered. You should add flood cover too, it would only be about €480.',
    base,
  );
  const rules = blocked(r);
  assert.ok(rules.includes('coverage_determination'));
  assert.ok(rules.includes('personal_recommendation'));
  assert.ok(rules.includes('unquoted_premium'));
});
