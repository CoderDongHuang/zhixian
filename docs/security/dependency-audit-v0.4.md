# V0.4 dependency audit

Audit date: 2026-08-02.

`postcss` is overridden to `8.5.18` and `sharp` to `0.35.0`, removing all high and critical findings reported by `npm audit --omit=dev` while preserving Next 15 and Expo SDK 54 compatibility.

The remaining findings are moderate transitive advisories in the Expo SDK 54 toolchain (`@expo/config`, Metro, Expo Router, Updates and `xcode/uuid`). npm only offers Expo SDK 57 as an automatic resolution. That upgrade also requires React Native, React, Router, Notifications and native build changes, so it is deferred to the next native-platform upgrade rather than forced into this release candidate.

Release policy:

- No critical or high production dependency findings are accepted.
- Moderate toolchain findings require documented upstream constraints and must not process untrusted project configuration in CI.
- Re-run the audit before each production store submission.
