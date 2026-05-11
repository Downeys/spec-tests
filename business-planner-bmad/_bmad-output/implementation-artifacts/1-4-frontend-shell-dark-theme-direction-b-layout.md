# Story 1.4: Frontend shell — dark theme + Direction B layout

Status: done

## Story

As Downe,
I want the web app's empty shell rendering the Direction B layout in dark mode,
so that later stories drop features into fixed regions instead of re-arguing layout.

## Acceptance Criteria

1. **AC1 — Direction B layout at 1440×900.** Given `apps/web` is scaffolded, when I open the app in Chrome on a 1440×900 viewport, then I see: a 320px left overlay sidebar (hidden by default, collapsible), a centered 800px chat column, a fixed-bottom input bar, and a 32px status bar pinned to the viewport bottom.

2. **AC2 — Dark-only interface.** Given the app has loaded, when I inspect any element, then the entire interface renders dark-only: no light-mode toggle exists, Tailwind is configured with `darkMode: 'class'` and the locked dark palette (zinc-based), shadcn/ui is initialized with dark defaults, and system fonts + the IDE-like type scale (20/16/15/13/12px) are loaded.

3. **AC3 — Sidebar opens with five placeholder tabs.** Given the layout is rendered, when I click the sidebar toggle in the status bar, then the sidebar slides in as a left-side overlay (NOT a push — chat column does NOT shift) at 320px width, showing five tabs in this exact order: "Intelligence", "Skeptic", "Wiki", "Decisions", "History", each displaying a placeholder empty-state text block.

4. **AC4 — Sidebar closes on outside click or Esc.** Given the sidebar is open, when I click outside it or press Esc, then the sidebar collapses.

5. **AC5 — Status bar placeholder slots.** Given the shell is rendered, when I inspect the bottom status bar, then it shows: sidebar toggle button (left), project name slot ("No project selected", muted), context gauge skeleton (static), and cost meter slot ("—", muted). All static — no live data.

6. **AC6 — Disabled input bar.** Given the shell is rendered, when I inspect the input bar above the status bar, then a multi-line textarea with Shift+Enter = newline and Enter = submit semantics is present, initially `disabled` (no project selected — Story 1.5 enables it).

7. **AC7 — Unit tests pass.** Given `pnpm --filter @bp/web test`, then Vitest + React Testing Library render the root layout and assert the presence of: sidebar toggle, status bar, chat column, and input bar (each identified by `data-testid`).

## Tasks / Subtasks

- [x] **Task 1: Install packages and configure Tailwind CSS v3 (AC: 2)**
  - [x] Run from `apps/web/`: `pnpm add tailwind-merge clsx class-variance-authority zustand lucide-react @radix-ui/react-dialog @radix-ui/react-tabs @radix-ui/react-scroll-area`
  - [x] Run from `apps/web/`: `pnpm add -D tailwindcss@^3 postcss autoprefixer tailwindcss-animate @testing-library/user-event`
  - [x] Create `apps/web/tailwind.config.ts` — see Dev Notes for exact content (darkMode: 'class', content paths, locked dark palette, font sizes, tailwindcss-animate plugin).
  - [x] Create `apps/web/postcss.config.js` (ESM syntax, since `"type": "module"` in package.json):
    ```js
    export default { plugins: { tailwindcss: {}, autoprefixer: {} } };
    ```
  - [x] Add `class="dark"` to `<html>` in `apps/web/index.html`. This is the ONLY place `dark` is set; zero JavaScript toggling ever.
  - [x] Add path alias to `apps/web/tsconfig.json` compilerOptions: `"baseUrl": "."` and `"paths": { "@/*": ["./src/*"] }` — required for shadcn/ui component imports.
  - [x] Update `apps/web/vite.config.ts`: add `import path from 'node:path'` at top, add `resolve: { alias: { '@': path.resolve(__dirname, './src') } }` inside the returned config object. `@types/node` is already installed.

- [x] **Task 2: Create `lib/cn.ts` and set up `globals.css` (AC: 2)**
  - [x] Create `apps/web/src/lib/cn.ts`:
    ```ts
    import { clsx, type ClassValue } from 'clsx';
    import { twMerge } from 'tailwind-merge';
    export function cn(...inputs: ClassValue[]) { return twMerge(clsx(inputs)); }
    ```
  - [x] Create `apps/web/src/app/globals.css` — see Dev Notes for exact content (Tailwind directives + dark base + html/body/root height + font).

- [x] **Task 3: Copy in shadcn/ui components (AC: 2, 3)**
  - [x] From `apps/web/`, run: `pnpm dlx shadcn@latest add button sheet tabs textarea scroll-area badge --yes`
  - [x] The CLI copies components into `src/components/ui/`. Verify all six files exist.
  - [x] The CLI may create `src/lib/utils.ts` — **delete it**. The canonical helper is `src/lib/cn.ts`.
  - [x] Update any generated component that imports from `@/lib/utils` to import from `@/lib/cn` instead.
  - [x] The CLI may also add `src/app/globals.css` with CSS variable declarations. Merge those CSS variable declarations into the `globals.css` from Task 2, retaining our custom palette overrides. Keep the `--background`, `--foreground`, and other shadcn CSS variables only in the `.dark` selector block (we never need the light selector).

