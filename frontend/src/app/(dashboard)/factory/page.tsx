'use client';

// The DartForge factory console. Chains four agents — Classifier -> Converter ->
// Compile Verifier -> Code Reviewer — one after another, feeding each stage's output
// into the next, and shows the final Dart. The chaining runs in the browser (the local
// control plane does not auto-wire agent runs), but every stage is a real agent run.

import { useCallback, useState } from 'react';

import {
  Badge,
  Button,
  CodeBlock,
  Heading,
  Icon,
  type IconName,
  Stack,
  StatusDot,
  Text,
  Textarea,
} from '@runkora/hades';

/** @tier 3 — factory-section page. Orchestrates the DartForge agent chain client-side. */

type StageStatus = 'idle' | 'running' | 'done' | 'error';

type Stage = {
  slug: string;
  name: string;
  icon: IconName;
  blurb: string;
  // Builds the message for this stage from the original source and the previous stage's output.
  task: (source: string, prev: string) => string;
};

const STAGES: Stage[] = [
  {
    slug: 'dartforge-classifier',
    name: 'Classifier',
    icon: 'search',
    blurb: 'Detects the source language and confirms the request is convertible.',
    task: (source) =>
      `Classify this code-conversion request. State the source language (Swift or Kotlin), ` +
      `an estimated size, and confirm it is convertible.\n\nSource:\n${source}`,
  },
  {
    slug: 'dartforge-converter',
    name: 'Converter',
    icon: 'bot',
    blurb: 'Translates the source into idiomatic, null-safe Dart.',
    task: (source) => `Convert this Swift or Kotlin to idiomatic Dart:\n\n${source}`,
  },
  {
    slug: 'dartforge-verifier',
    name: 'Compile Verifier',
    icon: 'check-circle',
    blurb: 'Checks the Dart is well-formed and would compile.',
    task: (_source, prev) =>
      `Verify this converted Dart compiles and is well-formed. Report PASS or FAIL with any fixes:\n\n${prev}`,
  },
  {
    slug: 'dartforge-reviewer',
    name: 'Code Reviewer',
    icon: 'shield-check',
    blurb: 'Reviews the conversion for fidelity to the source and Dart idiom.',
    task: (source, prev) =>
      `Review this Swift/Kotlin to Dart conversion for fidelity and Dart idiom. List findings by severity.\n\n` +
      `SOURCE:\n${source}\n\nDART:\n${prev}`,
  },
];

const SAMPLE = `struct Temperature {
    let celsius: Double
    var fahrenheit: Double { return celsius * 9/5 + 32 }
    func isFreezing() -> Bool { return celsius <= 0 }
}`;

const STATUS_DOT: Record<StageStatus, 'idle' | 'pending' | 'healthy' | 'error'> = {
  idle: 'idle',
  running: 'pending',
  done: 'healthy',
  error: 'error',
};

