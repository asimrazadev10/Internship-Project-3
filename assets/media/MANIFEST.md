# Demo media

Photographs from [Lorem Picsum](https://picsum.photos), which serves Unsplash
images under the [Unsplash licence](https://unsplash.com/license) — free to use
for any purpose, no permission or attribution required.

Addressed by fixed ID so every clone gets identical files. Re-run
`./scripts/fetch-media.sh` to reproduce them.

These files are committed deliberately: bootstrap seeds from disk, so it works
offline and a fresh clone produces byte-identical content. Files uploaded by
Strapi land in `public/uploads/`, which is gitignored — those are generated,
these are source.

| File | Source | Used for |
|---|---|---|
| `cover-schema.jpg` | https://picsum.photos/id/1015/1600/900 | Cover: "Why Your Database Schema Is Your Real API" |
| `cover-modeling.jpg` | https://picsum.photos/id/180/1600/900 | Cover: "A Practical Guide to Content Modeling" |
| `cover-css.jpg` | https://picsum.photos/id/1073/1600/900 | Cover: "CSS Has Quietly Become a Good Language" |
| `figure-components.jpg` | https://picsum.photos/id/1050/1600/900 | In-body figure in the content-modeling article |
| `avatar-1.jpg` | https://picsum.photos/id/1005/600/600 | Author avatar |
| `avatar-2.jpg` | https://picsum.photos/id/1012/600/600 | Author avatar |

"Build a Blog Frontend Against a REST API in an Afternoon" has no cover on
purpose, so the coverless layout path is exercised by the seed.
