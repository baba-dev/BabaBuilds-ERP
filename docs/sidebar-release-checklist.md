# Sidebar Release Checklist

Use this checklist before shipping sidebar updates.

## 1) Role visibility verification
- [ ] Validate OWNER sees all role-restricted items.
- [ ] Validate ADMIN sees admin/member/viewer items and restricted admin-only routes.
- [ ] Validate MEMBER cannot see OWNER/ADMIN-only entries.
- [ ] Validate VIEWER sees read-only permitted entries only.

## 2) Pin max-3 behavior
- [ ] Verify only the first 3 unique pinned entries persist.
- [ ] Verify duplicate pin attempts do not create extra slots.
- [ ] Verify unpin/re-pin keeps stable ordering rules.

## 3) Settings bottom pin rule
- [ ] Verify items flagged for bottom pinning always render after top-pinned items.
- [ ] Verify bottom-pinned settings entries are not promoted into top slots.
- [ ] Verify bottom-pinned entries still appear when top pin bucket is full.

## 4) No-result Ask AI flow
- [ ] Search with a non-empty query that returns no matches and verify Ask AI CTA appears.
- [ ] Search with empty/whitespace query and verify Ask AI CTA does not appear.
- [ ] Search with matching results and verify Ask AI CTA does not appear.

## 5) Accessibility keyboard traversal
- [ ] Tab traversal reaches sidebar trigger, links, and user menu in logical order.
- [ ] Enter/Space activates focused sidebar items.
- [ ] Focus ring remains visible in both collapsed and expanded states.
- [ ] Mobile drawer supports keyboard close (Esc) and restores focus to trigger.

## 6) Analytics event fire validation
- [ ] Verify `sidebar_item_clicked` (or equivalent) fires with item id/path.
- [ ] Verify `sidebar_pin_toggled` fires with pin/unpin action.
- [ ] Verify search no-result + Ask AI interaction event fires.
- [ ] Verify events include role/device context and contain no PII.