// Starts a run on the agent (by slug) and resolves with its final assistant text.
// Uses the same-origin SSE events route (cookie-authenticated) to read the result.
async function runStage(slug: string, task: string): Promise<string> {
  const res = await fetch(`/api/agents/types/${slug}/runs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ task }),
  });
  if (!res.ok) throw new Error(`could not start ${slug} (${res.status})`);
  const json = (await res.json()) as { data?: { id?: string } };
  const runId = json.data?.id;
  if (!runId) throw new Error(`no run id for ${slug}`);

  return new Promise<string>((resolve, reject) => {
    const es = new EventSource(`/api/agents/runs/${runId}/events`);
    let settled = false;
    const finish = (text?: string, err?: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      es.close();
      if (err) reject(err);
      else resolve(text ?? '');
    };
    const timer = setTimeout(() => finish(undefined, new Error('stage timed out')), 180_000);
    es.addEventListener('message_complete', (ev) => {
      try {
        const payload = JSON.parse((ev as MessageEvent).data) as { payload?: { text?: string } };
        finish(payload.payload?.text ?? '');
      } catch {
        finish('');
      }
    });
    // EventSource auto-reconnects on transient errors; only fail if it never opened.
    es.addEventListener('error', () => {
      if (es.readyState === EventSource.CLOSED) finish(undefined, new Error('event stream closed'));
    });
  });
}

// Pulls the first ```dart fenced block out of the converter's reply, if present.
function extractDart(text: string): string {
  const m = text.match(/```(?:dart)?\n([\s\S]*?)```/);
  return m ? m[1].trim() : text.trim();
}

export default function FactoryPage() {
  const [source, setSource] = useState(SAMPLE);
  const [running, setRunning] = useState(false);
  const [statuses, setStatuses] = useState<StageStatus[]>(STAGES.map(() => 'idle'));
  const [outputs, setOutputs] = useState<string[]>(STAGES.map(() => ''));
  const [dart, setDart] = useState('');
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(async () => {
    setRunning(true);
    setError(null);
    setDart('');
    setStatuses(STAGES.map(() => 'idle'));
    setOutputs(STAGES.map(() => ''));

    let prev = '';
    try {
      for (let i = 0; i < STAGES.length; i++) {
        setStatuses((s) => s.map((v, j) => (j === i ? 'running' : v)));
        const text = await runStage(STAGES[i].slug, STAGES[i].task(source, prev));
        setOutputs((o) => o.map((v, j) => (j === i ? text : v)));
        setStatuses((s) => s.map((v, j) => (j === i ? 'done' : v)));
        if (STAGES[i].slug === 'dartforge-converter') {
          prev = extractDart(text);
          setDart(prev);
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'the factory run failed');
      setStatuses((s) => s.map((v) => (v === 'running' ? 'error' : v)));
    } finally {
      setRunning(false);
    }
  }, [source]);

  return (
    <Stack gap="relaxed" paddingBlock="relaxed" paddingInline="relaxed">
      <Stack direction="horizontal" align="center" justify="between" gap="comfortable">
        <Stack direction="horizontal" align="center" gap="comfortable">
          <Icon name="factory" size="xl" container circle containerVariant="accent" />
          <Stack gap="none">
            <Heading variant="title">Factory</Heading>
            <Text size="supporting" color="muted">
              Classifier → Converter → Compile Verifier → Code Reviewer, run one after another.
            </Text>
          </Stack>
        </Stack>
        <Button onClick={run} disabled={running}>
          {running ? 'Running…' : 'Run factory'}
        </Button>
      </Stack>

      <Stack gap="snug" maxWidth="prose">
        <Text size="supporting" color="muted" mono>
          Swift or Kotlin source
        </Text>
        <Textarea
          value={source}
          onChange={(e) => setSource(e.target.value)}
          rows={6}
          disabled={running}
          aria-label="Source code to convert"
        />
      </Stack>

      {error ? (
        <Badge variant="error">{error}</Badge>
      ) : null}

      <Stack gap="snug">
        {STAGES.map((stage, i) => (
          <Stack key={stage.slug} gap="snug">
            <Stack direction="horizontal" align="center" gap="comfortable">
              <StatusDot status={STATUS_DOT[statuses[i]]} />
              <Icon name={stage.icon} color="accent" />
              <Stack gap="none">
                <Stack direction="horizontal" align="center" gap="snug">
                  <Text weight="heavy">{stage.name}</Text>
                  <Badge
                    size="sm"
                    variant={
                      statuses[i] === 'done'
                        ? 'healthy'
                        : statuses[i] === 'running'
                          ? 'pending'
                          : statuses[i] === 'error'
                            ? 'error'
                            : 'idle'
                    }
                  >
                    {statuses[i]}
                  </Badge>
                </Stack>
                <Text size="supporting" color="muted">
                  {stage.blurb}
                </Text>
              </Stack>
            </Stack>
            {outputs[i] ? (
              <Stack paddingInline="relaxed">
                <CodeBlock text={outputs[i]} wrap density="compact" />
              </Stack>
            ) : null}
          </Stack>
        ))}
      </Stack>

      {dart ? (
        <Stack gap="snug">
          <Heading variant="subsection">Final Dart</Heading>
          <CodeBlock text={dart} wrap />
        </Stack>
      ) : null}
    </Stack>
  );
}
