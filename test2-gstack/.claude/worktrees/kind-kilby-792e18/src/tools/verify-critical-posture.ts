// A5 — critical-posture sentinel check. The agent calls this on the first
// turn of every conversation to confirm that the project system prompt
// (ONEBRAIN-CRITICAL-POSTURE.md) is loaded in Claude Desktop. If the
// sentinel the agent sees in the prompt doesn't match the value returned
// here, posture has drifted and the agent should warn the user.
//
// Note: an unset / empty env var is *not* an error — we return
// `configured: false` so the agent can degrade gracefully.

import { defineTool } from '../lib/define-tool.js';

export const verifyCriticalPosture = defineTool({
  name: 'verify_critical_posture',
  description:
    "Returns the critical-posture sentinel from the server's environment. " +
    'The agent calls this on the first turn of every conversation; the ' +
    'response should match the sentinel embedded in ONEBRAIN-CRITICAL-POSTURE.md ' +
    "(which the user pastes into Claude Desktop's project system prompt). " +
    "If the agent's view of the sentinel doesn't match the server's, posture " +
    'has drifted and the agent should warn the user.',
  inputShape: {},
  handler: async () => {
    const sentinel = process.env.CRITICAL_POSTURE_SENTINEL;
    if (sentinel && sentinel.length > 0) {
      return {
        sentinel,
        configured: true,
        hint: 'Agent should match this against ONEBRAIN-CRITICAL-POSTURE.md.',
      };
    }
    return {
      sentinel: null,
      configured: false,
      hint:
        'CRITICAL_POSTURE_SENTINEL is not set in .env. Posture-drift detection ' +
        'is disabled. See ONEBRAIN-CRITICAL-POSTURE.md (in the project root) for setup.',
    };
  },
});