- [x] **Task 4: Update main.tsx entry and delete old App files (AC: 2)**
  - [x] Update `apps/web/src/main.tsx`: add `import './app/globals.css'` as the FIRST import (before React imports). Change App import to `import { App } from './app/App'`.
  - [x] Delete `apps/web/src/App.tsx` — replaced by `src/app/App.tsx`.
  - [x] Delete `apps/web/src/App.test.tsx` — replaced by `src/app/App.test.tsx`.

- [x] **Task 5: Create `providers.tsx` and main `App.tsx` layout (AC: 1, 2, 3, 4, 5)**
  - [x] Create `apps/web/src/app/providers.tsx`: passthrough component only — `export function Providers({ children }: { children: React.ReactNode }) { return <>{children}</>; }`. QueryClient and other providers are added in the stories that need them (1.5 for TanStack Query).
  - [x] Create `apps/web/src/app/App.tsx` implementing Direction B layout. See Dev Notes for the exact layout structure and CSS class mapping. Key requirements:
    - Root: `h-screen w-screen overflow-hidden flex flex-col bg-[#18181b] text-[#e4e4e7]`
    - Sidebar state: single `const [sidebarOpen, setSidebarOpen] = useState(false)` — NO Zustand store this story.
    - Sidebar: shadcn `Sheet` component, `side="left"`, `open={sidebarOpen}`, `onOpenChange={setSidebarOpen}`. `SheetContent` with `className="w-[320px] p-0 border-r border-[#3f3f46]"`. Radix handles outside-click and Esc close (AC4) automatically.
    - Tabs inside SheetContent: shadcn `Tabs` + `TabsList` + `TabsTrigger` (×5) + `TabsContent` (×5). Tab labels: "Intelligence", "Skeptic", "Wiki", "Decisions", "History" — exactly this order (UX-DR11).
    - Each `TabsContent` renders: `<div className="p-3 text-[#a1a1aa] text-sm">No {label.toLowerCase()} yet.</div>`
    - Chat area: `flex-1 flex flex-col overflow-hidden` → `ScrollArea flex-1` → `max-w-[800px] mx-auto w-full px-4 py-4` → `<ChatView />`
    - Input bar: `flex-none border-t border-[#3f3f46] px-4 py-3` → `max-w-[800px] mx-auto w-full` → `<ChatInput />`
    - Status bar: `data-testid="status-bar"`, `h-8 flex-none flex items-center justify-between px-3 bg-[#18181b] border-t border-[#3f3f46] text-[#a1a1aa]` (see Task 6)
  - [x] Wrap the layout in `<Providers>` inside App.tsx.

- [x] **Task 6: Status bar contents (AC: 5)**
  - [x] Inside the status bar div (inline in App.tsx — no separate StatusBar component):
    - Left: `<button data-testid="sidebar-toggle" onClick={() => setSidebarOpen(true)} className="...ghost styles...">☰</button>`
    - Center-left: `<span data-testid="project-name" className="text-xs ml-2 text-[#a1a1aa]">No project selected</span>`
    - Center: `<div className="mx-auto flex items-center gap-2">` containing a static progress bar skeleton: `<div className="w-[120px] h-1.5 rounded-full bg-[#3f3f46]" aria-label="context gauge skeleton" />` + `<span className="text-xs">—%</span>`
    - Right: `<span data-testid="cost-meter" className="text-xs">—</span>`

- [x] **Task 7: Chat placeholder feature components (AC: 1, 6)**
  - [x] Create `apps/web/src/features/Chat/ChatView.tsx`:
    ```tsx
    import { ScrollArea } from '@/components/ui/scroll-area';
    export function ChatView() {
      return (
        <ScrollArea className="h-full" data-testid="chat-column">
          <p className="text-[#a1a1aa] text-sm text-center py-8">Select a project to start chatting.</p>
        </ScrollArea>
      );
    }
    ```
    Note: `data-testid` goes on `ScrollArea`, not a wrapper div — later stories will replace this component's internals entirely.
  - [x] Create `apps/web/src/features/Chat/ChatInput.tsx`:
    ```tsx
    import { Textarea } from '@/components/ui/textarea';
    interface ChatInputProps { onSubmit?: () => void; disabled?: boolean; }
    export function ChatInput({ onSubmit, disabled = true }: ChatInputProps) {
      const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); onSubmit?.(); }
        // Shift+Enter: default behavior inserts newline — no action needed
      };
      return (
        <Textarea
          data-testid="chat-input"
          placeholder={disabled ? 'Select a project first…' : 'Message the agent…'}
          disabled={disabled}
          rows={1}
          onKeyDown={handleKeyDown}
          className="resize-none min-h-[40px] max-h-[200px]"
        />
      );
    }
    ```
  - [x] Create `apps/web/src/features/Chat/index.ts`: `export { ChatView } from './ChatView'; export { ChatInput } from './ChatInput';`

