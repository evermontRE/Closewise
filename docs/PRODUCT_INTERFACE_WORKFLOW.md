# Finance Studio interface workflow

The production interface should consume stable server APIs and domain results; it should not duplicate bookkeeping or tax-planning formulas in React components. This keeps the visual design replaceable without putting financial correctness at risk.

## Visual direction

- Finance Studio palette only: Soft Mist background, white surfaces, charcoal text, evergreen actions, and `#8fd3b4` eyebrows and accents. Do not use ivory.
- Plus Jakarta Sans for display type and Inter for body copy and controls.
- Crown badges identify locked premium features consistently.
- Motion should clarify state changes in 150–240 ms, respect reduced-motion preferences, and never cause layout shifts.
- Use plain American English and progressive disclosure so dashboards emphasize decisions instead of explanatory paragraphs.

## Approval sequence

1. Establish tokens and the responsive application shell.
2. Approve the command dashboard and its four-step guided workflow.
3. Approve bank review, transactions, commissions, and receipts.
4. Approve mileage, recurring expenses, tax planning, and reserve workflows.
5. Approve settings, audit history, exports, billing, and locked states.
6. Complete accessibility, responsive, performance, and browser QA.

Review each screen at 1440 px desktop, 1024/768 px tablet, and 430/390 px mobile widths. Every review should include populated, empty, loading, error, read-only, locked, offline, and version-conflict states where applicable.

## Working method

Keep interface work on a dedicated design branch after the required backend branch is merged or use the latest stacked backend branch as its base. Provide a Figma frame, marked screenshot, or short screen recording for each requested change. Record acceptance criteria for spacing, hierarchy, copy, interactions, and responsive behavior before implementation. Approve one workflow at a time; reusable components and tokens should be corrected at their source rather than patched independently on each page.

The customer-facing dashboard should lead with Safe to Spend, the next recommended financial action, and a concise outlook. Detailed calculation explanations belong in drawers, tooltips, guided-tour steps, and the Legal & Use Notice—not in the primary scan path.
