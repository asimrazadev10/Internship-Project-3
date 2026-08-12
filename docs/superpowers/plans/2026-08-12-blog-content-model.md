# Blog Content Model Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add three related content types (Author, Category, Article) to the Strapi install, seeded with sample data and readable over the public REST API.

**Architecture:** Each content type is a standard Strapi API folder — a `schema.json` describing the fields plus factory-generated controller, route, and service files containing no custom logic. A `bootstrap` hook in `src/index.ts` seeds sample rows once and grants the Public role read-only access. Strapi reads the schema files at startup and migrates the SQLite tables itself; there are no hand-written migrations.

**Tech Stack:** Strapi 5.52.0, TypeScript, SQLite (better-sqlite3), Node 22. Verification is done with `curl` against the running dev server — the project has no unit test framework, and these deliverables are HTTP endpoints, so HTTP checks are the real test.

## Global Constraints

- Strapi version is exactly `5.52.0`. Use the Strapi 5 Document Service API (`strapi.documents(uid)`), **not** the Strapi 4 Entity Service (`strapi.entityService`) — the latter is removed.
- Relations in Strapi 5 are connected by `documentId` (a string like `abc123xyz`), not by numeric `id`.
- Content type folder names are **singular** (`src/api/author/`), and the inner content-type folder repeats that singular name.
- `draftAndPublish` is `true` for Article only; `false` for Author and Category.
- No custom controller, route, or service logic. Factory calls only.
- Public role gets `find` and `findOne` only. Never `create`, `update`, or `delete`.
- The dev server runs in watch mode and reloads automatically on file changes. Give it ~10 seconds after a schema edit before curling.

## File Structure

| File | Responsibility |
|---|---|
| `src/api/author/content-types/author/schema.json` | Author fields and its inverse relation to Article |
| `src/api/author/controllers/author.ts` | Factory controller, no logic |
| `src/api/author/routes/author.ts` | Factory router, no logic |
| `src/api/author/services/author.ts` | Factory service, no logic |
| `src/api/category/content-types/category/schema.json` | Category fields and its inverse relation to Article |
| `src/api/category/controllers/category.ts` | Factory controller |
| `src/api/category/routes/category.ts` | Factory router |
| `src/api/category/services/category.ts` | Factory service |
| `src/api/article/content-types/article/schema.json` | Article fields and both owning relations |
| `src/api/article/controllers/article.ts` | Factory controller |
| `src/api/article/routes/article.ts` | Factory router |
| `src/api/article/services/article.ts` | Factory service |
| `src/seed/data.ts` | Plain seed data constants — no Strapi imports |
| `src/seed/index.ts` | `seedBlog(strapi)` and `grantPublicReadAccess(strapi)` |
| `src/index.ts` (modify) | Calls both seed functions from `bootstrap` |

Seeding lives in `src/seed/` rather than inline in `src/index.ts` so the data constants stay readable and separate from the logic that writes them.

---

### Task 1: Author content type

Author is built first because Article's relation targets it. Building Article first would produce a schema referencing a non-existent type, and Strapi refuses to boot on a dangling relation target.

**Files:**
- Create: `src/api/author/content-types/author/schema.json`
- Create: `src/api/author/controllers/author.ts`
- Create: `src/api/author/routes/author.ts`
- Create: `src/api/author/services/author.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: content type UID `api::author.author`, with attributes `name`, `email`, `bio`, `avatar`, `articles`. Task 3 targets this UID; Task 4 creates rows in it.

- [ ] **Step 1: Confirm the endpoint does not exist yet**

Run: `curl -s -o /dev/null -w "%{http_code}\n" http://localhost:1337/api/authors`
Expected: `404` — no such route.

- [ ] **Step 2: Write the schema**

Create `src/api/author/content-types/author/schema.json`:

