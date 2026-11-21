'use client';

// Multi-factory console. Pick a factory (DartForge Converter or ETL Pipeline Builder);
// the page chains that factory's agents one after another, feeding each stage's output into
// the next, and shows the final result. Chaining runs in the browser (the local control plane
// has no run-event trigger chaining), but every stage is a real agent run.

import { useCallback, useState } from 'react';

import {
  Badge,
  Button,
  CodeBlock,
  Heading,
  Icon,
  type IconName,
  Input,
  Stack,
  StatusDot,
  Text,
  Textarea,
} from '@runkora/hades';

/** @tier 3 — factory-section page. Orchestrates factory agent chains client-side. */

type StageStatus = 'idle' | 'running' | 'done' | 'error';

type Stage = {
  slug: string;
  name: string;
  icon: IconName;
  blurb: string;
  task: (source: string, prev: string) => string;
};

type Factory = {
  id: string;
  name: string;
  icon: IconName;
  blurb: string;
  inputLabel: string;
  sample: string;
  /** When set, offer a file picker that loads these extensions into the input. */
  fileAccept?: string;
  stages: Stage[];
  /** Slug of the stage whose fenced code block is the deliverable. */
  finalSlug: string;
};

const SWIFT_SAMPLE = `struct Temperature {
    let celsius: Double
    var fahrenheit: Double { return celsius * 9/5 + 32 }
    func isFreezing() -> Bool { return celsius <= 0 }
}`;

const ETL_SAMPLE = `Source: a CSV of raw orders with columns
  order_id (int), customer_email (string), amount_cents (int), created_at (unix epoch).
Target: a clean "orders" table with
  id (int), email (lowercased), amount_dollars (decimal), created_date (ISO date).
Rules: dedupe by order_id, drop rows with a null email, amount_dollars = amount_cents / 100.`;

const FACTORIES: Factory[] = [
  {
    id: 'dartforge',
    name: 'DartForge Converter',
    icon: 'factory',
    blurb: 'Convert Swift / Kotlin / Java into idiomatic Dart, then review it.',
    inputLabel: 'Swift / Kotlin / Java source',
    sample: SWIFT_SAMPLE,
    fileAccept: '.swift,.kt,.kts,.java',
    finalSlug: 'dartforge-converter',
    stages: [
      {
        slug: 'dartforge-converter',
        name: 'Converter',
        icon: 'bot',
        blurb: 'Translates the source into idiomatic, null-safe Dart.',
        task: (source) => `Convert this Swift, Kotlin or Java to idiomatic Dart:\n\n${source}`,
      },
      {
        slug: 'dartforge-reviewer',
        name: 'Code Reviewer',
        icon: 'shield-check',
        blurb: 'Reviews the conversion for fidelity to the source and Dart idiom.',
        task: (source, prev) =>
          `Review this conversion for fidelity and Dart idiom. List findings by severity.\n\n` +
          `SOURCE:\n${source}\n\nDART:\n${prev}`,
      },
    ],
  },
  {
    id: 'etl',
    name: 'ETL Pipeline Builder',
    icon: 'layers',
    blurb: 'Design a data pipeline from a spec, then generate runnable code.',
    inputLabel: 'Describe the data flow (source, target, transforms)',
    sample: ETL_SAMPLE,
    finalSlug: 'etl-generator',
    stages: [
      {
        slug: 'etl-designer',
        name: 'Designer',
        icon: 'search',
        blurb: 'Infers the schemas and designs the field mappings and transforms.',
        task: (source) => `Design an ETL pipeline for this data flow:\n\n${source}`,
      },
      {
        slug: 'etl-generator',
        name: 'Generator',
        icon: 'braces',
        blurb: 'Generates a runnable pipeline (SQL, pandas or PySpark) and self-validates.',
        task: (source, prev) =>
          `Generate a runnable ETL pipeline from this design. Choose the tech from the spec.\n\n` +
          `DESIGN:\n${prev}\n\nORIGINAL SPEC:\n${source}`,
      },
    ],
  },
];