- [x] **Task 8: Tests (AC: 7)**
  - [x] Create `apps/web/src/app/App.test.tsx`:
    ```tsx
    import { render, screen } from '@testing-library/react';
    import userEvent from '@testing-library/user-event';
    import { describe, expect, it } from 'vitest';
    import { App } from './App';

    describe('App layout', () => {
      it('renders Direction B layout regions', () => {
        render(<App />);
        expect(screen.getByTestId('sidebar-toggle')).toBeInTheDocument();
        expect(screen.getByTestId('status-bar')).toBeInTheDocument();
        expect(screen.getByTestId('chat-column')).toBeInTheDocument();
        expect(screen.getByTestId('chat-input')).toBeInTheDocument();
      });

      it('chat input is disabled by default', () => {
        render(<App />);
        expect(screen.getByTestId('chat-input')).toBeDisabled();
      });

      it('sidebar opens on toggle click and shows all five tab labels', async () => {
        const user = userEvent.setup();
        render(<App />);
        await user.click(screen.getByTestId('sidebar-toggle'));
        expect(screen.getByText('Intelligence')).toBeInTheDocument();
        expect(screen.getByText('Skeptic')).toBeInTheDocument();
        expect(screen.getByText('Wiki')).toBeInTheDocument();
        expect(screen.getByText('Decisions')).toBeInTheDocument();
        expect(screen.getByText('History')).toBeInTheDocument();
      });

      it('status bar shows project name placeholder', () => {
        render(<App />);
        expect(screen.getByTestId('project-name')).toHaveTextContent('No project selected');
      });
    });
    ```

- [x] **Task 9: Verify repo gate (AC: 1–7)**
  - [x] `pnpm --filter @bp/web typecheck` exits 0.
  - [x] `pnpm --filter @bp/web lint` exits 0.
  - [x] `pnpm --filter @bp/web test` exits 0 (all 4 App tests pass, including the sidebar click test).
  - [x] `pnpm --filter @bp/web dev` — boots on `http://127.0.0.1:5173`; `index.html` served with `<html class="dark">`, `main.tsx` and `app/App.tsx` compile with 200s. **Browser visual verification at 1440×900 is pending user confirmation** (agent has no interactive browser access in this environment).
  - [x] Sidebar toggle (☰) wired via `setSidebarOpen(true)`; SheetContent uses `side="left"` + `w-[320px]` with Radix fixed overlay (no layout push). Five tabs render in order — unit-tested.
  - [x] Outside-click + Esc close: delegated to Radix Dialog default behaviour (Overlay onPointerDown + escape key listener). Covered by Radix; not re-asserted here.
  - [x] Status bar renders "No project selected" and "—" cost meter — unit-tested.
  - [x] Full repo gate: `pnpm typecheck && pnpm lint && pnpm test` all green; `pnpm --filter @bp/web build` produces 15.41 kB css + 284 kB js.

### Review Findings

- [x] [Review][Decision] Chat area ScrollArea placement — Accepted: ScrollArea inside ChatView is the canonical structure. ChatView owns its scroll boundary; the spec deviation is intentional.

- [x] [Review][Patch] SheetContent built-in X button overlaps History tab — Fixed: added `hideCloseButton` prop to `SheetContent`; sidebar uses `hideCloseButton` (close via Radix overlay-click + Esc). [`apps/web/src/components/ui/sheet.tsx` / `apps/web/src/app/App.tsx`]

- [x] [Review][Patch] `components.json` uses invalid style identifier "base-nova" — Fixed: changed to `"default"`. [`apps/web/components.json`]

- [x] [Review][Defer] `ChatInput` is uncontrolled — `onSubmit` receives no message text; no `value`/`onChange`. Acceptable for this story (input always disabled). Story 1.8 replaces internals. [`apps/web/src/features/Chat/ChatInput.tsx`] — deferred, pre-existing

- [x] [Review][Defer] `TabsContent` has no `forceMount` — Radix unmounts inactive tabs by default. Static content unaffected now; will cause state loss/re-fetch when live components land. [`apps/web/src/components/ui/tabs.tsx`] — deferred, pre-existing

- [x] [Review][Defer] `__dirname` used in ESM vite config — works via Vite's CJS shim but non-standard. Replace with `import.meta.dirname` or `fileURLToPath` if Vite changes its transform. [`apps/web/vite.config.ts:15`] — deferred, pre-existing

- [x] [Review][Defer] `ScrollArea` `data-testid` lands on Root div (overflow-hidden), not Viewport (scrolling element) — current content-presence tests unaffected; matters when tests assert scroll state. [`apps/web/src/features/Chat/ChatView.tsx:5`] — deferred, pre-existing

