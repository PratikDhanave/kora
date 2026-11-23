# AI-DLC on kora

Run [AI-DLC](https://github.com/awslabs/aidlc-workflows) (AWS Labs' AI-Driven Life Cycle
methodology: 5 phases, 33 stages, 11 profiles) as a **kora-governed agent**.

## Why they fit together

AI-DLC and kora operate at different layers, and neither overlaps the other:

| | AI-DLC | kora |
| --- | --- | --- |
| **Is** | a *methodology*: how to take work from idea to production | a *control plane*: who the agent is, what it can touch, how it connects |
| **Runs** | on a coding-agent harness (Claude Code, Codex, Cursor…) | the agent, in a governed sandbox |
| **Has** | phase gates, profiles, an audit trail of its own | identity (SPIFFE), policy (OPA), credential brokering, budget |
| **Lacks** | any identity / policy / credential layer | an opinion on *how* the agent should work |

AI-DLC is harness-agnostic and `aidlc config --harness claude` targets **Claude Code**, which is
exactly the `framework: claude-code` kora agents run. So an AI-DLC workflow drops into a kora agent
unchanged, and gains everything AI-DLC deliberately leaves out. The result is **governed AI-DLC**:
every `/aidlc` phase is policy-checked, every outbound call has credentials brokered, every action
traces back to the human who initiated it. AI-DLC's own approval gates line up with kora's
human-in-the-loop review (see the Factory page's review gate).

Which of kora's three questions does this touch? **How does it connect?** AI-DLC's tools and PRs
flow through kora's egress broker instead of handling credentials directly, while preserving *who*
(the agent's SPIFFE identity) and *what* (the agent's policy grants).

## Two ways to run it

### 1. Local prototype (what's deployed): methodology in a text-only agent

A laptop can't run the real CLI-in-sandbox for every phase (a sandbox per agent, a frontier model),
so the prototype is a **text-only** agent whose system prompt *is* the AI-DLC methodology. It drives
the five phases with approval gates, governed by kora, with no sandbox, so it's safe at the
cluster's agent ceiling.

```bash
kubectl apply -f deploy/local/declarative/agent-aidlc.yaml   # the lean, text-only agent
```

Then open **Factory → AI-DLC Pipeline** in the dashboard. As in AI-DLC itself, one conductor (the
`aidlc` agent) drives the five phases and adopts the 14 agent personas in its own context; agents
never invoke each other. Each phase shows its lead, support and review personas, and a human gate
reviews the final output.

The 14 personas are also deployed as separate kora Agents, one identity, policy and budget per
role, for running a single persona on a single stage:

```bash
kubectl apply -f examples/aidlc/agents.yaml   # 11 experts, 2 reviewers, the composer
```

Each agent reserves a session-manager pod, so the laptop cluster runs one per agent
(`agents.scheduling.minReplicas: 1` in `deploy/reference/values/kora.local.yaml`) and still
saturates near the full roster.

### 2. Production path: the real `aidlc` CLI in a governed sandbox

On a real cluster with a capable model, swap the text-only agent for the sandboxed one, which
carries the actual `aidlc` binary and runs `/aidlc <request>` for all workflows:

```bash
# 1. Build the sandbox image FROM kora-sandbox-base (see Dockerfile), push, pin the digest.
docker build -t <registry>/aidlc-sandbox:<tag> examples/aidlc            # resolve kora-sandbox-base per docker-bake.hcl
# 2. Register the SandboxImage + Environment + Agent.
kubectl apply -f examples/aidlc/environment.yaml                         # edit the image ref + model first
```

The agent runs `aidlc config --harness claude && aidlc doctor` on first use (the Environment CRD has
no setup hook, so it lives in the system prompt), then `/aidlc`. A GitHub `Connection` wired via the
Environment's `connectors` lets AI-DLC open PRs with brokered credentials.

## Files

| File | What |
| --- | --- |
| `Dockerfile` | `kora-sandbox-base` + the AI-DLC native CLI. Ends `USER 100:100`, per kora's sandbox contract. |
| `environment.yaml` | Production `SandboxImage` + `Environment` + sandboxed `Agent`. |
| `README.md` | This file. |

The lean text-only agent lives at `deploy/local/declarative/agent-aidlc.yaml` (the prototype).
