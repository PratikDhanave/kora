# DartForge factory — reference example

A complete **agent factory** tenant for kora: it converts **Swift and Kotlin source into
idiomatic Dart** by chaining specialised agents, each with its own verified identity, budget,
and least-privilege access, governed by policy before every action.

This is the production tenant authored for the `clear-route/kora-platform` GitOps repo, brought
into this repo as a worked reference for building a full multi-agent factory on kora. It is a
**reference, not drop-in deployable** elsewhere: it names clear-route infrastructure (a GitHub
App, an ECR registry, an OIDC client). Adapt those for your own org.

## What it is

- **11 agents / 20 triggers** across six stages:
  `classifier → scoper → converter (Swift + Kotlin) → compile-verifier → code-reviewer → watcher`
  (plus a change-mapper and two researchers).
- **Two converters** (`swift`, `kotlin`), label-routed, sharing one Dart sandbox.
- **GitHub issue labels are the state bus** — every stage transition is an `issues/labeled`
  webhook on the source repo (no external workflow engine). A human labels an issue `dartforge`;
  the factory carries it to a ready-for-review PR.
- Answers the three kora questions per agent — **Who** (an `identityMode: autonomous` Agent CR
  with its own budget and a scoped GitHub-App connector), **What** (each agent declares the
  narrowest GitHub actions + MCP tools it needs), **How** (agents never hold the token; the
  egress gateway injects it just-in-time).

## Layout

```
koratenant.yaml            KoraTenant registration (platform-level)
tenant/
  base/                    shared infra (connection, source, MCP servers), repository-groups,
                           and the factory stages (agents + triggers, enabled: false in base)
  dev/                     dev overlay — shared infra only
  prod/                    prod overlay — factory + Dart SandboxImage; triggers-enabled patch
  README.md                the tenant's own overview
```

## Before it can run (in its target cluster)

1. **Dart sandbox image** — `tenant/prod/sandbox-images/dart.yaml` points at a placeholder.
   Build `dartforge-containers/dart` **FROM `kora-sandbox-base`** (uid 100, label
   `io.runkora.sandbox.base`) with the Dart + Flutter SDK + `gh`, push to a registry, swap the digest.
2. **GitHub App + secrets** — a dedicated `dartforge` App installed on the source repos; app key
   and webhook secret in the secret store.
3. **Source repos** — replace the `REPLACE-ME` placeholder in `tenant/base/repository-groups/`.
4. **Enable** — the factory runs in **prod only**; `tenant/prod/patches/triggers-enabled.yaml`
   flips every trigger on.
