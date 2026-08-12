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

// Slugs are set explicitly: uid fields are auto-filled by the admin UI, not
// by the Document Service, so a seeded entry would otherwise have slug: null.
export const CATEGORIES = [
  { name: 'Engineering', slug: 'engineering', description: 'How things are built and why they break.' },
  { name: 'Tutorials', slug: 'tutorials', description: 'Step-by-step walkthroughs.' },
  { name: 'Opinion', slug: 'opinion', description: 'Arguments, mostly friendly.' },
];

export const ARTICLES = [
  {
    title: 'Why Your Database Schema Is Your Real API',
    slug: 'why-your-database-schema-is-your-real-api',
    excerpt:
      'Every shortcut you take in the schema becomes a permanent feature of the interface your clients depend on.',
    content:
      '## The schema outlives the code\n\nApplication code gets rewritten every few years. Schemas rarely do, because migrating data is expensive and risky in a way that refactoring a controller never is.\n\nThat asymmetry means the shape you choose on day one is the shape you live with. A nullable column added "just for now" becomes a null check in nineteen places. A denormalized name field becomes the reason you cannot rename a user.\n\n## Design for the read you will do most\n\nStart from the queries you know you will run daily, not from a tidy abstract entity diagram.',
    authorEmail: 'ada@example.com',
    categoryNames: ['Engineering', 'Opinion'],
  },
  {
    title: 'A Practical Guide to Content Modeling in a Headless CMS',
    slug: 'practical-guide-to-content-modeling',
    excerpt:
      'Collection types, relations, and the small decisions that determine whether your API is pleasant to consume.',
    content:
      '## Start with the page, not the entity\n\nThe most common content modeling mistake is designing types that mirror your mental taxonomy rather than the pages someone will actually render.\n\n## Relations are the whole point\n\nIf every type is an island of flat fields, you have built a spreadsheet with extra steps. The value of a CMS shows up when an article knows its author and its author knows its articles.\n\n## Keep reference data simple\n\nCategories and tags do not need a draft workflow. Reference data that disappears from responses because it was never published is a debugging session nobody enjoys.',
    authorEmail: 'ada@example.com',
    categoryNames: ['Tutorials'],
  },
  {
    title: 'CSS Has Quietly Become a Good Language',
    slug: 'css-has-quietly-become-a-good-language',
    excerpt:
      'Container queries, nesting, cascade layers: the workarounds you memorized are now obsolete.',
    content:
      '## The workarounds are the hard part\n\nMost of what people call "knowing CSS" was really knowing a decade of workarounds for things the language could not express.\n\n## What changed\n\nContainer queries let a component respond to its own space instead of the viewport. Cascade layers make specificity something you declare rather than something you fight. Nesting removes the last strong argument for a preprocessor.\n\n## Unlearning\n\nThe hard part now is noticing when you are reaching for a hack that stopped being necessary.',
    authorEmail: 'milo@example.com',
    categoryNames: ['Engineering'],
  },
  {
    title: 'Build a Blog Frontend Against a REST API in an Afternoon',
    slug: 'build-a-blog-frontend-in-an-afternoon',
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