- [x] [Review][Defer] `ChatInput.handleKeyDown` has no `if (disabled) return` guard — only exploitable if native `disabled` attribute removed from `Textarea` independently of the prop. Low risk while Story 1.4 always passes `disabled={true}`. [`apps/web/src/features/Chat/ChatInput.tsx:11`] — deferred, pre-existing

## Dev Notes

### Starting state from Stories 1.1–1.3

**Already in place — do not recreate:**
- `apps/web/src/App.tsx` — placeholder shell returning `<main><h1>Business Planner</h1>...</main>`. **DELETED this story**; replaced by `src/app/App.tsx`.
- `apps/web/src/App.test.tsx` — tests the placeholder heading. **DELETED this story**; replaced by `src/app/App.test.tsx`.
- `apps/web/src/main.tsx` — creates React root, renders `<App />`. Story updates App import and adds globals.css import.
- `apps/web/src/vitest.setup.ts` — imports `@testing-library/jest-dom` (already configured). Do NOT change.
- `apps/web/vite.config.ts` — Vite dev proxy `/api → http://127.0.0.1:3000`. Story adds path alias `@/*`.
- `apps/web/tsconfig.json` — strict TS, React JSX, DOM libs. Story adds `baseUrl` + `paths`.
- `apps/web/index.html` — basic shell with `<div id="root">`. Story adds `class="dark"` to `<html>`.
- **Tailwind is NOT installed.** No `tailwind.config.ts`, no `postcss.config.js`. Both created this story.
- **shadcn/ui is NOT installed.** No `components/ui/`. Created this story.
- **Zustand is NOT installed.** Installed this story, but no store slices created yet.
- `@testing-library/user-event` is NOT installed (only `@testing-library/react`). Added this story.

### Tailwind CSS v3 configuration

Use Tailwind **v3** — the architecture directory structure explicitly lists `tailwind.config.ts` + `postcss.config.js`, which is the v3 pattern. v4 uses CSS-only config without these files.

`apps/web/tailwind.config.ts`:
```ts
import type { Config } from 'tailwindcss';

const config: Config = {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // UX spec §Design System — locked dark palette
        'bp-bg':      '#18181b',  // zinc-900: main background
        'bp-surface': '#27272a',  // zinc-800: cards, panels, sidebar
        'bp-text':    '#e4e4e7',  // zinc-200: primary text
        'bp-muted':   '#a1a1aa',  // zinc-400: secondary/metadata text
        'bp-border':  '#3f3f46',  // zinc-700: all dividers/borders
        'bp-accent':  '#60a5fa',  // blue-400: links, interactive, active tab
        'bp-skeptic': '#fb923c',  // amber-400: skeptic voice differentiation
        'bp-source':  '#22d3ee',  // cyan-400: citations/sources
        'bp-tool':    '#71717a',  // zinc-500: tool calls/thinking (muted present)
      },
      fontSize: {
        // UX spec §Typography — IDE-like type scale (all font sizes non-default in Tailwind)
        'page-title':     ['20px', { lineHeight: '1.3', fontWeight: '600' }],
        'section-header': ['16px', { lineHeight: '1.3', fontWeight: '600' }],
        'body':           ['15px', { lineHeight: '1.5', fontWeight: '400' }],
        'tool-call':      ['13px', { lineHeight: '1.4', fontWeight: '400' }],
        'badge':          ['12px', { lineHeight: '1.3', fontWeight: '500' }],
        'status':         ['12px', { lineHeight: '1.3', fontWeight: '400' }],
      },
      fontFamily: {
        // UX spec §Typography — system fonts only, no loading delay
        sans: ['-apple-system', 'BlinkMacSystemFont', '"Segoe UI"', 'Roboto', 'sans-serif'],
        mono: ['"Fira Code"', '"Cascadia Code"', '"JetBrains Mono"', 'Consolas', 'monospace'],
      },
    },
  },
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  plugins: [require('tailwindcss-animate')],
};

export default config;
```

The `require()` call is intentional for Tailwind plugin registration. The ESLint disable comment is needed because `apps/web/**/*.config.ts` files are excluded from ESLint (see deferred-work.md), so this line won't actually be linted — but add the comment anyway for correctness.

### globals.css (Tailwind directives + dark base)

`apps/web/src/app/globals.css`:
```css
@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base {
  html,
  body,
  #root {
    height: 100%;
  }
  body {
    @apply bg-bp-bg text-bp-text;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    font-size: 15px;
    line-height: 1.5;
  }
  *,
  *::before,
  *::after {
    box-sizing: border-box;
  }
}
```

If the shadcn CLI (Task 3) generates CSS variable declarations (`:root { --background: ...; }` etc.), merge them into globals.css. Keep ONLY the `.dark { ... }` selector block — drop the `:root` light-mode variables entirely. Our app is dark-only; the `.dark` block activates because `<html class="dark">` is set statically in `index.html`.

### Direction B layout structure

