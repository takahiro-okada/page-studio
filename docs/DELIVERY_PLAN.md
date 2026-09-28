# Page Studio — Noon Delivery Plan

Target: a pilot-ready, text-focused Page Studio and an editable copy-review document for the Karen / Midlife Miracles website.

## Definition of done for the noon handoff

- Ed can review the current Home, About Karen, and Shop copy in one Google Doc.
- Ed can open Page Studio, move between the three pages, click visible copy, edit it, save a draft, review changes, and create a release ZIP.
- Shared header and footer copy remains consistent across pages.
- Unsafe HTML entered as copy is escaped.
- Stale drafts and changed templates fail safely instead of silently overwriting work.
- Desktop and mobile previews are available.
- Automated tests pass and the documented start-up steps work from a clean install.
- The intended Figma, GitHub, Netlify, Google Docs, and Page Studio responsibilities are documented.
- Production-only capabilities are clearly separated from the pilot so nobody mistakes the local prototype for a secure public application.

## Time-boxed sequence

### 05:00–06:15 — Content handoff

- Extract and group the current website copy.
- Create the Google Doc for Ed.
- Verify the document structure and content.

### 06:15–08:45 — Page Studio finalisation

- Audit the current text-editing flow against the definition of done.
- Fix only pilot-blocking issues.
- Confirm draft saving, conflicts, template mismatch handling, preview, release history, and ZIP export.
- Confirm that the original website files are not modified by ordinary editing.

### 08:45–10:00 — Workflow and design-system specification

- Document the complete Google Docs → Page Studio → GitHub → Netlify workflow.
- Define the Figma file structure, tokens, components, sections, and code mapping.
- Record the boundary between content editing and design/code changes.

### 10:00–11:15 — Verification

- Run automated tests.
- Run build/static checks where available.
- Perform desktop and mobile browser checks.
- Check a save, reload, change review, release creation, and exported page.

### 11:15–12:00 — Handoff buffer

- Repair any issues found during verification.
- Update the README and known limitations.
- Provide the Google Doc link, local launch instructions, test results, and next-phase backlog.

## Not included in the noon pilot

The following require production credentials, security decisions, or user validation and should not be represented as complete at noon:

- Public internet deployment of the editor
- Team authentication and per-site roles
- GitHub App installation and automatic commits or pull requests
- Netlify production deploy approval and completion polling
- Durable hosted storage and backup policy
- Image upload and transformation
- Figma Variables API or Code Connect automation
- Multi-user merge assistance beyond stale-revision conflict detection

These form the production rollout after Ed validates the editing experience.
