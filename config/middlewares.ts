import type { Core } from '@strapi/strapi';

const config: Core.Config.Middlewares = [
  'strapi::logger',
  'strapi::errors',
  'strapi::security',
  'strapi::cors',
  'strapi::poweredBy',
  'strapi::query',
  {
    // Stripe signs the EXACT bytes it sent. Koa's body parser hands us a parsed
    // object, and re-serialising it (JSON.stringify) will not reproduce those
    // bytes — key order, whitespace and number formatting all differ — so
    // signature verification would fail for every event.
    //
    // `includeUnparsed` keeps the original string alongside the parsed body,
    // reachable through the `unparsed` symbol from @strapi/utils. The webhook
    // controller reads that and never touches ctx.request.body.
    name: 'strapi::body',
    config: {
      includeUnparsed: true,
    },
  },
  'strapi::session',
  'strapi::favicon',
  'strapi::public',
];

export default config;
