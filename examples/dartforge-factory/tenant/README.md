# DartForge tenant

DartForge is an agent factory that converts **Swift and Kotlin source into idiomatic Dart**. It is
modelled on the `constellation` delivery factory, with two deliberate differences:

1. **Two converters** — `dartforge-converter-swift` and `dartforge-converter-kotlin`, routed by a
   `source-lang:*` issue label, sharing one `dart` sandbox. The reading problem differs by source
   language; the target toolchain is the same.
2. **GitHub issue labels are the state bus** (no Plane). Every stage transition is an
   `issues/labeled` webhook on the source repo.

## Label states

`dartforge` (entry) → `source-lang:swift|kotlin` + `size:single|multi` → `dartforge:scope`
→ `dartforge:convert` → `dartforge:verify` → `dartforge:review` (PR ready) → `dartforge:done`.
`needs-human` / `blocked:dartforge` escalate to humans.

## Pipeline

`classifier → scoper → converter(swift|kotlin) → draft PR → code-reviewer + change-mapper
→ compile-verifier (un-drafts the PR) → humans review & merge → watcher closes the issue`.

## Before the first run

- **Dart sandbox image (critical path):** `prod/sandbox-images/dart.yaml` points at a PLACEHOLDER
  image. Build `dartforge-containers/dart` **FROM `kora-sandbox-base`** (uid 100, label
  `io.runkora.sandbox.base`) with the Dart + Flutter SDK + `gh`, push to ECR, and replace the digest.
  Converters and the verifier cannot run until this exists.
- **GitHub App + secrets:** seed `github-app` (private key) and `github-webhook` (secret) in AWS
  Secrets Manager under `constellation/kora/{env}/tenants/dartforge/`, and install the App on the
  source repos.
- **Source repos:** replace the `REPLACE-ME` placeholder in `base/repository-groups/`.
- **Enable:** the factory and its triggers run in **prod only**; `prod/patches/triggers-enabled.yaml`
  flips every trigger on.

## Run it

Open a GitHub issue on a source repo describing the module to convert and add the label `dartforge`.
