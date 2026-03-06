# OrthoFlow Frontend Guidelines

Use these guidelines when adding or modifying frontend behavior in the current system.

## 1. Product Priorities

- preserve clinical workflow clarity over visual novelty
- keep role restrictions explicit in the UI
- prefer reversible destructive flows where the backend supports them

## 2. Role-Aware UX Rules

- if a role must see a section but not edit it, show the section and show a clear restriction message
- do not expose actions that are guaranteed to fail by permission
- keep route visibility aligned with the current router and sidebar rules

## 3. Interaction Feedback

- network-triggering buttons must show immediate feedback
- use disabled states during in-flight operations
- provide visible progress or label changes for longer actions
- provide success or error feedback after completion

Apply this especially to:

- refresh actions
- upload and download actions
- save and submit actions
- delete, restore, and reset-password actions

## 4. API Integration Rules

- use centralized API service calls
- do not hardcode endpoint URLs in components
- keep GET requests fresh for explicit refresh actions
- remember the current frontend base API URL is configured centrally in `Frontend/src/app/config/api.ts`

## 5. Dental Chart Rules

- keep notation formats and color semantics consistent
- keep version actions aligned with backend permissions
- keep version ordering chronological
- keep custom-chart summary behavior tied to saved chart state

## 6. Documents Rules

- preserve visible upload progress
- keep trash and restore behavior aligned with backend rules
- keep batch-size and file-size messaging aligned with backend limits

## 7. Date and Time Rules

- use explicit field labels
- prefer consistent date-time formats in forms and filters
- avoid ambiguous placeholders when labels already define the field

## 8. Quality Gates

Before finalizing frontend changes:

1. Run `npm run build` in `Frontend`.
2. Check the affected flows in the browser.
3. Validate affected role behaviors manually or with existing tests.
4. Confirm the UI still matches current route and permission expectations.
