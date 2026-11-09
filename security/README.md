# Dependency Security

Assessment date: 2026-11-08. Scope: the npm dependency tree of the new Expo app, with focused GitHub-advisory scans of the packages flagged by npm. This is an implementation self-check, not an independent security audit or production sign-off.

## Applied Fixes

`npm audit fix` updated compatible transitive resolutions but did not eliminate the reported advisories. Explicit npm overrides then resolved `image-size` to 2.1.0 and PostCSS to 8.5.32. Metro's image-parser call was checked with a real 1x1 PNG and returned the expected dimensions. The web bundle rebuilt successfully afterward.

Before: npm reported 14 affected-package findings, including 2 high. After: 12 affected-package findings (1 low, 11 moderate), with no high or critical findings. The focused GitHub-advisory scan decreased from 9 advisories to 3. These counts differ because npm also counts dependency chains; they are not 12 independent CVEs.

Historical scan results: [cve-report-1.json](cve-report-1.json) and [cve-report-2.json](cve-report-2.json).

## Remaining Release Blockers

- `deepmerge@4.3.1`: low-severity prototype poisoning; the advisory supplied no patched version.
- `glob@13.0.7`: moderate traversal cancellation issue; patched version starts at 14.0.2.
- `minimatch@9.0.9` and `10.2.6`: moderate denial of service; patched version starts at 11.0.1.

These packages are in Expo's configuration/build tooling. A forced major dependency/framework change was not applied because it requires a separate Expo/React Native compatibility upgrade and device validation. Do not feed untrusted configuration, source files, or build assets to this toolchain. Before production, upgrade to an appropriate supported Expo SDK or validate compatible patches for these dependencies, and rerun scans and native builds.

Run `npm audit` again before each release; advisory data can change. Database permission testing and live authentication remain separate requirements, documented in the main [README](../README.md).