const STATUS_DOT: Record<StageStatus, 'idle' | 'pending' | 'healthy' | 'error'> = {
  idle: 'idle',
  running: 'pending',
  done: 'healthy',
  error: 'error',
};
const BADGE: Record<StageStatus, 'idle' | 'pending' | 'healthy' | 'error'> = STATUS_DOT;

// Starts a run on the agent (by slug) and resolves with its final assistant text,
// read over the same-origin SSE events route (cookie-authenticated).
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
    es.addEventListener('error', () => {
      if (es.readyState === EventSource.CLOSED) finish(undefined, new Error('event stream closed'));
    });
  });
}

function extractCode(text: string): string {
  const m = text.match(/```[a-zA-Z]*\n([\s\S]*?)```/);
  return m ? m[1].trim() : '';
}

export default function FactoryPage() {
  const [factory, setFactory] = useState<Factory>(FACTORIES[0]);
  const [source, setSource] = useState(FACTORIES[0].sample);
  const [running, setRunning] = useState(false);
  const [statuses, setStatuses] = useState<StageStatus[]>(FACTORIES[0].stages.map(() => 'idle'));
  const [outputs, setOutputs] = useState<string[]>(FACTORIES[0].stages.map(() => ''));
  const [result, setResult] = useState('');
  const [error, setError] = useState<string | null>(null);
  // Human-in-the-loop review gate: the pipeline pauses on its result until a
  // human approves it or sends it back with feedback (which re-runs the chain).
  const [decision, setDecision] = useState<'pending' | 'approved'>('pending');
  const [wantsChanges, setWantsChanges] = useState(false);
  const [feedback, setFeedback] = useState('');

  const selectFactory = useCallback((f: Factory) => {
    if (running) return;
    setFactory(f);
    setSource(f.sample);
    setStatuses(f.stages.map(() => 'idle'));
    setOutputs(f.stages.map(() => ''));
    setResult('');
    setError(null);
    setDecision('pending');
    setWantsChanges(false);
    setFeedback('');
  }, [running]);

  const onFiles = useCallback(async (list: FileList | null) => {
    if (!list || list.length === 0) return;
    const files = Array.from(list);
    const parts = await Promise.all(
      files.map(async (f) => `// ===== ${f.name} =====\n${await f.text()}`),
    );
    setSource(parts.join('\n\n'));
  }, []);

  const run = useCallback(async (humanFeedback?: string) => {
    setRunning(true);
    setError(null);
    setResult('');
    setDecision('pending');
    setWantsChanges(false);
    setStatuses(factory.stages.map(() => 'idle'));
    setOutputs(factory.stages.map(() => ''));

    let prev = '';
    try {
      for (let i = 0; i < factory.stages.length; i++) {
        setStatuses((s) => s.map((v, j) => (j === i ? 'running' : v)));
        const baseTask = factory.stages[i].task(source, prev);
        const task =
          i === 0 && humanFeedback
            ? `${baseTask}\n\nAddress this reviewer feedback:\n${humanFeedback}`
            : baseTask;
        const text = await runStage(factory.stages[i].slug, task);
        setOutputs((o) => o.map((v, j) => (j === i ? text : v)));
        setStatuses((s) => s.map((v, j) => (j === i ? 'done' : v)));
        if (factory.stages[i].slug === factory.finalSlug) setResult(extractCode(text) || text.trim());
        prev = text;
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'the factory run failed');
      setStatuses((s) => s.map((v) => (v === 'running' ? 'error' : v)));
    } finally {
      setRunning(false);
    }
  }, [factory, source]);

  return (
    <Stack gap="relaxed" paddingBlock="relaxed" paddingInline="relaxed">
      <Stack direction="horizontal" align="center" justify="between" gap="comfortable">
        <Stack direction="horizontal" align="center" gap="comfortable">
          <Icon name="factory" size="xl" container circle containerVariant="accent" />
          <Stack gap="none">
            <Heading variant="title">Factory</Heading>
            <Text size="supporting" color="muted">
              Chain agents into a pipeline that runs one after another to a final output.
            </Text>
          </Stack>
        </Stack>
        <Button onClick={() => run()} disabled={running}>
          {running ? 'Running…' : 'Run factory'}
        </Button>
      </Stack>

      {/* Factory selector */}
      <Stack direction="horizontal" gap="snug">
        {FACTORIES.map((f) => (
          <Button
            key={f.id}
            variant={f.id === factory.id ? 'default' : 'ghost'}
            size="sm"
            onClick={() => selectFactory(f)}
            disabled={running}
          >
            <Icon name={f.icon} size="xs" />
            {f.name}
          </Button>
        ))}
      </Stack>
      <Text size="supporting" color="muted">
        {factory.blurb}
      </Text>

      {/* Input */}
      <Stack gap="snug" maxWidth="prose">
        <Text size="supporting" color="muted" mono>
          {factory.inputLabel}
        </Text>
        <Textarea
          value={source}
          onChange={(e) => setSource(e.target.value)}
          rows={7}
          disabled={running}
          aria-label={factory.inputLabel}
        />
        {factory.fileAccept ? (
          <Stack gap="none">
            <Text size="supporting" color="muted">
              …or load a folder of source files:
            </Text>
            <Input
              type="file"
              multiple
              accept={factory.fileAccept}
              onChange={(e) => void onFiles(e.target.files)}
              disabled={running}
              aria-label="Load source files"
            />
          </Stack>
        ) : null}
      </Stack>

      {error ? <Badge variant="error">{error}</Badge> : null}

      {/* Pipeline */}
      <Stack gap="snug">
        {factory.stages.map((stage, i) => (
          <Stack key={stage.slug} gap="snug">
            <Stack direction="horizontal" align="center" gap="comfortable">
              <StatusDot status={STATUS_DOT[statuses[i]]} />
              <Icon name={stage.icon} color="accent" />
              <Stack gap="none">
                <Stack direction="horizontal" align="center" gap="snug">
                  <Text weight="heavy">{stage.name}</Text>
                  <Badge size="sm" variant={BADGE[statuses[i]]}>
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

      {result ? (
        <Stack gap="snug">
          <Heading variant="subsection">Final output</Heading>
          <CodeBlock text={result} wrap />
        </Stack>
      ) : null}

      {/* Human-in-the-loop review gate */}
      {result && !running ? (
        decision === 'approved' ? (
          <Stack direction="horizontal" align="center" gap="snug">
            <Badge variant="healthy">Approved</Badge>
            <Text size="supporting" color="muted">
              You accepted this result.
            </Text>
          </Stack>
        ) : (
          <Stack gap="snug" maxWidth="prose">
            <Heading variant="subsection">Your review</Heading>
            <Text size="supporting" color="muted">
              The agents ran — this is the human-in-the-loop gate. Approve the result, or send it
              back to the pipeline with changes.
            </Text>
            <Stack direction="horizontal" gap="snug">
              <Button onClick={() => setDecision('approved')}>Approve</Button>
              <Button variant="ghost" onClick={() => setWantsChanges((v) => !v)}>
                Request changes
              </Button>
            </Stack>
            {wantsChanges ? (
              <Stack gap="snug">
                <Textarea
                  value={feedback}
                  onChange={(e) => setFeedback(e.target.value)}
                  rows={3}
                  placeholder="What should change? This is fed back to the first stage on re-run."
                  aria-label="Review feedback"
                />
                <Stack direction="horizontal">
                  <Button onClick={() => run(feedback)} disabled={!feedback.trim()}>
                    Re-run with your feedback
                  </Button>
                </Stack>
              </Stack>
            ) : null}
          </Stack>
        )
      ) : null}
    </Stack>
  );
}