```json
{
  "kind": "collectionType",
  "collectionName": "authors",
  "info": {
    "singularName": "author",
    "pluralName": "authors",
    "displayName": "Author",
    "description": "People who write articles"
  },
  "options": {
    "draftAndPublish": false
  },
  "pluginOptions": {},
  "attributes": {
    "name": {
      "type": "string",
      "required": true
    },
    "email": {
      "type": "email",
      "unique": true
    },
    "bio": {
      "type": "text"
    },
    "avatar": {
      "type": "media",
      "multiple": false,
      "allowedTypes": ["images"]
    },
    "articles": {
      "type": "relation",
      "relation": "oneToMany",
      "target": "api::article.article",
      "mappedBy": "author"
    }
  }
}
```

Note: the `articles` relation targets a type that does not exist until Task 3. Strapi will fail to boot until then — that is expected and is resolved by Task 3. Do not curl between Task 1 and Task 3.

- [ ] **Step 3: Write the factory files**

Create `src/api/author/controllers/author.ts`:

```typescript
import { factories } from '@strapi/strapi';

export default factories.createCoreController('api::author.author');
```

Create `src/api/author/routes/author.ts`:

```typescript
import { factories } from '@strapi/strapi';

export default factories.createCoreRouter('api::author.author');
```

Create `src/api/author/services/author.ts`:

```typescript
import { factories } from '@strapi/strapi';

export default factories.createCoreService('api::author.author');
```

- [ ] **Step 4: Commit**

```bash
git add src/api/author
git commit -m "feat: add Author content type"
```

---

### Task 2: Category content type

**Files:**
- Create: `src/api/category/content-types/category/schema.json`
- Create: `src/api/category/controllers/category.ts`
- Create: `src/api/category/routes/category.ts`
- Create: `src/api/category/services/category.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: content type UID `api::category.category`, with attributes `name`, `slug`, `description`, `articles`. Task 3 targets this UID; Task 4 creates rows in it.

- [ ] **Step 1: Write the schema**

Create `src/api/category/content-types/category/schema.json`:

```json
{
  "kind": "collectionType",
  "collectionName": "categories",
  "info": {
    "singularName": "category",
    "pluralName": "categories",
    "displayName": "Category",
    "description": "Topic buckets for articles"
  },
  "options": {
    "draftAndPublish": false
  },
  "pluginOptions": {},
  "attributes": {
    "name": {
      "type": "string",
      "required": true,
      "unique": true
    },
    "slug": {
      "type": "uid",
      "targetField": "name"
    },
    "description": {
      "type": "text"
    },
    "articles": {
      "type": "relation",
      "relation": "manyToMany",
      "target": "api::article.article",
      "mappedBy": "categories"
    }
  }
}
```

- [ ] **Step 2: Write the factory files**

Create `src/api/category/controllers/category.ts`:

```typescript
import { factories } from '@strapi/strapi';

export default factories.createCoreController('api::category.category');
```

Create `src/api/category/routes/category.ts`:

```typescript
import { factories } from '@strapi/strapi';

export default factories.createCoreRouter('api::category.category');
```

Create `src/api/category/services/category.ts`:

```typescript
import { factories } from '@strapi/strapi';

