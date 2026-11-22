# syntax=docker/dockerfile:1
#
# aidlc-sandbox: kora-sandbox-base plus the AI-DLC CLI (awslabs/aidlc-workflows), so a
# kora `claude-code` agent can drive the full AI-DLC life cycle inside a governed sandbox.
# Modelled on kora's Dockerfile.sandbox-node / the dartforge Dart image.
#
# AI-DLC is a native executable (no Bun/Node required) distributed via GitHub releases, and it
# is harness-agnostic: `aidlc config --harness claude` targets Claude Code, which is the framework
# kora agents run. kora supplies what AI-DLC does not — identity, policy, credential brokering,
# budget — so an agent running `/aidlc` here is a *governed* AI-DLC workflow.
#
# HARD REQUIREMENTS (enforced by the kora operator at validation / digest-resolution):
#   - FROM kora-sandbox-base              (uid 100 user `kora` + the io.runkora.sandbox.base
#                                          label + gh/git/curl/ca-certificates come from the base)
#   - end as USER 100:100
#
# Build context must resolve `kora-sandbox-base` to the kora base image from the same commit
# (as kora's docker-bake.hcl does), or replace it with the published base image tag/digest.

FROM kora-sandbox-base

# Pin to a released tag (e.g. v0.4.1) for a reproducible image. `latest` tracks the newest release
# and is fine for a local prototype but not for a supply-chain-reviewed build.
#   latest : https://github.com/awslabs/aidlc-workflows/releases/latest/download/install.sh
#   pinned : https://github.com/awslabs/aidlc-workflows/releases/download/<tag>/install.sh
ARG AIDLC_VERSION=latest

USER 0

# The official installer drops a single native `aidlc` binary. We point its HOME at a system
# location and expose the binary on PATH so the uid-100 sandbox user can run it. If a future
# installer changes its layout, adjust the find/symlink line and the `aidlc --version` check
# will fail the build loudly rather than shipping a broken image.
ENV AIDLC_HOME=/opt/aidlc
RUN set -eux; \
    install -d -o 0 -g 0 "${AIDLC_HOME}"; \
    if [ "${AIDLC_VERSION}" = latest ]; then \
      url="https://github.com/awslabs/aidlc-workflows/releases/latest/download/install.sh"; \
    else \
      url="https://github.com/awslabs/aidlc-workflows/releases/download/${AIDLC_VERSION}/install.sh"; \
    fi; \
    HOME="${AIDLC_HOME}" curl --proto '=https' --tlsv1.2 -fsSL "${url}" | HOME="${AIDLC_HOME}" sh; \
    bin="$(find "${AIDLC_HOME}" /root -name aidlc -type f -perm -u+x 2>/dev/null | head -n1)"; \
    test -n "${bin}"; \
    ln -sf "${bin}" /usr/local/bin/aidlc; \
    chmod -R a+rX "${AIDLC_HOME}"; \
    aidlc --version

USER 100:100

# The harness is configured per-project (it writes AI-DLC's files into the agent's working
# directory), so it runs at agent startup, not at image build:
#     aidlc config --harness claude && aidlc doctor
# The Environment CRD has no setup hook, so the agent's systemPrompt runs this as its first action
# (see environment.yaml). Then the agent invokes workflows with `/aidlc <request>` exactly as it
# would on a developer's laptop — only here every tool call is policy-checked and every outbound
# call gets credentials brokered by kora.
