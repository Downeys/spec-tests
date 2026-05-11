import { defineWorkspace } from 'vitest/config';

const inlineWorkspaceDeps = [
  '@bp-agent/domain',
  '@bp-agent/application',
  '@bp-agent/external',
  '@bp-agent/openbrain',
];

export default defineWorkspace([
  {
    test: {
      name: 'domain',
      root: './packages/domain',
    },
  },
  {
    test: {
      name: 'application',
      root: './packages/application',
      server: { deps: { inline: inlineWorkspaceDeps } },
    },
  },
  {
    test: {
      name: 'external',
      root: './packages/external',
      server: { deps: { inline: inlineWorkspaceDeps } },
    },
  },
  {
    test: {
      name: 'openbrain',
      root: './packages/openbrain',
      server: { deps: { inline: inlineWorkspaceDeps } },
    },
  },
  {
    test: {
      name: 'agent',
      root: './apps/agent',
      server: { deps: { inline: inlineWorkspaceDeps } },
    },
  },
  {
    test: {
      name: 'api',
      root: './apps/api',
      server: { deps: { inline: inlineWorkspaceDeps } },
    },
  },
  './apps/ui/vitest.config.ts',
  {
    test: {
      name: 'sandcastle',
      root: './.sandcastle',
    },
  },
]);