export default factories.createCoreService('api::category.category');
```

- [ ] **Step 3: Commit**

```bash
git add src/api/category
git commit -m "feat: add Category content type"
```

---

### Task 3: Article content type

This task resolves the dangling relation targets left by Tasks 1 and 2, so the server can boot again. Article owns both relations: it carries `inversedBy`, while Author and Category carry `mappedBy`. Getting this backwards makes the relation appear in only one direction.

**Files:**
- Create: `src/api/article/content-types/article/schema.json`
- Create: `src/api/article/controllers/article.ts`
- Create: `src/api/article/routes/article.ts`
- Create: `src/api/article/services/article.ts`

**Interfaces:**
- Consumes: `api::author.author` (Task 1), `api::category.category` (Task 2).
- Produces: content type UID `api::article.article`, with attributes `title`, `slug`, `excerpt`, `content`, `cover`, `author`, `categories`. Task 4 creates rows in it.

- [ ] **Step 1: Write the schema**

Create `src/api/article/content-types/article/schema.json`:

```json
{
  "kind": "collectionType",
  "collectionName": "articles",
  "info": {
    "singularName": "article",
    "pluralName": "articles",
    "displayName": "Article",
    "description": "Blog posts"
  },
  "options": {
    "draftAndPublish": true
  },
  "pluginOptions": {},
  "attributes": {
    "title": {
      "type": "string",
      "required": true
    },
    "slug": {
      "type": "uid",
      "targetField": "title"
    },
    "excerpt": {
      "type": "text",
      "maxLength": 300
    },
    "content": {
      "type": "richtext"
    },
    "cover": {
      "type": "media",
      "multiple": false,
      "allowedTypes": ["images"]
    },
    "author": {
      "type": "relation",
      "relation": "manyToOne",
      "target": "api::author.author",
      "inversedBy": "articles"
    },
    "categories": {
      "type": "relation",
      "relation": "manyToMany",
      "target": "api::category.category",
      "inversedBy": "articles"
    }
  }
}
```

- [ ] **Step 2: Write the factory files**

Create `src/api/article/controllers/article.ts`:

```typescript
import { factories } from '@strapi/strapi';

export default factories.createCoreController('api::article.article');
```

Create `src/api/article/routes/article.ts`:

```typescript
import { factories } from '@strapi/strapi';

export default factories.createCoreRouter('api::article.article');
```

Create `src/api/article/services/article.ts`:

```typescript
import { factories } from '@strapi/strapi';

export default factories.createCoreService('api::article.article');
```

- [ ] **Step 3: Restart the server and confirm it boots**

The dev server may be in a crash-loop from Tasks 1-2. Restart it cleanly:

```bash
pkill -f "strapi develop" || true
nohup npm run develop > /tmp/strapi.log 2>&1 &
```

Wait ~30 seconds, then run: `grep -c "Strapi started successfully" /tmp/strapi.log`
Expected: `1` or more. If `0`, read the log for the schema error and fix it before continuing.

- [ ] **Step 4: Confirm all three endpoints now exist**

Run:

```bash
for p in articles authors categories; do
  echo -n "$p -> "
  curl -s -o /dev/null -w "%{http_code}\n" "http://localhost:1337/api/$p"
done
```

Expected: `403` for all three. **403, not 404** — the routes now exist, but the Public role has no permission yet. That is exactly the state Task 4 fixes. A `404` here means the route did not register; recheck the folder naming (singular) and the factory files.

- [ ] **Step 5: Commit**

```bash
git add src/api/article
git commit -m "feat: add Article content type with author and category relations"
```

---

### Task 4: Seed data and public read access

**Files:**
- Create: `src/seed/data.ts`
- Create: `src/seed/index.ts`
- Modify: `src/index.ts`

**Interfaces:**
- Consumes: all three content type UIDs from Tasks 1-3.
- Produces: `seedBlog(strapi)` and `grantPublicReadAccess(strapi)`, both exported from `src/seed/index.ts`, both `async`, both returning `Promise<void>`, both idempotent.

- [ ] **Step 1: Write the seed data constants**

Create `src/seed/data.ts`:

```typescript
export const AUTHORS = [
  {
    name: 'Ada Okafor',
    email: 'ada@example.com',
    bio: 'Backend engineer who writes about databases and the occasional build system.',
  },
  {
    name: 'Milo Hartley',
    email: 'milo@example.com',
    bio: 'Frontend developer with strong opinions about CSS and weak opinions about everything else.',
  },
];

export const CATEGORIES = [
  { name: 'Engineering', description: 'How things are built and why they break.' },
  { name: 'Tutorials', description: 'Step-by-step walkthroughs.' },
  { name: 'Opinion', description: 'Arguments, mostly friendly.' },
];

