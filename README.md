# Assemblage

A desktop web app that turns your [Semble](https://semble.so) collections into an editable node graph. Sign in with an AT Protocol **App Password**, pick one or more of your collections, add cards and collections, and draw typed connections between cards. Every change is written straight to your own PDS as standard Semble and Margin records, so it shows up in Semble and Margin too.

There is no Assemblage server and no database. The browser talks directly to your PDS.

> **Beta.** Single user, own records only, App Passwords only. See [Known limitations](#known-limitations).

## Quick start

```bash
npm install        # also generates TypeScript from ./lexicons (postinstall → lex build)
npm run dev        # http://localhost:5173
```

You need Node 22+. Sign in with your handle (or DID) and an App Password, which looks like `xxxx-xxxx-xxxx-xxxx`. On Bluesky-hosted accounts you create one under **Settings → Privacy and security → App passwords**.

| Script | What it does |
| --- | --- |
| `npm run dev` | Vite dev server |
| `npm run build` | Typecheck and production build to `dist/` (static, host anywhere) |
| `npm test` | Unit and integration tests (Vitest + happy-dom) |
| `npm run lint` | ESLint |
| `npm run typecheck` | `tsc -b` |
| `npm run lex:build` | Regenerate `src/lexicons/` from `lexicons/` |
| `npm run lex:install` | Verify the vendored lexicons against `lexicons.json` CIDs |

### Environment variables

All variables are optional, and all of them point at public, unauthenticated endpoints. No credentials are ever sent to them. Copy `.env.example` to `.env` to override them.

| Variable | Default | Used for |
| --- | --- | --- |
| `VITE_HANDLE_RESOLVER` | `https://public.api.bsky.app` | `com.atproto.identity.resolveHandle` (handle → DID). No credentials are sent. |
| `VITE_PLC_DIRECTORY` | `https://plc.directory` | Resolving `did:plc` documents to find your PDS. |
| `VITE_SEMBLE_API` | `https://api.semble.so` | Suggestions in the card inspector, from Semble's public API. The selected card's URL is sent. Set it to an empty string to turn suggestions off for everyone; each user can also turn it off in **Preferences → Privacy & data**. |
| `VITE_LINK_PREVIEW_SERVICE` | `https://cardyb.bsky.app/v1/extract` | Title and description preview when adding a card. Bluesky's link-card service receives the pasted URL. Set it to an empty string to turn previews off for everyone (each user can also turn them off in Preferences); you can still type a title. |

## How it works

### Data model

These are what Semble actually stores. They differ in places from the original brief:

| Concept | Record | Notes |
| --- | --- | --- |
| Collection | `network.cosmik.collection` | `name` (≤100), `description` (≤500), `accessType` (`CLOSED` = Personal, `OPEN` = anyone can add), `createdAt`, `updatedAt`. `collaborators` is kept untouched when editing; Semble's app doesn't use it. |
| Card | `network.cosmik.card` | `URL` cards (URL plus metadata) or `NOTE` cards. A note with a `parentCard` is shown as a note on that card. |
| Card ↔ collection | `network.cosmik.collectionLink` | **Membership is a separate record.** It is not a field on the card. |
| Connection | `network.cosmik.connection` | `source`, `target` (URL **or** AT URI), optional `connectionType`, optional `note`. Semble's own UI writes card URLs, and so do we. |
| Margin note | `at.margin.note` (revision 4) | W3C Web Annotation model. Margin's older `at.margin.annotation` schema is not used. |

**Connection types.** These match what Semble shows today:

- **Values** come from `ConnectionTypeEnum`.
- **Labels, descriptions, order, note placeholders and icon meanings** come from Semble's web app (`src/webapp/features/connections/const/connectionTypes.ts`).

Labels read as verbs from source to target. Stored values never change, so a rename such as `HELPFUL` → **Adds context to** doesn't affect existing records.

| Value | Label | Description |
| --- | --- | --- |
| `RELATED` | Relates to | Generally connected or associated |
| `SUPPORTS` | Supports | Provides evidence or reasoning in favour |
| `OPPOSES` | Opposes | Provides counter-evidence or reasoning against |
| `ADDRESSES` | Addresses | Responds to or answers a question or topic |
| `HELPFUL` | Adds context to | Provides useful context or background |
| `LEADS_TO` | Leads to | Led me to discover this |
| `EXPLAINER` | Explains | Explains or summarises for a broader audience |
| `SUPPLEMENT` | Supplements | Accompanying resources (e.g. data, code, other supplemental material) |
| `SAME_AS` | Same as | The same thing in a different place (mirror, reupload, DOI) |
| `REFERENCES` | References | Cites or points to the other |

Each type has an icon, a colour and a dash pattern, so colour is never the only cue. The lexicon allows any string, so unrecognised values are drawn as neutral dashed edges labelled with the raw value.

**Loading.** We read all of your cards, collection links and connections once each, following the cursors. Then we join them in the browser:

- **Cards:** those linked to the selected collections.
- **Edges:** every connection with at least one end on a selected card. Endpoints are matched by AT URI or by normalised URL.
- **Outside cards:** if the other end of a connection is not in the selection, it appears as a dashed card marked **Outside**. This covers three cases: a card in your library but in another collection, a card outside your library, or a bare URL. Outside cards can be inspected, connected to, and hidden with the "Show connected cards outside these collections" setting. Connections that touch no selected card are ignored.
- **Annotations:** your Margin notes, matched to cards by normalised URL.

### Adding cards and collections

**Cards.** Click **New card** at the top of the sidebar, press `N`, paste a link into the command bar, or right-click empty canvas and choose **New card** (the card is then placed where you clicked). The form follows Semble's: URL, optional note, and the collections to add the card to. The collections shown on the canvas are ticked by default. A preview prefills the title, which you can edit.

Everything is written in **one `applyWrites` commit**, exactly as Semble would write it:

- a `URL` card, with title and description in `content.metadata`
- an optional `NOTE` card that points at it with `parentCard`
- one `collectionLink` per chosen collection

Record keys are TIDs chosen in the browser, and record CIDs are computed locally with `@atproto/lex-cbor` (checked against the AT Protocol interop fixtures). That is what lets the note and the links reference the new card by strong ref within the same commit.

If the URL is already a card in your library (compared by normalised URL), no duplicate is made. The card is only added to the collections it isn't in yet. Semble keeps one note per link per user, so an existing note is kept and the note field is locked.

The new card is selected and zoomed to once it appears on the canvas. If none of the chosen collections is on the canvas, the form says so before you save.

**Collections.** Click **New collection** at the top of the sidebar's collection list. Enter a name (up to 100 characters), an optional description (up to 500), and a collaboration setting. The settings are Semble's: Personal (`CLOSED`, the default) or Open (`OPEN`). The new collection is ticked straight away.

**Account menu.** The button at the bottom of the sidebar shows your Bluesky display name and avatar. Both are read from the `app.bsky.actor.profile` record on your own PDS; the avatar is served by the PDS's public `getBlob` endpoint. The menu holds links only:

- **Your profile:** avatar, display name and handle, then **View on Bluesky** (`bsky.app/profile/{handle}`), **View on Semble** (`semble.so/profile/{handle}`) and **View on Margin** (`margin.at/profile/{did}`)
- **Assemblage:** the same three links for @assemblage.mu.social, plus **Give feedback** (Assemblage's form on userinput.app)
- **Preferences** (opens the Preferences dialog) and **Sign out**

Every link opens in a new tab. Assemblage's handle and DID are in `src/config.ts`.

### Collections on the canvas

With **Collections: Containers** (the default; Preferences → Canvas), each shown collection is a box around its cards. With **Flat**, cards are laid out freely with collection badges, as before.

- **Boxes.** A tinted box with a header showing the name, Personal/Open icon, card count and collapse chevron.
  - Drag the header to move the box with its cards.
  - Select the box to resize it from any edge or corner. It can't shrink past its cards.
  - Drag a card past an edge and the box grows to keep wrapping it, in any direction. This uses React Flow's `expandParent`; the box also keeps clear of the header and its padding.
  - **Fit to cards** (right-click, or the inspector) wraps the cards snugly with padding.
- **Collapse and expand.** Use the chevron or double-click. A collapsed collection becomes one compact node.
  - Connections to its hidden cards are **rolled up** into one edge per outside card and direction, labelled with the type or "*n* connections".
  - Connections between two cards of the same collapsed collection are hidden.
  - Selecting a hidden card or connection from the inspector expands the collection first.
- **Cards in several collections.** A card sits in its **primary** collection: the first shown one it belongs to. Badges name its other shown collections; click one to open that collection.
- **Where things are saved.** Everything is per browser, in `localStorage`, never on the PDS.
  - Each collection's own layout (card positions relative to the box, size, collapsed), per account. This is independent of which other collections are shown.
  - Where each box sits, plus any cards outside a box, per account and set of shown collections.
  - The first time a collection becomes a box, it keeps the arrangement its cards had on the flat canvas, if any; otherwise ELK lays it out. Boxes are packed so they don't overlap.
- **Right-click a collection:**
  - **New card here**: placed where you clicked, with the collection pre-ticked. A card created from empty canvas outside its box goes inside the box instead.
  - **Edit collection…**, **Fit to cards**, **Collapse/Expand**, **View on Semble**, **Delete collection…**
- **Connections never start or end at a collection.** Semble's connection endpoints are URLs or cards (`UrlOrCardIdType` is `URL | CARD`), so collection-to-card lines are derived from membership, never stored.

**Collection inspector.** Select a box (or a card's collection badge):

| Section | Contents |
| --- | --- |
| **Details** | Name, description, access (Personal/Open), created and updated dates; **Edit**, **View on Semble**, **Collapse/Expand**, **Fit to cards** |
| **Cards (n)** | **Yours**, from your `collectionLink`s (click to select). For Open collections, **Added by others**: cards other people added, which live in their repos and come from Semble's public `collection.getByAtUri`. **Add** puts one into your library, in this collection. |
| **Connections (n)** | Connections between the collection's cards and cards outside it, grouped by type and showing direction |
| **People (n)** | Contributors and follower count, from Semble's public `collection.getContributors` and `getByAtUri` |

**Editing and deleting collections.**
- **Edit** changes what Semble's own update supports: name, description, Personal/Open. It's updated in place with `swapRecord`, keeping `createdAt` and `collaborators` and setting `updatedAt`. Semble's indexer applies collection updates.
- **Delete** removes the collection record and your `collectionLink`s to it in one commit. Cards stay in your library and other collections.

### Preferences

`src/preferences/preferences.ts` holds the **system defaults** for every preference, and is the one place to change them. Only a user's overrides are stored (`assemblage:preferences:v1`, per browser), each validated on load. So changing a default reaches everyone who hasn't changed that setting, and a bad stored value falls back to the default.

Account menu → **Preferences** opens a native modal `<dialog>`: one scrolling page, centred, at most 560px wide and the window's height less 32px. Multiple-choice settings are vertical radio lists and on/off settings are checkboxes. Each shows its default: "(default)" after the default option, "(default: on/off)" after a checkbox.

Changes are a draft until **Save changes**, which is disabled while nothing differs from what's saved. **Exit without saving**, the close button and Escape all drop the draft. **Reset settings to defaults**, at the bottom, resets the draft; Save applies it.

| Section | Setting | Options (default first) | What it does |
| --- | --- | --- | --- |
| Appearance | Theme | Match system, Light, Dark | Sets `data-theme` on `<html>`; the dark tokens apply under the system setting unless Light is chosen, or always with Dark. The logo follows. |
| | Text size | Normal, Large, Larger | CSS `zoom` (1, 1.143, 1.286) on `.ui-scale`: the sidebar below its header, inspector sections, dialogs, menus and notifications. The canvas has its own zoom. |
| | Always reduce motion | off | Animated zooms take no time and CSS transitions and animations are cut. The system's reduce-motion setting is always respected too. |
| Canvas | Collections on the canvas | Containers, Flat | See [Collections on the canvas](#collections-on-the-canvas). |
| | Line style | Curved, Straight, Angled | Bezier, straight or rounded step paths for connections, roll-ups and the line drawn while connecting. |
| | Always show connection labels | off | Otherwise a label shows on hover or selection. |
| | Show connected cards outside these collections | on | The dashed outside cards. |
| | Show minimap | on | Also toggled from the view controls. |
| | Snap cards to the grid | off | 20px, matching the background dots. |
| | Zoom to new cards | on | After adding a card, the canvas moves to it (never when you chose where it goes). |
| Connections | Default connection type | Relates to, or any of Semble's types | What the New-connection form starts on when nothing is recommended. |
| | Recommended type | Choose it for me, Only mark it as recommended, Don't recommend a type | See [Recommended connection type](#recommended-connection-type). Off also skips the Semble lookup. |
| | Confirm before deleting connections | Always, Only when deleting several at once, Never | Skips the confirm dialog for one connection, or for any. Deleting cards and collections always asks. |
| Privacy & data | Use Semble's public data | on | Suggestions, recommendations from others' connections, and a collection's People and others' cards. Off: no requests to Semble's API at all. Disabled when `VITE_SEMBLE_API` is empty. |
| | Link previews | on | Bluesky's link-card service fills in a new card's title. Disabled when `VITE_LINK_PREVIEW_SERVICE` is empty. |
| | Load site icons and images | on | Favicons, page thumbnails and Semble contributors' avatars, loaded from the sites they belong to. Your own avatar comes from your PDS and always shows. |

Preferences survive sign-out. Sidebar and inspector open/closed state is remembered separately, as UI state.

### Command bar

`⌘K` / `Ctrl+K` (or **Search or run a command** under New card) opens a bar for doing almost anything from the keyboard. It's modelled on Raycast: results on the left, a preview of the highlighted one on the right, and the keys along the bottom.

**With nothing typed** it shows, in order:
- **Suggestions** for the selection: for one card, connect it, open its page, edit or delete it; for two cards, connect them either way; for a connection, change its type, reverse it, edit its note or delete it; for a collection, collapse, fit or hide it.
- **Recent** things you chose, ranked by frecency (how often, fading with a one-week half-life; stored per browser).
- Then the commands, by section: **Create**, **Canvas**, **Settings**, **Help & account**.

**Type to search** your whole library, not just the canvas. Results are fuzzy-ranked: the start of a title beats the start of a word, which beats any substring, which beats letters in order (`rdgst` finds radioghost). Matched letters are highlighted.

| Kind | Searched in | Enter |
| --- | --- | --- |
| Cards | title, site, URL, description, your Semble notes, your Margin notes | Shows it: adds every collection it's in (keeping what's shown), clears filters if they'd hide it, opens a collapsed box, then selects and zooms to it. A card in no collection opens its actions instead. |
| Collections | name, description | Adds it to the canvas and zooms to it. |
| Connections | their notes | Shows one end's collections if needed, then selects it. |
| Commands | title and keywords | Runs it. |

A matched note or description shows as an excerpt under the title. A pasted link (`https://…` or `www.…`) is offered first as **Add card**, with its title and image fetched for the preview (when link previews are on); if it's already in your library, that card is listed too. With no results, the bar offers **New collection “…”** and **Add a card**.

**Live preview.** As you move through results, the canvas glides to each card, connection or collection that's on it, landing below the bar, and everything else fades back. `Esc` returns the canvas to where it was; choosing something keeps it.

**Actions.** `⌘K` (or `→` at the end of the field) on a highlighted result lists everything you can do with it, with the preview kept:
- **cards:** show or select, connect to…, connect the selected card to this, open page, view on Semble, copy URL, edit, delete
- **collections:** show or zoom, hide, show only this one, collapse or expand, fit to cards, new card in it, edit, view on Semble, delete
- **connections:** show, change type, reverse direction, edit note, delete

**Connecting from the keyboard.** **Connect to…** asks for the target (any card in your library, searched the same way), then the type, then an optional note. Recommended type and default type work as in the connection editor (the recommended one is marked, and chosen for you if Preferences says so). Enter on the note saves. If neither card is on the canvas, the first one is shown.

**Settings.** Every preference is a command that applies at once: search "dark", "angled", "minimap" or "privacy". Each shows its current value. **Open Preferences…** opens the dialog.

**Keys.** `↑` `↓` (or `Ctrl+N` / `Ctrl+P`) move, `Page Up` / `Page Down` jump, `Enter` runs, `⌘K` or `→` opens actions, `⌫` in an empty field goes back, and `Esc` goes back and then closes. **Keyboard shortcuts** lists every shortcut in the app. The bar doesn't open over another dialog. It's an ARIA combobox and listbox (`aria-activedescendant`), announces the result count, returns focus on close, and follows Preferences → Text size and Reduce motion.

**Shortcuts:** `⌘K` / `Ctrl+K` command bar, `N` new card (it used to be `⌘K`), `⌘B` / `Ctrl+B` sidebar, `1` fit view, `2` zoom to selection, `0` 100%, `+` / `−` zoom, `Delete` delete selected connections. Single-key shortcuts don't fire while you're typing in a text field.

**Adding a command.** Commands come from providers in `src/commands/providers.ts`: functions from a `CommandContext` (the search index, what's on the canvas, the selection, preferences, and helpers to reveal, connect and edit) to a list of commands. A provider returns only the commands that make sense right now. A command has an id, title, section, icon, optional keywords, shortcut, description and current value, and a `run` that either does something (the bar closes) or returns `{ push: view }` to open a sub-view, as **Connect to…** does. Set `listed: true` to show it with an empty query; otherwise it's found by searching. Rows, sub-views and actions for cards, collections and connections are in `src/commands/entities.ts`.

### Suggestions from Semble

Select a card and the inspector shows **Suggestions from Semble**, built only from Semble's public AppView API. These `/xrpc/network.cosmik.*` endpoints accept requests from any origin and need no login. The browser sends a plain `GET` with no cookies or auth headers, so the only thing sent is the card's URL, which is already public in your PDS.

| Group | Endpoint | What it shows |
| --- | --- | --- |
| **Connected by others** | `network.cosmik.connection.getForUrl` (both directions) | Pages other people connected to or from this page, with their relationship type and direction. Several people making the same connection merge into one entry ("by @alice and 2 others"), ranked by how many made it. Your own connections are left out, because they're already on the canvas. |
| **Similar pages** | `network.cosmik.search.getSimilarUrls` | Semantically similar pages across Semble, minus the page itself and anything already listed above. |

Suggestions are the last section of the inspector. Each is a small card showing:

- a 56px thumbnail: Semble's image for the page, else the site's favicon on a tinted tile, else the domain's initial
- the title, the site, and how many Semble libraries hold it
- for "Connected by others", the relationship and who made it
- one action:

- **Connect** if the page is already one of your cards, even one in a collection that isn't on the canvas. It opens the connection editor, prefilled with the other person's relationship type and direction.
- **Add** if it isn't. It opens the add-card form with Semble's title and description, and the selected card's collections ticked. After saving, the connection editor opens with the type prefilled. The selected card stays selected, so you can keep working through its list.
- **Connected** once you have that connection (same direction and type for "Connected by others"; any connection for "Similar pages").

Results are cached per URL for the session. If either source fails, the other's results still show. If both fail, a Retry link appears.

"In my library" is worked out locally from your PDS data, because anonymous calls to Semble don't return `urlInLibrary`.

Semble's other public endpoints are next: collections containing a URL, other people's notes on it, and dismissals ([#4](https://github.com/renderghost/at-assemblage/issues/4)). Reading pages for key phrases and links is stashed in [#3](https://github.com/renderghost/at-assemblage/issues/3).

### Recommended connection type

The New-connection form, the Edit form in the inspector, and bulk retype all use the same single-column radio list: icon, edge swatch, label and description for each type.

A type is marked **Recommended** (a sparkle badge plus one line saying why) only when there is a strong signal. Otherwise nothing is recommended. The logic is in `src/services/sources/semble/recommendType.ts`.

1. **Same resource → Same as.** Any of:
   - the same DOI (from metadata or a `doi.org` link)
   - the same ISBN
   - one page is a web-archive copy of the other (Wayback Machine, archive.today)
   - the same page under a cosmetically different URL: `www.`, http/https, trailing slash, or tracking parameters such as `utm_*`, `fbclid`, `gclid`
2. **Other people's consensus.** Semble's `connection.getForUrl` shows how others connected these exact two pages, in this direction. A type is recommended when at least **2 people** connected them and **more than half** chose it. Each person counts once, your own connections are excluded, and it must be a type Semble defines. This lookup shares its cache with the suggestions list.

How the badge behaves in each form:

| Form | Behaviour |
| --- | --- |
| New connection | The recommended type is preselected, unless you arrived with an explicit type (for example from a suggestion row) or have already picked one. **Swap direction** recalculates the recommendation. |
| Edit connection | The badge is shown, but your stored type is never changed for you. |

**Preferences → Connections → Recommended type** changes this: **Only mark it as recommended** keeps the badge but never preselects, and **Don't recommend a type** turns recommendations off (and skips the Semble lookup behind them). Without a recommendation, a new connection starts on **Default connection type**.

### Editing connections

| Action | How | What is written |
| --- | --- | --- |
| Edit the note | Select a connection, then edit it in the inspector | `putRecord` in place, with the same AT URI. A `swapRecord` guard refuses the write if the record changed elsewhere. |
| Change the type or reverse it | Inspector: type picker or **Reverse direction**, then **Save changes** | An atomic replace (see below) |
| Move one end | Drag the end of an edge onto another card, then confirm | An atomic replace |
| Bulk retype | Shift-select connections (or select cards, then **Select the connections between these cards**), pick a type, then confirm | Replaces, in `applyWrites` batches of at most 100 operations. Selected connections that already have that type, or that would duplicate another connection, are skipped. |
| Delete | **Delete** button, or the Delete key, with one or more connections selected. You confirm first, unless Preferences → Confirm before deleting connections says otherwise. | `deleteRecord` for one connection, `applyWrites` for several |

**Why type and direction changes are replacements.** Semble's indexer only applies **note** changes from record updates. See `ProcessConnectionFirehoseEventUseCase` in Semble, where source, target and type changes are ignored. If we updated the type in place, your PDS and Semble would disagree.

So these edits delete the old record and create a new one in **one `applyWrites` commit**. Either both happen or neither does. The new record keeps the original `createdAt`, gets a fresh `updatedAt`, and has a new AT URI. The edited edge stays selected throughout.

All edits are optimistic and roll back on failure. A failed bulk batch is reloaded from the PDS, because a batch larger than 100 operations spans several commits and earlier ones may already have landed.

### Architecture

```
src/
  services/atproto/   identity resolution, App Password session, error mapping
  services/sources/   source adapters (Semble, Margin) → generic graph model
  graph/              source-agnostic model, filters, ELK layout, local positions
  queries/            TanStack Query hooks (server state, optimistic mutations)
  state/              Zustand store (selection, filters, drafts, notices)
  components/         sign-in, sidebar, React Flow canvas, inspector, dialogs
  lexicons/           GENERATED by `lex build` (git-ignored)
lexicons/             vendored lexicon JSON (committed)
lexicons.json         lexicon manifest with CIDs (committed)
```

- **The PDS is the source of truth.** TanStack Query caches PDS reads. Nothing is duplicated into a local database.
- **Graph-agnostic UI.** The canvas, filters, layout and inspector only use `GraphItem`, `GraphLink` and `Annotation` from `src/graph/model.ts`. Semble- and Margin-specific code lives in `src/services/sources/*`, and the two meet in `src/queries/useWorkspaceGraph.ts`. To add another AT Protocol app, write a new adapter and join it in there.
- **Typed records only.** Every read goes through `client.list`/`listAll`, which validates against the generated schemas. Records that fail validation are counted and reported, never used. Every write is built with `$build` and checked with `$parse` before it is sent.
- **Edge routing.** Every card has a handle on each side. Each edge attaches to the facing sides of its two cards: whichever axis has the larger clear gap, so side-by-side cards connect left↔right and stacked cards top↔bottom (`src/graph/edgeSides.ts`). This is recalculated from live positions, so edges follow a card while you drag it. Because edges use real handles, React Flow's drag-to-move anchors stay at the true ends.
- **Layout.** ELK places cards that have no saved position yet; after that, cards stay where you put them. Manual positions are saved in `localStorage`, keyed by DID and the set of selected collections. They are never written to the PDS. A "Tidy layout" command was removed because its results weren't good enough; see [#7](https://github.com/renderghost/at-assemblage/issues/7).
- **Left sidebar.** **Collections** and **Filters** are two tabs, so each gets the full height. The feedback and Bluesky links are in the account menu. In the tabs, a dot on the Filters tab shows when filters are active. The button left of the logo hides the sidebar (also `⌘B` / `Ctrl+B`, from anywhere except an open dialog). While it's hidden, the same button floats at the canvas's top left in exactly the same spot, matching the view controls at the bottom left. This browser remembers whether the sidebar is shown.
- **Inspector.** A stack of cards floating over the canvas's right edge, 320px wide and 16px in from the top and right. It slides in when something is selected and out when nothing is. Each section collapses on its own and several can be open at once; Details and Notes are open by default, and this browser remembers your choices from card to card and across visits. The stack scrolls when it's taller than the canvas, and the gaps between cards pass clicks through to the canvas. Fit view, zoom to selection, the minimap (top right) and notifications all keep clear of it while it's showing. For a selected card, the sections are:

  | Section | Contents |
  | --- | --- |
  | **Details** | Thumbnail at 1200×630, site, title, **Edit**, **View on Semble** (`semble.so/url/<url>`), description and the page link |
  | **Notes (n)** | **Semble**: your note on the card, which you can add or edit. **Margin**: your Margin notes, plus a form to add one. |
  | **Collections (n)** | Every collection the card is in, linking to it on Semble |
  | **Connections (n)** | Grouped by type, both directions; click one to select it |
  | **Suggestions (n)** | Grouped by category (Connected by others, Similar pages) |

  **Edit** opens the card editor, which offers what Semble's own UI does: choose the card's collections, or delete it. Collection changes are written as `collectionLink` creates and deletes in one commit. The title is read-only: Semble fetches titles itself, and its indexer ignores edits to URL cards. Your Semble note is edited in the Notes section; Semble does apply NOTE card edits. Notes are updated in place, and the write is refused if the note changed elsewhere.

  **Deleting a card** removes the card, its note and its collection links in one commit. The confirm dialog offers to delete its connections too (ticked by default); if kept, they still point at the page, which then shows as an outside card.

  **Right-click** a card for **Edit card…**, **Delete card…**, **Open page** and **View on Semble**; right-click empty canvas for **New card**.

  With a connection selected, the inspector shows a single **Connection** section; with several things selected, a **Selection** section.
- **App shell.** The app is fixed to the window: the page itself never scrolls, and the sidebar, canvas and inspector each scroll inside themselves. On a narrow window the sidebars keep their width and the canvas shrinks.
- **View controls.** A toolbar floats at the bottom left of the canvas:

  | Control | Shortcut |
  | --- | --- |
  | Zoom out | `-` |
  | Current zoom level (click to return to 100%) | `0` |
  | Zoom in | `+` |
  | Fit view | `1` |
  | Zoom to selection (cards, or both ends of selected connections) | `2` |
  | Show/hide minimap | — |

  Shortcuts are ignored while you type in a field or a dialog is open. The minimap hides itself when the canvas is narrower than 600px.
- **Reloading.** The ↻ button on the Collections tab, next to **New collection**, reloads everything from your PDS: collections, cards, connections and Margin notes.

### Authentication and credentials

The sign-in flow works like this:

1. A handle is resolved to a DID, then to a DID document, then to your PDS. We call `createSession` **on your PDS**, not on a hard-coded host.
2. The password field only accepts the App Password format (`xxxx-xxxx-xxxx-xxxx`). A typed main account password is rejected before any request is made.
3. If the PDS returns `AuthFactorTokenRequired`, the form asks for the emailed code and retries.

`@atproto/lex-password-session` handles token refresh. Refresh is single-flight: concurrent requests trigger only one `refreshSession`, and each request is retried once with the new token.

Tokens are kept in memory. If you tick **Keep me signed in**, only the refresh token, DID, handle and PDS URL are saved to `localStorage`. The access token and the App Password are never stored. If the refresh token is revoked, local credentials are cleared and you are returned to sign-in.

"Sign out" calls `deleteSession` and clears local credentials and in-memory graph state. Saved layout positions are not cleared, because they contain no credentials.

Tokens never appear in URLs, logs or error messages. All errors go through `describeError`, which produces fixed, actionable text.

## Lexicons

The `lex` CLI normally resolves schemas over DNS (`_lexicon.<authority>` TXT records). That was not possible in the build environment, so the schemas are **vendored** in `lexicons/`. `lexicons.json` uses a local `directory` resolver, and every file is locked by CID. Network resolution is still the fallback for anything not vendored.

| Lexicons | Source | Revision |
| --- | --- | --- |
| `network.cosmik.*` | [cosmik-network/semble](https://github.com/cosmik-network/semble) `src/modules/atproto/infrastructure/lexicons/` | commit `ab1d9de` (2026-10-19) |
| `at.margin.note` | [margin-at/margin](https://github.com/margin-at/margin) `lexicons/at/margin/note.json` | commit `06a393e` (2026-09-12), lexicon revision 4 |
| `com.atproto.*` | [bluesky-social/atproto](https://github.com/bluesky-social/atproto) `lexicons/` | commit `a2840e2` (2026-10-20) |
| `app.bsky.richtext.facet` | [bluesky-social/bsky](https://github.com/bluesky-social/bsky) `lexicons/` (needed by `at.margin.note`) | commit `297ceac` (2026-10-17) |

To add or update a lexicon:

```bash
# With working DNS, from the network:
npx lex install <nsid>            # or: npx lex install --update
# Without DNS: drop the JSON into lexicons/<a>/<b>/<c>.json, then:
npx lex install <nsid>            # resolved via the local directory resolver
npm run lex:build
```

> The `lex` CLI README still shows a `"version": 1` manifest with `resolvers`. Version 0.4 only honours `resolvers` in a `"version": 2` manifest.

## Testing

```bash
npm test
```

| File | What it covers |
| --- | --- |
| `src/services/atproto/identity.test.ts` | Handle/DID validation, DID document parsing, PDS resolution |
| `src/services/atproto/session.test.ts` | App Password sign-in success and failure, two-factor flow, single-flight refresh after expiry, revoked refresh token, resume, sign-out, what gets persisted |
| `src/services/sources/semble/mapping.test.ts` | Semble records → graph, note folding, URL/AT URI endpoint resolution, outside cards, connection record building and lexicon validation, edit planning (in-place update vs replace), unknown-type fallback, duplicates |
| `src/services/sources/semble/api.test.ts` | Cursor pagination (250 records), invalid-record handling, connection create/delete, in-place note update and swap conflicts, atomic replace, 240-operation batches split without separating a replacement's delete and create, bulk delete |
| `src/services/sources/margin/notes.test.ts` | Margin note building, validation, round-trip |
| `src/queries/semble.test.tsx` | Optimistic create, rollback on failure (with retry draft), delete rollback, duplicate guard; edits that keep selection through a replace; rollback on a swap conflict; bulk retype and delete |
| `src/graph/filters.test.ts`, `src/services/sources/url.test.ts` | Search, filters, URL normalisation |
| `src/graph/edgeSides.test.ts` | Nearest-side choice for side-by-side, stacked, diagonal and overlapping cards |
| `src/components/auth/SignInScreen.test.tsx` | Rejecting non-App-Passwords, two-factor prompt, credential errors |
| `src/services/sources/semble/create.test.ts` | New card, note and link records shaped like Semble's; URL validation; reusing an existing card (links only for missing collections, one note per link); a single commit whose locally computed CIDs match the PDS's; collection records and lexicon limits |
| `src/services/sources/semble/notes.test.ts` | Adding a Semble note linked to a card, editing it in place, refusing an edit when the note changed elsewhere |
| `src/services/sources/semble/cards.test.ts` | Changing a card's collections in one commit; deleting a card with its note, links and connections (matched by URL or AT URI), leaving unrelated records |
| `src/graph/containers.test.ts` | Primary collection; wrapping (grows only, moves origin left/up with a matching shift); fit to cards; placing new cards; packing boxes without overlap or one long strip; roll-ups |
| `src/preferences/preferences.test.ts` | Defaults; only overrides stored; invalid or unknown stored values (including unknown connection types) fall back; comparing preference sets for Save |
| `src/services/sources/semble/collections.test.ts` | Collection edit in place (fields kept, `updatedAt` set), conflict refusal, lexicon limits; delete removes the collection and its links in one commit, keeping cards |
| `src/services/linkPreview.test.ts` | Preview mapping; failure and disabled cases |
| `src/services/sources/semble/appview.test.ts` | Semble API calls (plain GET, no credentials), lenient response validation, error mapping |
| `src/services/sources/semble/recommendType.test.ts` | Same-resource signals (DOI, ISBN, archive copies, cosmetic URL differences) and staying silent for different pages. Consensus thresholds (2+ people, majority, same direction, one vote per person, own connections and unknown types excluded). Same-resource takes priority. |
| `src/commands/match.test.ts`, `src/commands/searchIndex.test.ts` | Command bar ranking (prefix, word start, substring, letters in order; accents ignored), all-words matching with highlights and excerpts; indexing every library card with all its collections, Semble and Margin notes and connection count; connections by note |
| `src/commands/recents.test.ts`, `src/commands/root.test.ts` | Frecency ranking and bad stored data; providers offering only settings you aren't on and suggestions for one or two selected cards; the first page's sections, recents, ranking commands against cards, pasted links, no-results fallbacks, loading and error rows |
| `src/services/sources/semble/suggestions.test.ts` | Direction from either end (including `www.` variants), skipping your own connections, merging curators and ranking, flagging pages in your library and connections already made, de-duplicating similar pages |

The integration tests use `src/test/fakePds.ts`. This is an in-memory PDS, PLC directory and handle resolver. The real `@atproto/lex` client and `PasswordSession` run against it over `fetch`, including token expiry, revocation, cursors and injected failures. Like a real PDS, it hashes each created record as received to produce its CID.

The tests use happy-dom rather than jsdom. Under jsdom, typed arrays come from a separate realm, which breaks the `instanceof Uint8Array` check in multiformats when hashing for CIDs.

### Manual checks performed

The app was driven end to end in Chromium (Playwright) against the fake PDS, with no console errors. The run covered:

- sign-in with "keep me signed in"
- selecting two collections
- inspector and Margin note display
- drag-to-connect and saving through the editor (record verified on the PDS)
- the duplicate guard
- an injected 500 error: rollback, then a successful retry
- keyboard Delete with confirmation
- creating a Margin note
- search and type filters
- dragging a card, reloading, and checking that the session, collections and position were restored
- transparent token refresh
- sign-out (`deleteSession` called, no stored session left)

A second run covered connection editing. It checked these against the stored records:

- outside cards
- an in-place note edit (same record key)
- a type change plus reversal as one `applyWrites` commit, with the note and `createdAt` kept and the edge still selected
- dragging an edge end to another card (the orphaned outside card disappears)
- a bulk retype of 3 connections
- a bulk delete with the keyboard
- hiding outside cards

A third run covered creation and the account menu:

- logo, display name and avatar (a content-addressed blob from the PDS)
- adding a card with preview, note and default collection: one commit of 3 records, and the card appears selected
- adding the same URL again: no new card, the note locked, and only the missing collection link written
- creating a collection: name validation, Open access, and the collection ticked afterwards
- the account menu: toggling a setting, closing with Escape (focus returns to the button), closing on an outside click, and signing out from it

A fourth run covered suggestions, with Semble's API mocked:

- both groups, with merged curators, directions, saved-by counts, and your own connection excluded
- only the two endpoints called, as plain GETs with no auth or cookies
- Connect to a library card in another collection: the editor opened with Leads to prefilled, and the record was saved
- Add then connect: the form was prefilled with no link-preview call, the card's collection was ticked, then Supports was prefilled and saved
- rows switching to **Connected**
- Semble returning 503: the error and Retry showed, and Retry recovered

A fifth run covered the polish work:

- suggestions below Margin notes, with image and initial-tile thumbnails
- Semble's ten labels in the picker
- the consensus recommendation preselected after Add-and-connect and when dragging Zoning → Parking
- swapping direction clearing a recommendation that no longer applies
- an archived copy recommending **Same as**
- no badge without a strong signal
- the Edit form showing the badge without changing the stored type
- swap and reverse as bordered buttons with icons

Scale, measured in headless Chromium with software rendering:

| Cards | Load and first layout |
| --- | --- |
| 25 | ~1.3 s |
| 100 | ~1.7 s |
| 300 | ~2.2–2.8 s |

Panning stays usable at 300 cards: about 28 fps headless, which should be higher on GPU-backed browsers.

A run in Chrome covered collections on the canvas:
- dragging a card past a box's left edge (the box grew and the card stayed inside)
- moving a box by its header
- resizing, then **Fit to cards** shrinking it back
- the collection inspector's four sections, with Semble data mocked
- a card's badge opening its other collection
- others' cards in an Open collection
- collapsing by double-click (4 labelled roll-ups, hidden cards), surviving a reload, and expanding by chevron
- the collection menu and **New card here** (the card lands inside the box)
- editing in place (description, `createdAt` kept; `updatedAt` set)
- switching to Flat and resetting to defaults
- deleting a collection (its links removed, cards kept)
- no console errors

A run in Chrome covered the account menu and Preferences, with Semble's API mocked:
- the menu's seven links and their URLs, then Preferences and Sign out
- the dialog: four sections, "(default)" markers, Save disabled until something changes and again when changed back
- Exit without saving and Escape dropping changes; reopening from the saved values
- saving Dark, Larger, Straight, snap, Supports, Never, and Semble data and site images off: only those overrides stored, `<html>` attributes set, sidebar zoom 1.286, straight edge paths, no favicons
- with Semble data off, selecting a card made no requests to Semble and showed no Suggestions
- with Never, the Delete key removed a connection without a dialog
- Reset settings to defaults, then Save: nothing stored
- at 800×520 the dialog fits, its body scrolls and the footer stays in view
- no console errors

Two runs in Chrome covered the command bar:
- `⌘K` opening it; `N` opening New card (also from a focused checkbox)
- searching "radio": the card highlighted, spotlighted and glided to; `Esc` closing and restoring the view
- searching an outside card and pressing Enter: its collection added, the card selected
- a card's actions with `⌘K`, then **Connect to…** → a target → **Supports** → a note → Enter: the record on the PDS had the type and note
- "dark" → **Theme: Dark** applied
- a pasted new URL offering **Add card** first; a known URL listing its card once
- no results offering **New collection “…”** and **Add a card**
- a collection found by name and shown; a connection found by its note and selected
- Suggestions for a selected connection, and **Reverse direction** swapping the record's ends
- two selected cards offering both directions; recents after use; **Keyboard shortcuts**; `⌫` back; `Esc` close
- not opening over the New card dialog
- dark theme with Larger text; at 600px wide the preview pane hides
- no console errors

## Known limitations

- **Collections are containers or flat; the hub-node presentation is still to come** ([#16](https://github.com/renderghost/at-assemblage/issues/16)).
- **The command bar doesn't yet add notes, retype several connections at once, or arrange cards** ([#17](https://github.com/renderghost/at-assemblage/issues/17)); use the inspector for those. Recents and the live preview's spotlight are per browser.
- **Dragging a card into another collection's box doesn't change its collections.** Positions only; use Edit card.
- **Box layouts are per browser**, like card positions.
- **Own records only.** Cards that other people added to your open collections live in their repos and are not loaded. The same applies to other people's connections and Margin notes. Reading those needs an AppView.
- **Margin notes are basic.** You can read your own notes on a card's URL and create plain `commenting` notes. Editing, highlights, selectors and bookmarks are not supported.
- **Changing a connection's type or ends gives it a new AT URI.** This is the price of staying in sync with Semble (see [Editing connections](#editing-connections)). Anything that linked to the old URI will not follow it.
- **Handle resolution uses a public resolver.** By default this is `public.api.bsky.app`. Enter a DID to skip it entirely.
- **Positions are per browser.** Layout is not synced across devices.
- **Favicons** are loaded directly from each card's domain, with no referrer. Turn them off in Preferences → Load site icons and images.
- **The App Password format check** assumes the standard `xxxx-xxxx-xxxx-xxxx` format used by the reference PDS.
- **Cards and collections can be created, but not yet edited or deleted.** The same applies to notes and to removing a card from a collection. Use Semble for those for now.
- **Link previews use Bluesky's link-card service.** Turn them off in Preferences, or for everyone with `VITE_LINK_PREVIEW_SERVICE=`. Without a preview, the card's title is whatever you type, or a cleaned-up URL; Semble fetches its own metadata either way.
- Out of scope for the beta: OAuth, public or other users' collections, network search, collaboration, offline sync, import/export, and AI features.