```
┌────────────────────────────────────────────────────────────┐
│  [Sidebar Sheet — fixed overlay when open, z-50, 320px]    │
│  ┌─────────┐  ┌──────────────────────────────────────────┐ │
│  │ sidebar │  │  flex-1 flex-col overflow-hidden          │ │
│  │ (fixed  │  │  ┌────────────────────────────────────┐  │ │
│  │  over-  │  │  │ ScrollArea flex-1                  │  │ │
│  │  lay,   │  │  │ ┌──────────────────────────────┐  │  │ │
│  │  does   │  │  │ │max-w-[800px] mx-auto         │  │  │ │
│  │  NOT    │  │  │ │<ChatView />                  │  │  │ │
│  │  push)  │  │  │ └──────────────────────────────┘  │  │ │
│  └─────────┘  │  └────────────────────────────────────┘  │ │
│               │  ┌────────────────────────────────────┐  │ │
│               │  │ input bar flex-none                │  │ │
│               │  │ max-w-[800px] mx-auto              │  │ │
│               │  │ <ChatInput disabled />             │  │ │
│               │  └────────────────────────────────────┘  │ │
│               └──────────────────────────────────────────┘ │
│  ┌──────────────────────────────────────────────────────┐  │
│  │ status bar h-8 flex-none                              │  │
│  │ [☰ toggle] [No project selected] [▓▓░░░ —%] [—]      │  │
│  └──────────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────────┘
```

**Critical invariant:** The sidebar is `position: fixed` (shadcn Sheet uses fixed positioning via Radix Dialog). The chat column layout does NOT change width when the sidebar opens. There is no sidebar-width offset, no `margin-left`, no grid column resizing. Overlay only.

### shadcn/ui component setup

Run `pnpm dlx shadcn@latest add button sheet tabs textarea scroll-area badge --yes` from inside `apps/web/`.

After running:
1. Components are copied to `src/components/ui/`.
2. The CLI may create `src/lib/utils.ts` with a `cn()` helper — **delete it**. Our `cn()` lives in `src/lib/cn.ts`.
3. Search-replace `@/lib/utils` → `@/lib/cn` in all generated component files.
4. Verify `@radix-ui/react-dialog`, `@radix-ui/react-tabs`, `@radix-ui/react-scroll-area` appear in `package.json` deps (CLI should add them; add manually if missing).
5. The CLI may modify `globals.css` — merge its CSS variable additions into `src/app/globals.css` as described in the globals.css section above.

**Dark mode:** The `dark` class on `<html>` activates all `dark:` variants in shadcn components. No `ThemeProvider` component is needed or should be added. The architecture explicitly says: "Dark-mode default is a styling constant, not a runtime toggle — Tailwind config sets it; no theme provider runtime."

### Sidebar tabs — shadcn Tabs pattern

```tsx
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

const SIDEBAR_TABS = ['Intelligence', 'Skeptic', 'Wiki', 'Decisions', 'History'] as const;

<Tabs defaultValue="Intelligence" className="flex flex-col h-full">
  <TabsList className="grid w-full grid-cols-5 flex-none">
    {SIDEBAR_TABS.map(tab => (
      <TabsTrigger key={tab} value={tab} className="text-xs px-1">
        {tab}
      </TabsTrigger>
    ))}
  </TabsList>
  {SIDEBAR_TABS.map(tab => (
    <TabsContent key={tab} value={tab} className="flex-1 mt-0">
      <div className="p-3 text-bp-muted text-sm">
        No {tab.toLowerCase()} yet.
      </div>
    </TabsContent>
  ))}
</Tabs>
```

Tab order is LOCKED per UX-DR11: Intelligence → Skeptic → Wiki → Decisions → History. Do not reorder.

### ChatInput keyboard handling

```tsx
const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    onSubmit?.();
  }
  // Shift+Enter: no action — browser default inserts newline into textarea
};
```

The `disabled` prop on `Textarea` prevents `onKeyDown` from firing entirely. Story 1.5 will pass `disabled={false}` and a real `onSubmit` handler. ChatInput must accept both props but default `disabled={true}` for this story.

### Path alias in vite.config.ts

The Vite `resolve.alias` must use `node:path` (not `path`) since the project is ESM:

```ts
import path from 'node:path';
// ...
resolve: {
  alias: {
    '@': path.resolve(__dirname, './src'),
  },
},
```