export const ARTICLES = [
  {
    title: 'Why Your Database Schema Is Your Real API',
    excerpt:
      'Every shortcut you take in the schema becomes a permanent feature of the interface your clients depend on.',
    content:
      '## The schema outlives the code\n\nApplication code gets rewritten every few years. Schemas rarely do, because migrating data is expensive and risky in a way that refactoring a controller never is.\n\nThat asymmetry means the shape you choose on day one is the shape you live with. A nullable column added "just for now" becomes a null check in nineteen places. A denormalized name field becomes the reason you cannot rename a user.\n\n## Design for the read you will do most\n\nStart from the queries you know you will run daily, not from a tidy abstract entity diagram.',
    authorEmail: 'ada@example.com',
    categoryNames: ['Engineering', 'Opinion'],
  },
  {
    title: 'A Practical Guide to Content Modeling in a Headless CMS',
    excerpt:
      'Collection types, relations, and the small decisions that determine whether your API is pleasant to consume.',
    content:
      '## Start with the page, not the entity\n\nThe most common content modeling mistake is designing types that mirror your mental taxonomy rather than the pages someone will actually render.\n\n## Relations are the whole point\n\nIf every type is an island of flat fields, you have built a spreadsheet with extra steps. The value of a CMS shows up when an article knows its author and its author knows its articles.\n\n## Keep reference data simple\n\nCategories and tags do not need a draft workflow. Reference data that disappears from responses because it was never published is a debugging session nobody enjoys.',
    authorEmail: 'ada@example.com',
    categoryNames: ['Tutorials'],
  },
  {
    title: 'CSS Has Quietly Become a Good Language',
    excerpt:
      'Container queries, nesting, cascade layers: the workarounds you memorized are now obsolete.',
    content:
      '## The workarounds are the hard part\n\nMost of what people call "knowing CSS" was really knowing a decade of workarounds for things the language could not express.\n\n## What changed\n\nContainer queries let a component respond to its own space instead of the viewport. Cascade layers make specificity something you declare rather than something you fight. Nesting removes the last strong argument for a preprocessor.\n\n## Unlearning\n\nThe hard part now is noticing when you are reaching for a hack that stopped being necessary.',
    authorEmail: 'milo@example.com',
    categoryNames: ['Engineering'],
  },
  {
    title: 'Build a Blog Frontend Against a REST API in an Afternoon',
    excerpt:
      'Fetching, populating relations, and handling the empty states you will definitely hit first.',
    content:
      '## Populate is not automatic\n\nThe first surprise when consuming most headless APIs is that relations come back missing unless you ask for them. An article without `?populate=*` has no author, and the resulting undefined is where an afternoon goes.\n\n## Handle empty before you handle pretty\n\nBuild the zero-results and loading states first. They are the states your API will spend the most time in while you are still seeding data.\n\n## Cache the list, not the item\n\nList responses change slowly. Individual articles change right when someone is looking at them.',
    authorEmail: 'milo@example.com',
    categoryNames: ['Tutorials', 'Engineering'],
  },
];

export const PUBLIC_READ_ACTIONS = [
  'api::article.article.find',
  'api::article.article.findOne',
  'api::author.author.find',
  'api::author.author.findOne',
  'api::category.category.find',
  'api::category.category.findOne',
];
```

- [ ] **Step 2: Write the seed logic**

Create `src/seed/index.ts`:

```typescript
import type { Core } from '@strapi/strapi';
import { ARTICLES, AUTHORS, CATEGORIES, PUBLIC_READ_ACTIONS } from './data';

/**
 * Creates sample authors, categories, and published articles.
 * Idempotent: returns immediately if any article already exists.
 */
