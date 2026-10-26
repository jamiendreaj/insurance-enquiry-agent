#!/usr/bin/env node
/**
 * One enquiry in, one draft out.
 *
 *   npm run reply -- --policy TO-114 --firm example-firm \
 *                    --enquiry "How big is the second bedroom?"
 *
 * Prints the draft and, crucially, whether it may be sent. A REGULATED ACTIVITY failure
 * is printed differently from an ordinary block, because the person reading
 * this needs to know which is a legal problem and which is a typo.
 */
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { reply, MODEL } from './agent.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const flag = (n, d = null) => { const i = args.indexOf(`--${n}`); return i === -1 ? d : args[i + 1]; };

const policyId = flag('policy', 'example-home');
const firmId = flag('firm', process.env.FIRM ?? 'example-firm');
const enquiry = flag('enquiry');
const mode = flag('mode', process.env.MODE ?? 'approve');
const lang = flag('lang', null);

if (!enquiry) {
  console.error('usage: npm run reply -- --enquiry "..." [--policy id] [--firm id] [--lang it]');
  process.exit(2);
}
if (!process.env.ANTHROPIC_API_KEY) {
  console.error('ANTHROPIC_API_KEY is not set.');
  process.exit(2);
}

const read = (p) => JSON.parse(readFileSync(join(ROOT, p), 'utf8'));
const policy = read(`policies/${policyId}.json`);
const firm = read(`firms/${firmId}.json`);

const C = process.stdout.isTTY && !process.env.NO_COLOR
  ? { dim: (s) => `\x1b[2m${s}\x1b[0m`, red: (s) => `\x1b[31m${s}\x1b[0m`,
      green: (s) => `\x1b[32m${s}\x1b[0m`, yellow: (s) => `\x1b[33m${s}\x1b[0m`,
      bold: (s) => `\x1b[1m${s}\x1b[0m` }
  : { dim: (s) => s, red: (s) => s, green: (s) => s, yellow: (s) => s, bold: (s) => s };

const r = await reply({ policy, firm, enquiry, mode, expectLanguage: lang });

console.log(C.dim(`${firm.name} · ${policy.reference} · ${firm.authorised_to_advise ? 'firm authorised to advise' : 'information only'} · ${MODEL} · ${mode}\n`));
console.log('─'.repeat(68));
console.log(r.draft || C.dim('(no text)'));
console.log('─'.repeat(68));

if (r.sendable) {
  console.log(C.green(C.bold('\nSENDABLE')) + C.dim('  — a person still approves it in approve mode'));
} else {
  const grave = /REGULATED ACTIVITY/.test(r.blocked_because ?? '');
  console.log((grave ? C.red(C.bold('\nDO NOT SEND')) : C.yellow(C.bold('\nBLOCKED'))) + '  ' + r.blocked_because);
  for (const i of r.guardrails.issues.filter((x) => x.severity === 'block')) {
    console.log(C.red(`  ✗ ${i.rule}`) + C.dim(` — ${i.detail}`));
  }
}

for (const i of r.guardrails.issues.filter((x) => x.severity === 'warn')) {
  console.log(C.yellow(`  ⚠ ${i.rule}`) + C.dim(` — ${i.detail}`));
}

if (r.escalated) {
  console.log(C.dim('\nescalated: ') + r.escalations.map((e) => e.reason).join(', '));
  for (const e of r.escalations) console.log(C.dim(`  "${e.summary}"`));
}

if (Object.keys(r.enquiry_record).length) {
  console.log(C.dim('\nrecorded: ') + JSON.stringify(r.enquiry_record));
}
if (r.quoted_sections?.length) {
  console.log(C.dim('quoted:   ') + r.quoted_sections.join(' · '));
}
if (r.refused_fields.length) {
  // Worth printing even though nothing was stored: a model reaching for a
  // health or income field is a signal about the prompt.
  console.log(C.yellow('refused:  ') + r.refused_fields.join(', ') +
    C.dim('  (outside the permitted set — discarded, not stored)'));
}

console.log(C.dim(`\n${r.latency_ms}ms · ${r.tokens_used}/${r.token_budget} tokens · ${r.usage.cache_read} cached`));
process.exit(r.sendable ? 0 : 1);
