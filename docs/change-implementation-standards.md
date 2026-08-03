# Change implementation standards

Standards for implementing bug fixes and features in OneView.  
Applies to humans and AI agents. Prefer the **smallest** change that satisfies the request.

---

## Implement only what was asked

Implement **only** the changes explicitly listed in the request.

Preserve all existing functionality unless the request says otherwise.

Do **not** modify any of the following unless they are explicitly mentioned:

- Business logic
- UI behavior
- APIs
- Database structure
- Permissions
- Workflows
- Integrations

---

## Before making any code changes

1. Analyze the existing implementation.
2. Identify the root cause of each issue.
3. Reuse the existing architecture and coding patterns.
4. Avoid introducing duplicate logic.
5. Keep backward compatibility.
6. Ensure all existing functionality continues to work.

---

## General rules

Implement only the changes listed in the request.

Do **not**:

- Refactor unrelated code
- Rename existing APIs
- Modify unrelated UI
- Change existing database structures unless required
- Remove existing functionality
- Introduce breaking changes

All fixes must follow the existing application architecture.

Also do **not** (scope restriction):

- Improve unrelated modules
- Update dependencies or upgrade libraries unless required by the request
- Refactor unrelated files
- Modify unrelated database objects
- Change application architecture

---

## Generation workflow

For every requested item, follow this workflow.

### Phase 1 – Investigation

- Analyze the current implementation.
- Identify the root cause.
- Identify affected modules.
- Identify dependencies.

### Phase 2 – Design

- Implement the smallest possible change.
- Do not redesign an existing module unless necessary.
- Reuse existing services, components, repositories, APIs, and UI controls.

### Phase 3 – Implementation

Implement the requested feature or bug fix.

Ensure:

- Clean code
- No duplicate logic
- Proper validation
- Exception handling
- Logging (where applicable)

### Phase 4 – Verification

Verify:

- Existing functionality still works
- Requested functionality works
- No compile errors
- No runtime errors
- No console errors
- No broken navigation

### Phase 5 – QA

Test:

- Positive scenarios
- Negative scenarios
- Boundary cases
- Empty data
- Invalid input
- Refresh behavior
- Navigation behavior

---

## Output information (per completed item)

For every completed item, provide:

| Section | Content |
|---------|---------|
| **Root cause** | Why the issue occurred |
| **Files modified** | Paths touched |
| **Components modified** | UI / Nest modules changed |
| **APIs modified** | Endpoints changed (if any) |
| **Database changes** | Schema / migration / seed (if any) |
| **UI changes** | What the user sees differently |
| **Validation added** | New or tightened checks |
| **Testing performed** | What was verified |
| **Result** | Clear outcome — not merely “Fixed” |

Explain **what** was changed and **why**.

---

## UI requirements

Every new or modified screen must:

- Follow the existing application theme (`docs/theme.md`, brand tokens).
- Maintain consistent spacing and alignment.
- Be responsive; no overlapping controls; no truncated text.
- No vertical text unless explicitly required.
- Proper loading, empty, error, and success states.
- Keyboard navigation and correct tab order.
- First input field receives focus automatically where appropriate.
- Clickable controls / hyperlinks show the hand pointer on hover.
- Buttons show loading/progress for long-running operations.
- Prevent duplicate submissions from repeated clicks.
- **Delete requires confirmation:** Never delete (soft or hard) on a single click. Always require an explicit user confirmation dialog/step before executing delete.

---

## QA requirements

Verify:

- No TypeScript / compilation errors
- No runtime errors
- No lint errors introduced by the change
- No new console warnings from the change
- No memory leaks, UI flickering, or broken navigation / validations

---

## Acceptance criteria

Work is complete only if:

1. Every requested issue is resolved.
2. Existing functionality remains unchanged (except as requested).
3. UI is consistent with the product.
4. No regressions are introduced.
5. No compile / runtime errors exist.
6. All requested workflows are tested.
7. All validations work correctly.

---

## Related project docs

- Agent overview: `AGENTS.md`
- Product skill: `.cursor/skills/oneview-dev/SKILL.md`
- Theme: `docs/theme.md`
- Prompt log: `docs/prompt-log.md`