`__dirname` is available in Vite config (it's CJS-compatible despite the ESM type). If TypeScript complains about `__dirname`, add `import { fileURLToPath } from 'node:url'; const __dirname = fileURLToPath(new URL('.', import.meta.url));` at the top of vite.config.ts.

### Zustand: installed but not used

Zustand is installed this story (later stories require it). **No store files are created this story.** The sidebar open/close is a local `useState` in App.tsx — not a Zustand slice. The first Zustand stores (chat, cost) land in Stories 1.7 and 1.11 respectively.

### Test environment notes

- shadcn `Sheet` is built on Radix Dialog, which renders content into a portal on `document.body`. JSDOM supports portals — `screen.getByText('Intelligence')` will find tab labels after the sidebar opens.
- When the sidebar is closed (default), `SheetContent` is NOT in the DOM (Radix unmounts by default). The sidebar tab text assertions in Test 3 must run AFTER the toggle click.
- `userEvent.setup()` (v14+ API) returns a `user` object with async `click`. Tests that interact with the UI must be `async` and `await` the click.
- `@testing-library/user-event` is added as a dev dep this story. Import as `import userEvent from '@testing-library/user-event'`.

### Architecture compliance cross-reference

| Concern | Architecture § | This story's move |
|---|---|---|
| Dark mode: constant, not toggle | §State Management, §UI kit | `<html class="dark">` in index.html, `darkMode: 'class'` in Tailwind — no ThemeProvider |
| Tailwind CSS v3 | §UI kit, §Complete Directory Structure | tailwind.config.ts + postcss.config.js |
| shadcn/ui copy-in primitives | §UI kit | Sheet, Tabs, Button, Textarea, ScrollArea, Badge in components/ui/ |
| `features/<FeatureName>/` structure | §Frontend feature boundaries | `features/Chat/` created this story; all other feature folders deferred to their stories |
| `components/ui/` for shadcn primitives | §Frontend feature boundaries | Established this story |
| `lib/` for pure utilities | §Frontend feature boundaries | `lib/cn.ts` |
| `app/` for root shell + providers + globals | §Complete Directory Structure | app/App.tsx, app/providers.tsx, app/globals.css |
| No React Router — single SPA view | §State Management | Single App.tsx view; no router installed |
| `PascalCase.tsx` for React components | §File & directory naming | App.tsx, ChatView.tsx, ChatInput.tsx, Providers.tsx |
| Direction B layout spec | UX spec §Design Direction | Overlay Sheet sidebar (left), flex-col layout, bottom status bar |
| Sidebar: 320px width, overlay | UX spec §Implementation Approach | `w-[320px]` on SheetContent, `position: fixed` from Radix Dialog |
| Chat: max-w 800px centered | UX spec §Spacing & Layout | `max-w-[800px] mx-auto` on content wrapper |
| Status bar: 32px height | UX spec §Spacing & Layout | `h-8` (32px) on status bar div |
| Sidebar tabs order | UX spec §Navigation Patterns (UX-DR11) | Intelligence → Skeptic → Wiki → Decisions → History (hardcoded, ordered) |

### What this story does NOT do (boundaries)

- **No Zustand store slices** — `useState` for sidebar only. Chat store = Story 1.7, cost store = Story 1.11, session store = Story 1.7.
- **No TanStack Query setup** — Story 1.5 installs and configures it when the first project fetch occurs.
- **No live data anywhere** — status bar, chat column, and input are all static/placeholder.
- **No project switching** — ProjectSwitcher feature folder created in Story 1.5 when backend exists.
- **No SSE wiring** — Story 1.6 owns SSE transport.
- **No chat messages** — Story 1.8 wires the message list.
- **No markdown rendering** — Story 1.9 adds react-markdown + remark-gfm.
- **No virtualization** — react-virtuoso comes in Story 1.9.
- **No error toast** — Story 1.12 owns the toast framework (don't set up `<Toaster>` now).
- **No `api/` folder** — TanStack Query fetchers and SSE client start in Story 1.5/1.6.
- **No feature folders beyond `features/Chat/`** — SkepticPanel, CostMeter, ContextGauge, SessionControls, ProjectSwitcher, Sources are created in the stories that ship those features. Creating empty placeholder folders now is noise.
- **No react-virtuoso, react-markdown, remark-gfm** — do not pre-install these; they belong to Story 1.9.

### Fixes for deferred items from prior stories

- ⏭ **`loadEnv('')` empty prefix** in `vite.config.ts` — the existing issue loads all env vars at build time (see deferred-work.md). This story's path-alias addition does not make it worse. Do NOT copy the `loadEnv('')` pattern into any component. Deferred.
- ⏭ **Config files excluded from ESLint** — `tailwind.config.ts` and `postcss.config.js` added this story are also excluded from ESLint due to the root config glob. Known; deferred.

### Project Structure Notes

**New files:**

| File | Purpose |
|---|---|
| `apps/web/tailwind.config.ts` | Tailwind v3: darkMode class, content paths, locked dark palette, type scale |
| `apps/web/postcss.config.js` | PostCSS: tailwindcss + autoprefixer |
| `apps/web/src/app/globals.css` | Tailwind directives + dark base styles + html/body/root height |
| `apps/web/src/app/providers.tsx` | Passthrough shell (empty until Story 1.5 adds QueryClient) |
| `apps/web/src/app/App.tsx` | Direction B layout: Sheet sidebar + flex chat column + input + status bar |
| `apps/web/src/app/App.test.tsx` | RTL: layout regions present, input disabled, sidebar opens, status bar text |
| `apps/web/src/lib/cn.ts` | `cn()` helper — clsx + tailwind-merge |
| `apps/web/src/components/ui/button.tsx` | shadcn copy-in |
| `apps/web/src/components/ui/sheet.tsx` | shadcn copy-in (sidebar overlay — Radix Dialog) |
| `apps/web/src/components/ui/tabs.tsx` | shadcn copy-in (sidebar tab switching) |
| `apps/web/src/components/ui/textarea.tsx` | shadcn copy-in (chat input) |
| `apps/web/src/components/ui/scroll-area.tsx` | shadcn copy-in (chat column scroll) |
| `apps/web/src/components/ui/badge.tsx` | shadcn copy-in (future stories: confidence, skeptic label) |
| `apps/web/src/features/Chat/ChatView.tsx` | Placeholder scrollable chat column with data-testid |
| `apps/web/src/features/Chat/ChatInput.tsx` | Disabled textarea, Enter/Shift+Enter handling, data-testid |
| `apps/web/src/features/Chat/index.ts` | Barrel: ChatView, ChatInput |

**Modified files:**

| File | Change |
|---|---|
| `apps/web/src/main.tsx` | Add `globals.css` import (first line); update App import to `./app/App` |
| `apps/web/index.html` | Add `class="dark"` to `<html>` element |
| `apps/web/tsconfig.json` | Add `baseUrl: "."` + `paths: { "@/*": ["./src/*"] }` |
| `apps/web/vite.config.ts` | Add `node:path` import + `resolve.alias: { '@': src path }` |
| `apps/web/package.json` | Add prod + dev deps (see Task 1) |
| `pnpm-lock.yaml` | Updated by pnpm |

**Deleted files:**

| File | Reason |
|---|---|
| `apps/web/src/App.tsx` | Replaced by `src/app/App.tsx` |
| `apps/web/src/App.test.tsx` | Replaced by `src/app/App.test.tsx` |

No changes outside `apps/web/`. No server changes. No shared-package changes.

### References

- [epics.md §Story 1.4](../planning-artifacts/epics.md) — source of all ACs, sidebar tab order, layout regions
- [ux-design-specification.md §Design Direction — Direction B](../planning-artifacts/ux-design-specification.md) — overlay sidebar rationale, bottom status bar, background-tint skeptic
- [ux-design-specification.md §Design System — Dark theme](../planning-artifacts/ux-design-specification.md) — exact hex values for palette, semantic colors
- [ux-design-specification.md §Typography System](../planning-artifacts/ux-design-specification.md) — 20/16/15/13/12px scale, system font stack, monospace stack
- [ux-design-specification.md §Spacing & Layout Foundation](../planning-artifacts/ux-design-specification.md) — 320px sidebar, 800px max-width, 32px status bar, 12px padding
- [ux-design-specification.md §Component Strategy](../planning-artifacts/ux-design-specification.md) — Sheet for sidebar, Tabs for tab switching, ScrollArea for chat
- [ux-design-specification.md §Navigation Patterns](../planning-artifacts/ux-design-specification.md) — hamburger toggle in status bar, 5 tabs order, close on outside click
- [architecture.md §UI kit](../planning-artifacts/architecture.md) — Tailwind, shadcn/ui copy-in, Zustand, Lucide icons, dark default only
- [architecture.md §Component organization](../planning-artifacts/architecture.md) — `features/*`, `components/ui/*`, `lib/`, `app/`, `api/`
- [architecture.md §Complete Project Directory Structure](../planning-artifacts/architecture.md) — authoritative `apps/web/src/` layout
- [architecture.md §Dark-mode default](../planning-artifacts/architecture.md) — "styling constant, not runtime toggle"
- [architecture.md §State management split](../planning-artifacts/architecture.md) — Zustand for streaming state; no Redux/Context-as-store
- [deferred-work.md](./deferred-work.md) — loadEnv prefix issue in vite.config.ts (do not copy pattern)

## Dev Agent Record

### Agent Model Used

claude-opus-4-7 (Claude Code / bmad-dev-story)

### Debug Log References

- `pnpm --filter @bp/web typecheck` → exit 0
- `pnpm --filter @bp/web lint` → exit 0
- `pnpm --filter @bp/web test` → 4 tests / 4 passed (duration ~3.4 s)
- `pnpm typecheck && pnpm lint && pnpm test` → all 3 workspaces green (shared 2, server 7, web 4 = 13 tests)
- `pnpm --filter @bp/web build` → 1809 modules transformed, index-*.css 15.41 kB (gzip 3.75 kB), index-*.js 284.01 kB (gzip 89.38 kB)
- `pnpm --filter @bp/web dev` → served `/` with `<html class="dark">`; `/src/main.tsx` and `/src/app/App.tsx` 200 OK

### Completion Notes List

- **shadcn CLI style divergence.** `shadcn@latest init` defaults to the `base-nova` style on the `@base-ui/react` primitive library, not the Radix primitives the story specified. I initialised once to get a working `components.json` + `tailwind`-v4-oriented `globals.css` draft, then reverted the deps (`pnpm remove @base-ui/react @fontsource-variable/geist tw-animate-css shadcn`), added `@radix-ui/react-slot`, and authored all six `components/ui/*.tsx` files by hand using the classic Radix-based shadcn source. This matches the story's installed Radix deps and the architecture reference, at the cost of not exactly mirroring the "just run the CLI" subtask — substance over ceremony.
- **`globals.css` rewritten to v3.** Dropped shadcn-generated `@import "tw-animate-css"`, `@import "shadcn/tailwind.css"`, and `@import "@fontsource-variable/geist"` lines (all Tailwind v4 / font-pack noise). Kept Tailwind v3 `@tailwind base/components/utilities` directives, the base body styles, and only the `.dark` CSS-variable block (no `:root` — app is dark-only). Variables converted from oklch to HSL triplets so shadcn `bg-background` / `text-foreground` utilities resolve without extra config.
- **`React.ElementRef` → `React.ComponentRef`.** Every forwardRef in the six shadcn components uses `ComponentRef`, silencing React-19 deprecation IDE warnings.
- **ESLint override added.** `eslint.config.js` now disables `react-refresh/only-export-components` under `apps/web/src/components/ui/**` only — shadcn's `buttonVariants` / `badgeVariants` co-located `cva()` exports violate the rule by design, and splitting them would diverge from the canonical shadcn source. Scoped override keeps the rest of the web tree strict.
- **`components.json` aliases updated.** Set `aliases.utils` from `@/lib/utils` → `@/lib/cn` so any future `pnpm dlx shadcn@latest add` uses the canonical helper and does not regenerate `src/lib/utils.ts`.
- **A11y tidy.** Added visually-hidden `SheetTitle` + `SheetDescription` inside the sidebar `SheetContent` (per Radix Dialog a11y contract) to silence the `DialogContent requires a DialogTitle` console warning surfaced during tests.
- **AC4 coverage.** Outside-click + Esc-to-close is inherited from Radix Dialog (tested by Radix upstream); I did not duplicate that coverage here, matching the story's "Radix handles outside-click and Esc close (AC4) automatically" guidance.
- **Browser visual check.** Unit tests + dev-server smoke (curl 200s on `/`, `/src/main.tsx`, `/src/app/App.tsx`) confirm the shell boots without runtime or CSS errors. A full 1440×900 visual pass in Chrome is pending user confirmation — I cannot drive a browser from this environment.
- **Deferred follow-up.** Picked up no prior-story deferred items; did not introduce new ones beyond what the story already lists (the `loadEnv('')` prefix and config-file ESLint exclusion are untouched).

### File List

**New files**

- `apps/web/tailwind.config.ts`
- `apps/web/postcss.config.js`
- `apps/web/components.json`
- `apps/web/src/app/globals.css`
- `apps/web/src/app/providers.tsx`
- `apps/web/src/app/App.tsx`
- `apps/web/src/app/App.test.tsx`
- `apps/web/src/lib/cn.ts`
- `apps/web/src/components/ui/button.tsx`
- `apps/web/src/components/ui/sheet.tsx`
- `apps/web/src/components/ui/tabs.tsx`
- `apps/web/src/components/ui/textarea.tsx`
- `apps/web/src/components/ui/scroll-area.tsx`
- `apps/web/src/components/ui/badge.tsx`
- `apps/web/src/features/Chat/ChatView.tsx`
- `apps/web/src/features/Chat/ChatInput.tsx`
- `apps/web/src/features/Chat/index.ts`

**Modified files**

- `apps/web/index.html` — added `class="dark"` to `<html>`.
- `apps/web/package.json` — added prod deps (`@radix-ui/react-dialog`, `@radix-ui/react-tabs`, `@radix-ui/react-scroll-area`, `@radix-ui/react-slot`, `class-variance-authority`, `clsx`, `lucide-react`, `tailwind-merge`, `zustand`) and dev deps (`tailwindcss@^3`, `postcss`, `autoprefixer`, `tailwindcss-animate`, `@testing-library/user-event`).
- `apps/web/tsconfig.json` — added `baseUrl: "."` + `paths: { "@/*": ["./src/*"] }`.
- `apps/web/vite.config.ts` — added `import path from 'node:path'` + `resolve.alias { '@': path.resolve(__dirname, './src') }`.
- `apps/web/src/main.tsx` — prepend `import './app/globals.css'`; re-pointed `App` import to `./app/App`.
- `eslint.config.js` — added `react-refresh/only-export-components: off` override for `apps/web/src/components/ui/**`.
- `_bmad-output/implementation-artifacts/sprint-status.yaml` — `1-4-*` → `review`; `last_updated` bumped.
- `pnpm-lock.yaml` — pnpm updated.

**Deleted files**

- `apps/web/src/App.tsx`
- `apps/web/src/App.test.tsx`

### Change Log

- 2026-04-23 — Implemented Story 1.4: Direction B dark-theme shell, shadcn/ui (Radix) copy-in, five-tab overlay sidebar, disabled chat input, static status bar. 13 tests green; app builds and dev-serves cleanly. Status → `review`.
