# OrthoFlow Frontend Guidelines

Use these guidelines when adding or modifying frontend features.

## 1. Product Priorities

- Preserve clinical workflow clarity over visual complexity.
- Keep role-based restrictions explicit in UI.
- Prefer safe, reversible actions for destructive operations (bin -> restore -> permanent delete).

## 2. Role-Aware UX Rules

- If a role can view but not edit a section, show the section and display:
  - `You do not have access to this section.`
- Do not hide critical navigation tabs if requirement says section should be visible but restricted.
- Avoid exposing controls that will always fail by permission.

## 3. Interaction Feedback

- Buttons that trigger network requests must provide immediate feedback:
  - disabled state while running
  - visual progress indicator (spinner or label change)
  - success/error toast for completion
- Apply this especially to:
  - Refresh actions
  - Download actions
  - Save/submit actions

## 4. Dental Chart Rules

- Keep notation format and color conventions consistent.
- Keep custom-chart summary cards tied to selected customized chart entries.
- Keep annotated version list chronological.
- Keep orthodontist-only bin actions gated in UI.

## 5. Documents Rules

- Support up to 10 files per upload batch.
- Enforce 100MB max total per batch.
- Keep upload progress visible.
- Keep trash/restore/permanent delete behavior consistent with backend rules.

## 6. Date/Time Rules

- Use explicit labels for date/time fields.
- Prefer date/time pickers where available.
- Avoid ambiguous placeholders when explicit labels exist.

## 7. API Integration Rules

- Use centralized API service calls.
- Do not hardcode endpoint URLs in components.
- Keep GET requests fresh when used for manual refresh actions.

## 8. Quality Gates

Before finalizing frontend changes:

1. Run `npm run build` in `Frontend`.
2. Verify no obvious runtime errors in browser console.
3. Validate affected role behaviors manually or via existing test scripts.
