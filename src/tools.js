/**
 * Four tools.
 *
 * `get_wording` is the important one, and it is the reason RULE TWO is
 * enforceable rather than aspirational. "Never paraphrase" is an empty
 * instruction if the agent has nothing to quote; given a tool that returns
 * clauses verbatim, it becomes the easier path as well as the required one.
 *
 * Note what is NOT a tool. There is no `get_quote`, no `check_if_covered`, no
 * `recommend_product`, no `amend_policy`. Those are not missing features — a
 * tool the model can reach for is a tool it will eventually use, and each of
 * those four is a regulated act.
 */

export function toolsFor(policy, firm = {}) {
  const sections = policy.sections ?? [];

  return [
    {
      name: 'get_wording',
      description:
        'Return the policy wording for one section, VERBATIM. This is the only legitimate source ' +
        'of what a policy says. Quote what it returns, in quotation marks, naming the section. ' +
        'If it returns known:false the wording is not on file and you do not know — say you will ' +
        'confirm, and escalate. Never reconstruct a clause from memory.',
      input_schema: {
        type: 'object',
        properties: {
          section: {
            type: 'string',
            enum: sections.length ? sections : ['none on file'],
            description: 'Which section of this policy to return.',
          },
        },
        required: ['section'],
      },
    },

    {
      name: 'get_schedule_fact',
      description:
        'Look up one figure or flag from the customer\'s schedule — excess, sum insured, premium ' +
        'as written, whether an optional cover is shown. Returns known:false when it is not ' +
        'recorded, and then you say you will confirm it rather than estimating.',
      input_schema: {
        type: 'object',
        properties: { field: { type: 'string', description: 'What is being asked about, in plain words.' } },
        required: ['field'],
      },
    },

    {
      name: 'record_enquiry',
      description:
        'Record what the customer is asking about, so a colleague can pick it up. Only the fields ' +
        'below. Never record anything about their health, finances, household, or circumstances, ' +
        'even if they volunteer it.',
      input_schema: {
        type: 'object',
        properties: {
          topic: {
            type: 'string',
            enum: ['cover_question', 'claim', 'renewal', 'change_request', 'premium',
                   'complaint', 'document_request', 'other'],
          },
          section_referenced: { type: 'string' },
          customer_words: {
            type: 'string',
            description:
              'What they asked, in their own words, about the POLICY. Never a summary of their ' +
              'personal situation.',
          },
        },
        required: ['topic'],
      },
    },

    {
      name: 'escalate_to_human',
      description:
        'Hand the enquiry to a person, with a summary. Call this for any recommendation, any ' +
        'question of whether something is covered, anything about a live claim, any price, any ' +
        'change to cover, any complaint, and any vulnerable circumstance. Always also tell the ' +
        'customer that a colleague will come back to them.',
      input_schema: {
        type: 'object',
        properties: {
          reason: {
            type: 'string',
            enum: ['advice_requested', 'coverage_question', 'live_claim', 'price_or_quote',
                   'change_or_cancellation', 'complaint', 'vulnerability',
                   'wording_not_on_file', 'unsupported_language', 'other'],
          },
          /*
           * Urgency exists for one reason: a vulnerable customer waiting in a
           * normal queue is a worse outcome than a wrong answer, and the model
           * is the only thing that has read the message yet.
           */
          urgency: { type: 'string', enum: ['normal', 'same_day', 'immediate'] },
          summary: {
            type: 'string',
            description:
              'Two or three sentences for the colleague: what the customer wants and what is ' +
              'needed. Factual, about the enquiry.',
          },
          customer_language: { type: 'string' },
        },
        required: ['reason', 'summary'],
      },
    },
  ];
}

/** Fields `record_enquiry` may persist. Enforced here, not trusted to the schema. */
const RECORDABLE = new Set(['topic', 'section_referenced', 'customer_words']);

export async function runTool(policy, firm, name, input, ctx) {
  switch (name) {
    case 'get_wording': {
      const wording = policy.wording ?? {};
      const asked = String(input.section ?? '');
      const hit = Object.entries(wording).find(([k]) => k.toLowerCase() === asked.toLowerCase());
      if (!hit) return { known: false, section: asked, note: 'Not on file. You do not know this — escalate.' };
      ctx.quoted = ctx.quoted ?? [];
      ctx.quoted.push(hit[0]);
      return { known: true, section: hit[0], text: hit[1], instruction: 'Quote this verbatim, in quotation marks.' };
    }

    case 'get_schedule_fact': {
      const key = String(input.field ?? '').toLowerCase().replace(/\s+/g, '_');
      const facts = policy.facts ?? {};
      const hit = Object.entries(facts).find(([k]) => k.toLowerCase() === key);
      return hit ? { known: true, field: hit[0], value: hit[1] } : { known: false, field: input.field };
    }

    case 'record_enquiry': {
      const kept = {};
      const refused = [];
      for (const [k, v] of Object.entries(input ?? {})) {
        if (RECORDABLE.has(k)) kept[k] = v; else refused.push(k);
      }
      ctx.enquiry = { ...(ctx.enquiry ?? {}), ...kept };
      return refused.length
        ? { recorded: Object.keys(kept), refused, note: 'Fields outside the permitted set were discarded, not stored.' }
        : { recorded: Object.keys(kept) };
    }

    case 'escalate_to_human': {
      const urgency = input.urgency
        ?? (input.reason === 'vulnerability' ? 'immediate'
          : ['live_claim', 'complaint'].includes(input.reason) ? 'same_day' : 'normal');
      ctx.escalations.push({ at: new Date().toISOString(), ...input, urgency });
      return { delivered: true, to: firm.name ?? 'the office', urgency };
    }

    default:
      return { error: `No such tool: ${name}` };
  }
}

export { RECORDABLE };
