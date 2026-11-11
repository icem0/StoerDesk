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

The runs of `v1.1.2` … `v1.1.5` (pushes on 2026-11-11) failed inside that step with:

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
   writes `Acquire::Retries "15"`, `Acquire::http::Timeout`, `Acquire::ftp::Timeout` and
   `DPkg::Lock::Timeout` into `/etc/apt/apt.conf.d` before it calls Playwright, so apt
   recovers a single download whose mirror lookup hiccuped.
2. **The whole install runs in a bounded backoff loop** (four attempts, 30/60/90 s apart)
   so a mirror that is unreachable for one download attempt still gets three more.
3. **The gate stays strict.** After the last attempt the step exits `1`, the `check` job
   fails, `Dispatch publish run` never starts and the version stays unpublished. A browser
   that cannot be installed is an error in CI, as `PLAN.md` §18.2 already requires — the
   retry only absorbs an infrastructure outage, it never turns a missing prerequisite
   into a green run.
4. **A version whose run failed for a reason outside the repository is re-run, not
   patched around.** The retry makes that rerun usually unnecessary; a manual rerun of the
   failed run (or of the tag push) stays the remedy for an outage that outran the loop.

## Alternatives

- **Skip the browser install when apt fails.** Rejected: `PLAN.md` §18 — a gate that
  skipped because a prerequisite is missing verifies nothing and must never be presented
  as green; the E2E smoke test is an exit criterion, not an optional extra.
- **Install Chromium without `--with-deps` (CDN download only).** Rejected: the apt
  dependencies (fonts, codecs) are what makes the screenshots and the rendered texts of
  the E2E reproducible, and it would still depend on the CDN being reachable.
- **Pin a single apt mirror instead of the runner's `apt-mirrors.txt`.** Rejected: the
  outage moved across mirrors and hosts; a pinned mirror is not more reliable and pins the
  repository to one third party.
- **Cache the browser with `actions/cache`.** Rejected: it hides the outage only for the
  versions whose key survives the cache TTL and turns the browser into an artifact whose
  version nobody can name in the run summary.
- **`continue-on-error: true` on the install step.** Rejected: it makes a missing browser
  a green gate, which is exactly what §18 forbids.

## Consequences

- A mirror hiccup costs a few minutes of the run, not a red version and an unpublished
  release.
- A real, sustained outage still fails the run — the failure message names the attempt
  count, so the log distinguishes an outage from a broken install.
- The apt configuration is written per run on the runner; it changes nothing on a host or
  in an image, only the package install of the `check` job.
- Follow-up: none. Older versions whose check run failed during this outage (`v1.1.2` …)
  are republished by re-running their run or their tag push, not by changing the workflow.
