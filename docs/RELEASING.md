# Releasing

A release is a signed offline package for one exact source revision and one exact
image. It lists what changed, which migrations it adds, which P0/P1 items are still
open and what compatibility has been shown. A release label never closes an open
acceptance item; the package always states `physicalQualification: false` until a
physical qualification exists.

## Once: the publisher key

The publisher holds an Ed25519 key pair. The private key never enters this repository,
CI or the package; `.gitignore` refuses `*.pem` and `*.key` except the public key.

```bash
openssl genpkey -algorithm ed25519 -out publisher-ed25519.pem
openssl pkey -in publisher-ed25519.pem -pubout -out publisher-ed25519.pub.pem
openssl pkey -pubin -in publisher-ed25519.pub.pem -outform DER | openssl dgst -sha256
```

Keep `publisher-ed25519.pem` offline (for example an encrypted removable drive plus a
sealed backup) on the machine that signs. Commit the public key as
`docs/release/publisher-ed25519.pub.pem` and give its SHA-256 fingerprint to each site
through a second channel (in person, signed e-mail or the customer contract), so a
compromised repository cannot swap both. If the private key is lost or exposed, publish
a new public key, tell sites through that second channel and stop accepting packages
signed with the old one.

## Each release

1. Merge everything for the release into `main`, wait for CI, and check out that commit
   cleanly (`git status` must be empty).
2. Build the candidate image with the revision label:
   `docker build --build-arg SOURCE_REVISION=$(git rev-parse HEAD) -t performance-dashboard:VERSION .`
3. Collect evidence for that revision and image. This reads the CI results GitHub
   recorded for the commit (all must have passed) and runs the container and
   operations suites against the image, including an upgrade from the previous release:
   `node scripts/release-evidence.mjs --image performance-dashboard:VERSION --previous-image performance-dashboard:PREVIOUS --out .local/release-evidence.json`
4. Create and sign the package on the signing machine:
   `node scripts/release-package.mjs create --directory .local/release-VERSION --image performance-dashboard:VERSION --version VERSION --previous vPREVIOUS --evidence .local/release-evidence.json --signing-key PATH/publisher-ed25519.pem --public-key docs/release/publisher-ed25519.pub.pem`
5. Verify with the committed public key and a trusted copy of the verifier:
   `node scripts/release-package.mjs verify --directory .local/release-VERSION --public-key docs/release/publisher-ed25519.pub.pem`
6. Tag the revision `vVERSION` and create a GitHub release marked **pre-release** while
   any P0/P1 item in the notes is open. Attach `release.json`, `release.sig` and
   `RELEASE-NOTES.md`; deliver `images.tar` and the rest of the package by the site's
   offline channel (it exceeds GitHub's per-file limit).

The first release has no previous tag: omit `--previous` (the notes then list the whole
first-parent history) and use the same image for `--previous-image`.

## What a site checks

Sites verify the signature with the public key whose fingerprint they received
separately, then follow `INSTALL.txt` and the complete-backup upgrade in
[operations](OPERATIONS.md). Hashes inside the package alone prove integrity, not who
published it.
