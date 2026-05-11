// src/cli/fixtures/strategic-positioning.ts
// D-09 / D-11: Real-world fixture from a publicly accessible business strategy article.
//
// Source: Michael E. Porter, "What Is Strategy?", Harvard Business Review, Nov-Dec 1996.
//   URL: https://hbr.org/1996/11/what-is-strategy
//   Why this article (D-09):
//     1. Real & publicly accessible (HBR's classic; durable URL).
//     2. Contains naturally-contradicting positions on what creates sustainable competitive
//        advantage: Porter argues operational effectiveness is NOT strategy (claims A, B, C, D);
//        a counter-position from the Japanese-management school holds that continuous
//        improvement IS the engine of advantage (claim G). Porter critiques this view in
//        the article itself — the contradiction is internal to the source's discourse.
//     3. Maps cleanly to topic_tags (strategy, positioning, operational-effectiveness)
//        and framework_tags (porter-five-forces, value-chain).

import type { Fixture } from './index.js';

export const fixture: Fixture = {
  slug: 'strategic-positioning',

  source: {
    kind: 'web_article',
    url: 'https://hbr.org/1996/11/what-is-strategy',
    title: 'What Is Strategy?',
    author: 'Michael E. Porter',
    published_at: new Date('1996-11-01T00:00:00Z'),
    // Truncated raw_text — real article is paywalled longform; this excerpt is fixture-only.
    raw_text: [
      'In the 1980s, the rise of Japanese competition forced Western companies to focus on',
      'operational effectiveness — doing the same activities better than rivals do them.',
      'But operational effectiveness is not strategy. Although operational effectiveness is',
      'necessary to superior performance, it is not sufficient. Strategy is about being',
      'different. It means deliberately choosing a different set of activities to deliver',
      'a unique mix of value. Sustainable advantage requires trade-offs and a strategic',
      'fit among activities — not the relentless pursuit of best practices that competitors',
      'can quickly imitate. Continuous improvement of operations alone produces convergence,',
      'not differentiation.',
    ].join(' '),
    metadata: { fixture_origin: 'cli-fixture', source_excerpt: true },
  },

  entities: [
    {
      localId: 'entity-porter',
      kind: 'person',
      name: 'Michael E. Porter',
      aliases: ['Porter', 'M. Porter'],
      description:
        'Harvard Business School professor; author of Competitive Strategy and Five Forces framework.',
      metadata: {},
    },
    {
      localId: 'entity-japanese-mfg',
      kind: 'segment',
      name: 'Japanese manufacturers (1980s)',
      aliases: ['Japanese firms', 'Toyota et al.'],
      description:
        'Cohort of Japanese manufacturing firms that exemplified operational-effectiveness gains via kaizen and TQM.',
      metadata: {},
    },
  ],

  claims: [
    {
      localId: 'claim-A',
      kind: 'inference',
      status: 'hypothesis',
      confidence: 0.85,
      text: 'Operational effectiveness — performing similar activities better than rivals — is necessary but NOT sufficient for sustainable competitive advantage.',
      rationale:
        'Porter (1996): once best practices diffuse, productivity-frontier convergence eliminates the source of advantage.',
      topic_tags: ['strategic-positioning', 'strategy', 'operational-effectiveness'],
      framework_tags: ['porter-five-forces', 'value-chain'],
      business_plan_id: 'default-plan',
      created_by: 'cli-fixture',
    },
    {
      localId: 'claim-B',
      kind: 'fact',
      status: 'hypothesis',
      confidence: 0.7,
      text: 'Strategy is about deliberately choosing a different set of activities to deliver a unique mix of value to customers.',
      rationale:
        'Porter (1996) defines strategic positioning as "performing different activities from rivals or performing similar activities in different ways."',
      topic_tags: ['strategic-positioning', 'strategy', 'positioning'],
      framework_tags: ['porter-five-forces'],
      business_plan_id: 'default-plan',
      created_by: 'cli-fixture',
    },
    {
      localId: 'claim-C',
      kind: 'inference',
      status: 'hypothesis',
      confidence: 0.75,
      text: 'Sustainable advantage requires explicit trade-offs: doing one thing well typically makes a firm worse at another.',
      rationale:
        'Porter (1996) calls this "fit" and "trade-offs" — the structural reason imitators cannot copy a strategy without sacrificing their own positions.',
      topic_tags: ['strategic-positioning', 'strategy', 'positioning'],
      framework_tags: ['value-chain'],
      business_plan_id: 'default-plan',
      created_by: 'cli-fixture',
    },
    {
      localId: 'claim-D',
      kind: 'inference',
      status: 'hypothesis',
      confidence: 0.65,
      text: 'Continuous improvement of operations alone produces competitive convergence — every firm ends up looking like every other firm.',
      rationale:
        'Porter (1996): the productivity frontier shifts outward but no single firm sustains an advantage on it.',
      topic_tags: ['strategic-positioning', 'strategy', 'operational-effectiveness'],
      framework_tags: ['value-chain'],
      business_plan_id: 'default-plan',
      created_by: 'cli-fixture',
    },
    {
      localId: 'claim-E',
      kind: 'fact',
      status: 'hypothesis',
      confidence: 0.55,
      text: 'Strategic fit among multiple activities is more defensible than excellence in any single activity.',
      rationale:
        'Porter (1996) on system-of-activities maps; locked-in interdependencies create switching costs for imitators.',
      topic_tags: ['strategic-positioning', 'strategy', 'positioning'],
      framework_tags: ['value-chain'],
      business_plan_id: 'default-plan',
      created_by: 'cli-fixture',
    },
    {
      localId: 'claim-F',
      kind: 'hypothesis',
      status: 'hypothesis',
      confidence: 0.45,
      text: 'Trade-offs that strategic positioning requires often appear inefficient in the short term, which is why managers under quarterly pressure tend to abandon them.',
      rationale:
        'Porter (1996) argues management discipline (not analytical insight) is the binding constraint on strategy execution.',
      topic_tags: ['strategic-positioning', 'strategy', 'governance'],
      framework_tags: ['porter-five-forces'],
      business_plan_id: 'default-plan',
      created_by: 'cli-fixture',
    },
    {
      localId: 'claim-G',
      kind: 'hypothesis',
      status: 'hypothesis',
      confidence: 0.5,
      text: 'Continuous improvement (kaizen) and operational excellence ARE the engine of sustainable competitive advantage in manufacturing-intensive industries.',
      rationale:
        'Counter-position from the Japanese-management school (e.g., Imai 1986, Womack & Jones 1996); held implicitly by the Japanese manufacturers Porter critiques.',
      topic_tags: ['strategic-positioning', 'strategy', 'operational-effectiveness'],
      framework_tags: ['value-chain'],
      business_plan_id: 'default-plan',
      created_by: 'cli-fixture',
    },
  ],

  edges: [
    // 7 cites_source edges (every claim cites the source) — D-11
    { kind: 'cites_source', fromLocalId: 'claim-A', toLocalRef: { kind: 'source', localId: 'source' } },
    { kind: 'cites_source', fromLocalId: 'claim-B', toLocalRef: { kind: 'source', localId: 'source' } },
    { kind: 'cites_source', fromLocalId: 'claim-C', toLocalRef: { kind: 'source', localId: 'source' } },
    { kind: 'cites_source', fromLocalId: 'claim-D', toLocalRef: { kind: 'source', localId: 'source' } },
    { kind: 'cites_source', fromLocalId: 'claim-E', toLocalRef: { kind: 'source', localId: 'source' } },
    { kind: 'cites_source', fromLocalId: 'claim-F', toLocalRef: { kind: 'source', localId: 'source' } },
    { kind: 'cites_source', fromLocalId: 'claim-G', toLocalRef: { kind: 'source', localId: 'source' } },

    // 2 about_entity edges — D-11
    { kind: 'about_entity', fromLocalId: 'claim-A', toLocalRef: { kind: 'entity', localId: 'entity-porter' } },
    { kind: 'about_entity', fromLocalId: 'claim-G', toLocalRef: { kind: 'entity', localId: 'entity-japanese-mfg' } },

    // 1 contradicts edge — the CRIT-05 keystone — D-11
    // Claim A: "operational effectiveness is necessary but NOT sufficient" vs
    // Claim G: "operational excellence IS the engine of sustainable advantage"
    { kind: 'contradicts', fromLocalId: 'claim-A', toLocalRef: { kind: 'claim', localId: 'claim-G' }, weight: 1.0 },
  ],
};
