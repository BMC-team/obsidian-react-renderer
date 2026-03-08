# React Renderer for Obsidian

Render live JSX/React components inside your Obsidian notes. Works in both **Reading Mode** and **Live Preview**.

Built as a modern replacement for the abandoned [obsidian-react-components](https://github.com/elias-sundqvist/obsidian-react-components) plugin, with full compatibility for Obsidian v1.5+.

## Features

- **JSX code blocks** — write `jsx` fenced code blocks that render as live React components
- **Reusable components** — define components in a folder, use them across all notes
- **Cross-note component registry** — `jsx:component:Name` blocks register globally available components
- **Full React 18** — `useState`, `useEffect`, all hooks available out of the box
- **Scope injection** — React, hooks, `obsidian` API, `app`, `Markdown` helper, and all registered components injected automatically
- **`<Markdown>` component** — render Obsidian-flavored markdown inside React components
- **Shared state** — `useSharedState(key, initialValue)` for inter-component communication
- **Header components** — auto-inject a React component at the top of every note
- **Live Preview** — components render inline in the editor; click to edit source
- **Error boundaries** — graceful error display with retry button

## Quick Start

### Inline JSX

````markdown
```jsx
const [count, setCount] = React.useState(0);
return (
  <div>
    <p>Count: {count}</p>
    <button onClick={() => setCount(c => c + 1)}>+1</button>
  </div>
);
```
````

### Define a Reusable Component

````markdown
```jsx:component:Counter
const [count, setCount] = useState(0);
return (
  <div>
    <strong>Counter: {count}</strong>
    <button onClick={() => setCount(c => c + 1)}>Increment</button>
  </div>
);
```
````

Then use it in any note:

````markdown
```jsx
return <Counter />;
```
````

### File-Based Components

1. Set a **Components folder** in settings (e.g., `components`)
2. Create `components/MyWidget.md`:

```markdown
---
react-components-namespace: global
---
const [text, setText] = useState("Hello");
return <input value={text} onChange={e => setText(e.target.value)} />;
```

3. Use `<MyWidget />` in any `jsx` code block.

### Shared State

Two separate code blocks sharing state:

````markdown
```jsx
const [name, setName] = useSharedState("username", "World");
return <input value={name} onChange={e => setName(e.target.value)} />;
```

```jsx
const [name] = useSharedState("username", "World");
return <h2>Hello, {name}!</h2>;
```
````

### Markdown Helper

````markdown
```jsx
return (
  <div>
    <Markdown src="**Bold** text with [[wiki links]] and $math$" />
  </div>
);
```
````

## Available in Scope

| Identifier | Description |
|---|---|
| `React` | React 18 |
| `useState`, `useEffect`, `useCallback`, `useMemo`, `useReducer`, `useRef`, `useContext`, `useId` | React hooks |
| `useSyncExternalStore`, `useTransition`, `useDeferredValue` | React 18 hooks |
| `app` | Obsidian `App` instance |
| `obsidian` | Full `obsidian` module |
| `Markdown` | Component to render Obsidian markdown |
| `useSharedState` | Cross-component shared state hook |
| All registered component names | Auto-injected as scope variables |

## Settings

| Setting | Default | Description |
|---|---|---|
| Components folder | (empty) | Vault path to folder with component `.md`/`.jsx`/`.tsx` files |
| Auto refresh | On | Re-render when component source files change |
| Live Preview | On | Render JSX inline in editor mode |
| Header component | Off | Inject a named component at top of every note |
| Lazy load Babel | On | Defer loading the transpiler until first use |

## Building from Source

```bash
npm install
npm run dev    # development build with sourcemaps
npm run build  # production build (minified)
```

Copy `main.js`, `manifest.json`, and `styles.css` to your vault's `.obsidian/plugins/obsidian-react-renderer/` folder.

## Architecture

```
src/
├── main.ts                    # Plugin entry point
├── types.ts                   # Shared interfaces
├── settings.ts                # Settings tab
├── transpiler/
│   ├── BabelManager.ts        # Lazy Babel loader
│   └── transpile.ts           # JSX → JS transpilation with caching
├── registry/
│   ├── ComponentRegistry.ts   # Central component store + events
│   └── ComponentLoader.ts     # File-based component scanner
├── scope/
│   ├── ScopeBuilder.ts        # Builds execution scope with hooks, components
│   └── evaluate.ts            # Code evaluation via new Function()
├── renderer/
│   ├── ReactRenderer.ts       # React 18 createRoot lifecycle
│   ├── ErrorBoundary.tsx      # Error catch + display
│   ├── MarkdownComponent.tsx  # <Markdown> helper
│   └── ComponentWrapper.tsx   # Wraps user components with error boundary
├── processors/
│   ├── CodeBlockProcessor.ts  # Reading mode jsx block handler
│   └── HeaderProcessor.ts     # Header component injection
├── editor/
│   ├── LivePreviewPlugin.ts   # CM6 ViewPlugin for Live Preview
│   ├── JsxWidget.ts           # CM6 WidgetType for rendered components
│   └── CodeBlockDetector.ts   # Syntax tree JSX block finder
└── utils/
    ├── dom.ts                 # DOM attachment helpers
    ├── context.ts             # Canvas detection
    └── debounce.ts            # Debounce utility
```

## License

MIT
