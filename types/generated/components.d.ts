import type { Schema, Struct } from '@strapi/strapi';

export interface BlocksCallout extends Struct.ComponentSchema {
  collectionName: 'components_blocks_callouts';
  info: {
    displayName: 'Callout';
    icon: 'information';
  };
  attributes: {
    text: Schema.Attribute.Text & Schema.Attribute.Required;
    tone: Schema.Attribute.Enumeration<['note', 'warning', 'aside']> &
      Schema.Attribute.DefaultTo<'note'>;
  };
}

export interface BlocksCode extends Struct.ComponentSchema {
  collectionName: 'components_blocks_codes';
  info: {
    displayName: 'Code';
    icon: 'code';
  };
  attributes: {
    code: Schema.Attribute.Text & Schema.Attribute.Required;
    language: Schema.Attribute.Enumeration<
      ['ts', 'js', 'bash', 'json', 'css']
    > &
      Schema.Attribute.DefaultTo<'ts'>;
    showLineNumbers: Schema.Attribute.Boolean &
      Schema.Attribute.DefaultTo<false>;
  };
}

export interface BlocksImage extends Struct.ComponentSchema {
  collectionName: 'components_blocks_images';
  info: {
    displayName: 'Image';
    icon: 'picture';
  };
  attributes: {
    caption: Schema.Attribute.String;
    credit: Schema.Attribute.String;
    image: Schema.Attribute.Media<'images'> & Schema.Attribute.Required;
  };
}

export interface BlocksPullQuote extends Struct.ComponentSchema {
  collectionName: 'components_blocks_pull_quotes';
  info: {
    displayName: 'Pull quote';
    icon: 'quote';
  };
  attributes: {
    attribution: Schema.Attribute.String;
    quote: Schema.Attribute.Text &
      Schema.Attribute.Required &
      Schema.Attribute.SetMinMaxLength<{
        maxLength: 300;
      }>;
  };
}

export interface BlocksRichText extends Struct.ComponentSchema {
  collectionName: 'components_blocks_rich_texts';
  info: {
    displayName: 'Rich text';
    icon: 'align-left';
  };
  attributes: {
    body: Schema.Attribute.RichText & Schema.Attribute.Required;
  };
}

export interface SharedNavLink extends Struct.ComponentSchema {
  collectionName: 'components_shared_nav_links';
  info: {
    displayName: 'Nav link';
    icon: 'link';
  };
  attributes: {
    href: Schema.Attribute.String & Schema.Attribute.Required;
    label: Schema.Attribute.String & Schema.Attribute.Required;
  };
}

export interface SharedSeo extends Struct.ComponentSchema {
  collectionName: 'components_shared_seos';
  info: {
    displayName: 'Seo';
    icon: 'search';
  };
  attributes: {
    canonicalUrl: Schema.Attribute.String;
    metaDescription: Schema.Attribute.Text &
      Schema.Attribute.SetMinMaxLength<{
        maxLength: 160;
      }>;
    metaTitle: Schema.Attribute.String &
      Schema.Attribute.SetMinMaxLength<{
        maxLength: 60;
      }>;
  };
}

declare module '@strapi/strapi' {
  export namespace Public {
    export interface ComponentSchemas {
      'blocks.callout': BlocksCallout;
      'blocks.code': BlocksCode;
      'blocks.image': BlocksImage;
      'blocks.pull-quote': BlocksPullQuote;
      'blocks.rich-text': BlocksRichText;
      'shared.nav-link': SharedNavLink;
      'shared.seo': SharedSeo;
    }
  }
}
