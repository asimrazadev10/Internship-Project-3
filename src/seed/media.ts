import fs from 'node:fs';
import path from 'node:path';
import type { Core } from '@strapi/strapi';
import { ARTICLE_COVERS, AUTHOR_AVATARS, MEDIA } from './data';

// Compiled to dist/src/seed/media.js (tsconfig rootDir is "."), so the
// project root is three levels up from __dirname, not two.
const MEDIA_DIR = path.resolve(__dirname, '../../../assets/media');

interface UploadedFile {
  id: number;
  name: string;
  url: string;
}

/**
 * Uploads a file once and returns its record, reusing an existing upload when
 * one with the same name is already in the Media Library.
 *
 * The upload service expects `originalFilename` (not `originalFileName`), and
 * creates and cleans up its own temp working directory.
 */
async function uploadOnce(strapi: Core.Strapi, file: string, alt: string): Promise<UploadedFile | null> {
  const existing = await strapi.db
    .query('plugin::upload.file')
    .findOne({ where: { name: file } });

  if (existing) {
    return existing as UploadedFile;
  }

  const filepath = path.join(MEDIA_DIR, file);

  if (!fs.existsSync(filepath)) {
    strapi.log.warn(`[seed] media file missing, skipping: ${filepath}`);
    return null;
  }

  const [uploaded] = await strapi.plugin('upload').service('upload').upload({
    data: { fileInfo: { name: file, alternativeText: alt } },
    files: {
      filepath,
      originalFilename: file,
      mimetype: 'image/jpeg',
      size: fs.statSync(filepath).size,
    },
  });

  strapi.log.info(`[seed] uploaded ${file}`);
  return uploaded as UploadedFile;
}

/**
 * Uploads the demo photographs and links them to articles and authors.
 *
 * Idempotent throughout: files are uploaded once by name, and a cover or avatar
 * is only set where the field is currently null, so an editor's chosen image is
 * never replaced. Running bootstrap twice uploads nothing and changes nothing.
 */
export async function seedMedia(strapi: Core.Strapi): Promise<void> {
  const files = new Map<string, UploadedFile>();

  for (const { file, alt } of MEDIA) {
    const uploaded = await uploadOnce(strapi, file, alt);
    if (uploaded) {
      files.set(file, uploaded);
    }
  }

  const articles = await strapi.documents('api::article.article').findMany({
    populate: { cover: true },
    status: 'published',
  });

  for (const article of articles) {
    const wanted = article.slug ? ARTICLE_COVERS[article.slug] : undefined;
    const file = wanted ? files.get(wanted) : undefined;

    if (!file || article.cover) {
      continue;
    }

    // Same hazard as enrichExistingArticles: publish() promotes the whole
    // draft, so an article with unpublished work-in-progress is left alone
    // rather than having that work published on the editor's behalf.
    const draft = await strapi.documents('api::article.article').findOne({
      documentId: article.documentId,
      status: 'draft',
    });

    if (draft && new Date(draft.updatedAt as string) > new Date(article.updatedAt as string)) {
      strapi.log.info(`[seed] skipped cover for '${article.slug}': it has unpublished draft changes`);
      continue;
    }

    await strapi.documents('api::article.article').update({
      documentId: article.documentId,
      data: { cover: file.id },
    });
    await strapi.documents('api::article.article').publish({
      documentId: article.documentId,
    });

    strapi.log.info(`[seed] set cover for '${article.slug}'`);
  }

  const authors = await strapi.documents('api::author.author').findMany({
    populate: { avatar: true },
  });

  // Avatar files, in MEDIA's declared order, used for the position-based
  // fallback below.
  const avatarFiles = MEDIA.filter((entry) => entry.file.startsWith('avatar-')).map((entry) => entry.file);

  for (const [index, author] of authors.entries()) {
    if (author.avatar) {
      continue;
    }

    const mapped = author.email ? AUTHOR_AVATARS[author.email] : undefined;
    let file = mapped ? files.get(mapped) : undefined;

    // AUTHOR_AVATARS is keyed by the seed emails, which is all a fresh
    // database ever has. A database whose authors were renamed (as this
    // developer's local one was) won't match those keys — fall back to the
    // Nth avatar file by the author's position in this list, so a renamed
    // author still gets an avatar instead of being silently skipped.
    if (!file) {
      const fallbackFile = avatarFiles[index];
      file = fallbackFile ? files.get(fallbackFile) : undefined;

      if (file) {
        strapi.log.info(
          `[seed] no avatar mapping for '${author.email}', falling back to '${fallbackFile}' by position`
        );
      }
    }

    if (!file) {
      strapi.log.warn(`[seed] no avatar available for '${author.email}'`);
      continue;
    }

    // Authors have draft-and-publish off, so a plain update is the whole story.
    await strapi.documents('api::author.author').update({
      documentId: author.documentId,
      data: { avatar: file.id },
    });

    strapi.log.info(`[seed] set avatar for '${author.email}'`);
  }
}