export async function seedBlog(strapi: Core.Strapi): Promise<void> {
  const existing = await strapi.documents('api::article.article').count({});

  if (existing > 0) {
    strapi.log.info(`[seed] ${existing} article(s) already present, skipping seed.`);
    return;
  }

  const authorIdsByEmail = new Map<string, string>();

  for (const author of AUTHORS) {
    const created = await strapi.documents('api::author.author').create({
      data: author,
    });
    authorIdsByEmail.set(author.email, created.documentId);
  }

  const categoryIdsByName = new Map<string, string>();

  for (const category of CATEGORIES) {
    const created = await strapi.documents('api::category.category').create({
      data: category,
    });
    categoryIdsByName.set(category.name, created.documentId);
  }

  for (const article of ARTICLES) {
    const { authorEmail, categoryNames, ...fields } = article;

    await strapi.documents('api::article.article').create({
      data: {
        ...fields,
        author: authorIdsByEmail.get(authorEmail),
        categories: categoryNames.map((name) => categoryIdsByName.get(name)),
      },
      // Without this the entries are drafts and GET /api/articles returns [].
      status: 'published',
    });
  }

  strapi.log.info(
    `[seed] Created ${AUTHORS.length} authors, ${CATEGORIES.length} categories, ${ARTICLES.length} articles.`
  );
}

/**
 * Grants the Public role find/findOne on the blog content types.
 * Idempotent: only creates permission rows that are missing.
 */
export async function grantPublicReadAccess(strapi: Core.Strapi): Promise<void> {
  const publicRole = await strapi.db
    .query('plugin::users-permissions.role')
    .findOne({ where: { type: 'public' } });

  if (!publicRole) {
    strapi.log.warn('[seed] Public role not found, skipping permission grant.');
    return;
  }

  for (const action of PUBLIC_READ_ACTIONS) {
    const existing = await strapi.db
      .query('plugin::users-permissions.permission')
      .findOne({ where: { action, role: publicRole.id } });

    if (existing) {
      continue;
    }

    await strapi.db.query('plugin::users-permissions.permission').create({
      data: { action, role: publicRole.id },
    });

    strapi.log.info(`[seed] Granted public access: ${action}`);
  }
}
```

- [ ] **Step 3: Wire it into bootstrap**

Replace the contents of `src/index.ts` with:

```typescript
import type { Core } from '@strapi/strapi';
import { grantPublicReadAccess, seedBlog } from './seed';

export default {
  /**
   * An asynchronous register function that runs before
   * your application is initialized.
   */
  register(/* { strapi }: { strapi: Core.Strapi } */) {},

  /**
   * An asynchronous bootstrap function that runs before
   * your application gets started.
   */
  async bootstrap({ strapi }: { strapi: Core.Strapi }) {
    await seedBlog(strapi);
    await grantPublicReadAccess(strapi);
  },
};
```

- [ ] **Step 4: Restart and confirm the seed ran**

```bash
pkill -f "strapi develop" || true
nohup npm run develop > /tmp/strapi.log 2>&1 &
```

Wait ~30 seconds, then run: `grep "\[seed\]" /tmp/strapi.log`
Expected: a line reading `Created 2 authors, 3 categories, 4 articles.` and six `Granted public access:` lines.

- [ ] **Step 5: Confirm the public API returns the data**

Run: `curl -s "http://localhost:1337/api/articles" | head -c 400`
Expected: HTTP 200 with a `data` array of 4 entries. If `data` is `[]`, the articles were created as drafts — check that `status: 'published'` is present in the create call.

- [ ] **Step 6: Commit**

```bash
git add src/seed src/index.ts
git commit -m "feat: seed blog data and grant public read access on bootstrap"
```

---

### Task 5: Full verification against the spec

This task writes no application code. It confirms every acceptance criterion in the spec holds, and fixes anything that does not.

**Files:**
- Create: `scripts/verify-blog-api.sh`

**Interfaces:**
- Consumes: the running server from Task 4.
- Produces: a re-runnable verification script.

- [ ] **Step 1: Write the verification script**

Create `scripts/verify-blog-api.sh`:

```bash
#!/usr/bin/env bash
# Verifies the blog content model against the spec's acceptance criteria.
set -u

