# Reusable Web Production Workflow

## Objective

Build small marketing websites quickly while keeping copy, design, implementation, review, and publishing responsibilities clear. Karen / Midlife Miracles is the pilot; the workflow should be reusable without turning Page Studio into an unrestricted page builder.

## Source-of-truth boundaries

| Area | Source of truth | Typical owner |
| --- | --- | --- |
| Copy and basic image choices | Page Studio after pilot acceptance | Ed / content editor |
| Initial copywriting and large rewrites | Google Docs | Ed / content editor |
| Visual direction and reusable design rules | Figma | Takahiro / designer |
| Executable tokens, components, templates, and behaviour | GitHub | Takahiro / developer |
| Review environments and production hosting | Netlify | Takahiro / approver |
| Version history and rollback | GitHub releases/commits | Developer / administrator |

Figma describes design intent; GitHub remains the source of executable behaviour. Page Studio changes content inside approved templates. It does not let editors freely change CSS, layout, scripts, or component structure.

## End-to-end flow

1. **Discovery and structure** — agree on audience, purpose, sitemap, page goals, integrations, and constraints.
2. **Copy preparation** — use Google Docs for the first large rewrite or when Ed prefers long-form editing. Organise copy by page and section, not by screenshot coordinates.
3. **Design** — assemble pages in Figma using shared foundations, components, and section patterns.
4. **Implementation** — implement the approved components and templates in code using matching token and component names.
5. **Content entry** — put approved copy into Page Studio. Ed can later make routine copy changes without touching code.
6. **Review** — create a Netlify Deploy Preview for the proposed change. Claire or another approver checks desktop, mobile, links, claims, accessibility, and content.
7. **Publish** — approval merges the GitHub pull request; Netlify deploys the production branch and reports success or failure.
8. **Operate** — content changes follow Page Studio; design, layout, component, and integration changes return to Figma and code.

## Figma design-system structure

Use one pilot file until reuse across several active files justifies a paid shared library.

### Pages

1. Cover and status
2. Foundations
3. Components
4. Marketing sections
5. Karen website — desktop
6. Karen website — mobile
7. Templates and usage notes

### Foundations

- Primitive colours, followed by semantic colour variables
- Typography roles: display, headings, body, small text, and controls
- Spacing scale
- Container widths and responsive rules
- Border radii, borders, shadows, and image ratios
- Focus styles and minimum contrast expectations

Prefer names that map predictably to code, for example:

| Figma variable | Code token |
| --- | --- |
| `color/action/primary` | `--color-action-primary` |
| `color/text/primary` | `--color-text-primary` |
| `space/4` | `--space-4` |
| `radius/control` | `--radius-control` |

### Components

- Logo and navigation
- Button and text link
- Section heading
- Form field
- Card and product card
- Testimonial
- Accordion / FAQ
- Footer

Use variants for real behaviour such as type, size, state, icon position, and responsive presentation. Avoid creating a different component for every page-specific visual difference.

### Marketing sections

- Header
- Hero
- Problem / outcome
- Benefits
- About
- Testimonials
- Product collection
- FAQ
- Newsletter
- Final CTA
- Footer

Each section should be assembled from design-system components. Page templates are compositions of these sections rather than new one-off components.

## Figma-to-code change control

1. Propose and review the change in Figma.
2. Update the matching token or component in GitHub.
3. Generate or update CSS variables from the token file when token automation is introduced.
4. Create a pull request and Netlify Deploy Preview.
5. Check responsive behaviour, content overflow, focus states, contrast, and browser behaviour.
6. Merge only after approval.

Do not deploy automatically when somebody saves a Figma file. Figma does not execute the website and cannot prove responsive, accessibility, data, form, or browser behaviour. GitHub review and Netlify Preview are the deployment boundary.

## Page Studio scope

### Editors can change

- Visible text
- Page title and search description
- Image alternative text and form labels
- Approved image assets when image support is added
- Safe predefined choices such as section visibility or an approved component variant

### Developers change

- Layout and responsive rules
- Colours, typography, and spacing tokens
- Components and page templates
- Forms, checkout, analytics, integrations, and scripts
- Navigation structure and new page types

## Review and publishing states

Use the following production states:

1. Draft
2. Ready for review
3. Changes requested or approved
4. Deploy Preview passed
5. Published
6. Failed or rolled back

The production application should show the GitHub commit or pull request, Netlify deploy status, who approved the change, and a useful failure message.

## Production rollout after the pilot

### Phase 1 — Pilot validation

- Use the local Page Studio with Karen's three pages.
- Observe Ed completing real copy edits.
- Record confusion, missing fields, and time from request to approved copy.

### Phase 2 — Secure team workflow

- Add invite-only authentication and site-specific roles.
- Replace local `.data` storage with GitHub-backed drafts or another durable store.
- Use explicit stable content IDs instead of DOM-path-derived IDs.
- Create pull requests or controlled commits from approved releases.
- Read Netlify deploy results back into Page Studio.

### Phase 3 — Assets and collaboration

- Add image replacement with file validation and accessible alternative text.
- Add comments, approval history, and clearer conflict resolution.
- Add template migrations and content-ID compatibility checks.

### Phase 4 — Reuse

- Validate the system on a second website.
- Extract genuinely repeated tokens, components, and sections.
- Publish a Figma library only when cross-file reuse justifies the paid plan.
- Document a repeatable site setup and launch checklist.

## Success measures

- Time from copy request to approved preview
- Number of routine edits completed without code changes
- Number of developer handoffs per content change
- Publishing failures and recovery time
- Components and sections reused on the second site
- Editor success rate without Takahiro's assistance
