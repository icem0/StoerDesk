# ADR-0018: A package-mirror failure in CI is retried, never silenced

- Status: accepted
- Date: 2026-11-11
- Stakeholders: CI, every work package with an E2E gate

## Context

The `check` job of `.github/workflows/check.yml` installs the browser of the Playwright
smoke test with `npx playwright install --with-deps chromium`. `--with-deps` is the apt
step of Playwright: it downloads the browser dependencies from the Ubuntu package mirrors
of the runner. Those mirrors are reached over the network of GitHub and their DNS is not
part of this repository.

The runs of `v1.1.2` … `v1.1.7` (pushes on 2026-11-11) failed inside that step with:

- `Temporary failure resolving 'azure.archive.ubuntu.com'`
- `W: Failed to fetch mirror+file:/etc/apt/apt-mirrors.txt/...`
- `E: Failed to fetch ... Unable to fetch some archives ...` (apt exit code `100`)
- `Failed to install browsers`, `Process completed with exit code 1.`

Nothing in the app code or in the tests was wrong — the runner could not resolve its
package mirror. Because the gates hang on the version tag, such a run also blocks the
publish chain: that version gets neither a green check run nor images, and every later
release has to wait for the operator to notice.

The rules of `PLAN.md` §18 forbid the two obvious shortcuts: a gate that skipped because
a prerequisite is missing is reported as unverified, never as green, and no lint rule or
test may be weakened to make a gate pass.

## Decision

1. **Transient network failures of the package install are retried in place.** The step
   writes `Acquire::Retries "4"`, `Acquire::http::Timeout`, `Acquire::ftp::Timeout` and
   `DPkg::Lock::Timeout` into `/etc/apt/apt.conf.d` before it calls Playwright, so apt
   recovers a single download whose mirror lookup hiccuped, and `timeout 300` keeps one
   apt attempt from hanging over the whole run.
2. **The install runs in a bounded retry loop** (two attempts, 30 s apart).
3. **A mirror that stays unreachable gets one last resort: the browser alone from the
   Playwright CDN** (`npx playwright install chromium`, without the apt dependency
   packages). That step writes a `## Chromium without browser dependencies` block into the
   run summary, so the log names the reduced prerequisite instead of hiding it. The
   dependency packages are fonts and codecs; the E2E specs assert the DOM, never pixels, so
   they still drive the real application.
4. **The gate stays strict.** If neither apt nor the CDN provides a browser, the step exits
   `1`, the `check` job fails, `Dispatch publish run` never starts and the version stays
   unpublished. A browser that cannot start is an error in CI, as `PLAN.md` §18.2 already
   requires — `scripts/e2e-check.mjs` probes exactly the browser the tests launch before it
   prepares any database. The retry and the fallback only absorb an infrastructure outage,
   they never turn a missing prerequisite into a green run.
5. **A version whose run failed for a reason outside the repository is re-run, not patched
   around.** The retry and the fallback make that rerun usually unnecessary; a manual rerun
   of the failed run (or of the tag push) stays the remedy for an outage that outran both.

## Alternatives

- **Skip the browser install when apt fails.** Rejected: `PLAN.md` §18 — a gate that
  skipped because a prerequisite is missing verifies nothing and must never be presented
  as green; the E2E smoke test is an exit criterion, not an optional extra.
- **Install Chromium from the CDN only, as the normal path.** Rejected as the normal path:
   the apt dependency packages (fonts, codecs) would then never be proven in CI, and every
   run would hide that. The CDN download is only the last resort of item 3, and it states
   itself in the run summary.
- **Pin a single apt mirror instead of the runner's `apt-mirrors.txt`.** Rejected: the
   outage moved across mirrors and hosts; a pinned mirror is not more reliable and pins the
   repository to one third party.
- **Cache the browser with `actions/cache`.** Rejected: it hides the outage only for the
   versions whose key survives the cache TTL and turns the browser into an artifact whose
   version nobody can name in the run summary.
- **`continue-on-error: true` on the install step.** Rejected: it makes a missing browser
   a green gate, which is exactly what §18 forbids.

## Consequences

- A mirror hiccup costs one further attempt, a fully unreachable mirror still runs the E2E
  gate against the CDN browser — either way the version gets its check run and its images.
- A degraded run is visible: the summary block names the reason, so the log states which
  prerequisite the run really proved.
- A browser that neither apt nor the CDN can provide still fails the run; the failure
  message names the attempt count, so an outage and a broken install stay distinguishable.
- The apt configuration is written per run on the runner; it changes nothing on a host and
  nothing in an image, only the package install of the `check` job.
- Follow-up: none. Older versions whose check run failed during this outage (`v1.1.2` …
  `v1.1.7`) are republished by re-running their run or their tag push, not by changing the
  workflow.