BASE="http://localhost:1337"
fail=0

check() {
  local label="$1" actual="$2" expected="$3"
  if [ "$actual" = "$expected" ]; then
    printf '  PASS  %-46s %s\n' "$label" "$actual"
  else
    printf '  FAIL  %-46s got %s, want %s\n' "$label" "$actual" "$expected"
    fail=1
  fi
}

count() { curl -s "$BASE/api/$1" | grep -o '"documentId"' | wc -l | tr -d ' '; }

echo "Blog API verification"

check "GET /api/articles status" \
  "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/api/articles")" "200"
check "article count" "$(count articles)" "4"
check "author count" "$(count authors)" "2"
check "category count" "$(count categories)" "3"

populated=$(curl -s "$BASE/api/articles?populate=*")
echo "$populated" | grep -q '"author":{' \
  && check "articles populate author" "yes" "yes" \
  || check "articles populate author" "no" "yes"
echo "$populated" | grep -q '"categories":\[{' \
  && check "articles populate categories" "yes" "yes" \
  || check "articles populate categories" "no" "yes"

check "POST /api/articles is forbidden" \
  "$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE/api/articles" \
     -H 'Content-Type: application/json' -d '{"data":{"title":"nope"}}')" "403"

[ "$fail" -eq 0 ] && echo "All checks passed." || echo "Some checks FAILED."
exit "$fail"
```

- [ ] **Step 2: Make it executable and run it**

Run:

```bash
chmod +x scripts/verify-blog-api.sh && ./scripts/verify-blog-api.sh
```

Expected: every line reads `PASS`, ending with `All checks passed.`

If `POST /api/articles is forbidden` reports `400` instead of `403`, the Public role was granted a write action it should not have — remove it. Any other failure points at the task that produced that endpoint.

- [ ] **Step 3: Confirm the seed is idempotent**

Restart the server once more, then re-run the script:

```bash
pkill -f "strapi develop" || true
nohup npm run develop > /tmp/strapi.log 2>&1 &
sleep 30
./scripts/verify-blog-api.sh
```

Expected: article count is still `4`, not `8`. The log should show `4 article(s) already present, skipping seed.`

- [ ] **Step 4: Commit**

```bash
git add scripts/verify-blog-api.sh
git commit -m "test: add blog API verification script"
```

---

## Self-Review Notes

**Spec coverage:** Author/Category/Article schemas → Tasks 1-3. Draft-and-publish split → set per-schema in each task's `options`. Factory-only controllers/routes/services → Tasks 1-3 Step 2/3. Idempotent seeding with 2/3/4 rows in dependency order → Task 4 Steps 1-2. Explicit publishing → Task 4 Step 2 (`status: 'published'`). Public find/findOne without duplicates → Task 4 Step 2 (`grantPublicReadAccess`). All six spec verification criteria → Task 5 script, plus the admin Content Manager check below.

**Type consistency:** `seedBlog` and `grantPublicReadAccess` are named identically in `src/seed/index.ts` and `src/index.ts`. Relation `mappedBy`/`inversedBy` pairs are matched: Author.articles↔Article.author, Category.articles↔Article.categories. Seed data joins on `authorEmail`/`categoryNames`, which match the `email` and `name` fields defined in the schemas.

**Known deviation from strict TDD:** Tasks 1-2 leave the server unable to boot, since their schemas reference `api::article.article` before Task 3 creates it. This is unavoidable for circular relations in Strapi — there is no ordering in which both sides exist first. The red-green cycle therefore spans Tasks 1-3, with the `403` check at Task 3 Step 4 as the first green.

**Manual check not covered by the script:** spec criterion 6, that all three types appear in the admin Content Manager at http://localhost:1337/admin. Confirm by eye after Task 5.
