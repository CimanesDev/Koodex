# Saved implementation notes

Request source: `to-add.md` (preserved unchanged).

- Drag the pill surface with or without its grip. Five pixels distinguish a drag from a quota-switch click. Refresh stays a button. Free placement snaps near side edges and the top center; pinned placement slides along its edge.
- Narrower one-limit text pills and balanced bar padding; centered one-limit ring content avoids the large trailing gap at low percentages.
- Optional Placement > Collapsible side tab for left/right pins. Starts collapsed; a tab click animates open/closed in 180 ms. The native collapsed window is only 36 pixels wide (compatible with Windows minimum sizing), so it does not intercept clicks over an invisible expanded panel.
- Alerts at 25%, 10%, and 0%, persisted per provider/quota. Reset timestamp drift cannot repeat an exhaustion alert; a passed reset plus recovered usage rearms notifications.
- Multiple Task Manager processes explained in README. Existing single-instance protection remains in place.
- Added `npm run dist:signed` and `docs/code-signing.md`. Actual signing awaits the owner's trusted certificate or verified signing-service identity; no credentials were created or purchased.

Checks: `npm test`, `npm run build`, `npm run test:placement`, `npm run test:interactions`. These notes preserve the requirements and implementation decisions rather than claiming to export the conversation transcript.
