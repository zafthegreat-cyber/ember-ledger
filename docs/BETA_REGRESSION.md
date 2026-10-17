# Beta regression execution

The browser regression runner supports the complete suite, exact named scenarios, repeated named scenarios, and an inclusive named range. All forms retain the same per-step timeout, heartbeat, assertion, route, dialog, request, and active-handle diagnostics.

The application preview must already be available at `APP_URL` (the default is `http://127.0.0.1:5200/`).

```powershell
# All 28 scenarios
npm run test:beta-regression

# One scenario (the data-reset prerequisite also runs)
npm run test:beta-regression -- --scenario="Business: add/edit/delete resale inventory item"

# A list: repeat --scenario so punctuation inside names stays unambiguous
npm run test:beta-regression -- --scenario="Find opens" --scenario="Collection opens"

# An inclusive range in source order
npm run test:beta-regression -- --scenario-from="Scout: add/edit/delete tracked item" --scenario-to="Business: add/edit/delete resale inventory item"
```

For automation, use `BETA_REGRESSION_SCENARIOS` with exact names separated by `||`, or the `BETA_REGRESSION_SCENARIO_FROM` and `BETA_REGRESSION_SCENARIO_TO` range variables. Unknown names fail with a nonzero status. A selected scenario is never partially executed. Every successful run prints total duration, the five slowest executed steps, and remaining non-stdio handles after browser/listener cleanup.
