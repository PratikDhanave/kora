@AGENTS.md

## Local dev: after a laptop / Docker restart

A restart tears down Docker + the k3d cluster. `make up` rebuilds it idempotently:

```bash
make up    # backing services, cluster, migrations, operator, tenants, workloads
make auth  # fresh token → /tmp/kora_credentials.json
```

Then re-apply the AI-DLC roster as needed:

```bash
kubectl apply -f deploy/local/declarative/agent-aidlc.yaml   # the live aidlc agent
# kubectl apply -f examples/aidlc/agents.yaml                # the 14 roles (resource-permitting)
```
