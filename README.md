# Page Studio — local prototype

Page Studio is a visual content editor built around the Home, About Karen, and Shop pages of Karen's Midlife Miracles website.
It leaves the source HTML untouched while allowing editors to click and update copy directly in the browser.

In this repository, "pilot complete" means that editing, saving, reviewing changes, responsive previewing, and generating a release ZIP have been verified locally. It does not mean that team authentication or production deployment through Netlify is complete.

- Pilot acceptance criteria and verification order: [`docs/DELIVERY_PLAN.md`](docs/DELIVERY_PLAN.md)
- Production workflow covering Figma, Google Docs, GitHub, and Netlify: [`docs/WEB_PRODUCTION_WORKFLOW.md`](docs/WEB_PRODUCTION_WORKFLOW.md)

## Run locally

Use Node.js 22 or later and run the following commands from this directory:

```sh
npm install
npm start
```

Open `http://127.0.0.1:4317` in your browser.

## How to use it

1. Select a page from the left sidebar.
2. Click copy on the website preview and edit it in place. You can also use the input field in the right sidebar.
3. Drafts save automatically. You can also use **Save draft** or Cmd/Ctrl+S.
4. Open **Changes** to compare edited copy with the original. Use the arrows in the header to undo or redo changes.
5. Open **Preview** to hide editing outlines and check the mobile layout.
6. Select **Prepare release** to create a release ZIP. The ZIP includes three pages, CSS, images, and the source site's JavaScript. Previous exports remain available in the history panel.

On narrow screens, select **Content list** to open the editing panel.
Editors can update body copy, buttons, shared navigation and footer content, page titles, search descriptions, and image alternative text.
Image replacement, layout editing, and text embedded inside images are not yet supported.

## Storage and sharing

- Drafts, ZIP files, and export history are stored in `page-studio/.data/`, which is excluded from Git.
- Saved drafts survive page reloads and server restarts.
- Saving an older version from another tab shows a conflict instead of silently overwriting newer work.
- Saving pauses when the source HTML changes, because the draft must be reconciled with the new template.
- Matching copy in the header and footer is treated as one shared field. Separating identical text with different meanings will require explicit shared content keys.
- Edited strings are HTML-escaped on the server, so submitted markup is not executed.

## Current scope

**This is a local-only prototype. Team authentication and automated Netlify publishing are not connected.**
The server binds only to the loopback address. Do not expose it directly to the internet.
Creating a release ZIP is not a production deployment.

Exports are limited to the three pages currently available locally. The prototype does not add unimplemented products, checkout behaviour, or separate FAQ and Contact pages.
Do not overwrite an existing site with the ZIP: pages outside this prototype would be removed. Use a separate Netlify test project for review.
Images come from the local source files and are not automatically synchronised with the latest live site.
The preview does not execute the original website scripts. It uses the editing bridge, and forms are not submitted.

## Reusing Page Studio for another site

Register additional sites in `sites.mjs`. Each entry defines the local HTML root, original URL prefix, and supported pages.
Drafts and export history are isolated by site ID, and the shared interface includes a site selector.
The initial adapter targets static HTML and generates editing IDs from text-node positions.
For React, Vue, or projects with frequently changing templates, introduce stable explicit content IDs and a dedicated content layer.
Sites that store assets outside `images/`, `css/`, and `js/` will require additional asset-root and export rules.

## Required for a production version

- Team login and per-site view, edit, and publish permissions
- Server-side storage and backups
- Stable content IDs and migrations when templates change
- Separate draft, approval, and publishing responsibilities
- Git integration or Netlify API publishing with completion and failure reporting
- Image replacement and guidance for concurrent editing conflicts

## Verification

```sh
npm test
```

The tests cover HTML structure preservation, input escaping, shared-copy propagation, draft storage and conflict handling, ZIP contents, and immutable release snapshots.
The server integration test requires permission to open a local port.
