// RSC — static overview of the Factory section. No session data required yet;
// the live factory board will fetch runs once wired to the agents API.

import { Heading, Icon, Stack, Text, type IconName } from '@runkora/hades';

/** @tier 3 — factory-section landing page. Promote to src/components/ only if a second feature needs it. */

type Stage = { icon: IconName; name: string; blurb: string };

const STAGES: Stage[] = [
  { icon: 'search', name: 'Scope', blurb: 'An agent reads the request and writes the plan.' },
  { icon: 'bot', name: 'Build', blurb: 'Specialised agents do the work in a sandbox.' },
  { icon: 'check-circle', name: 'Verify', blurb: 'The output is compiled and checked before review.' },
  { icon: 'shield-check', name: 'Review', blurb: 'An agent reviews; a human approves and merges.' },
];

export default function FactoryPage() {
  return (
    <Stack gap="relaxed" paddingBlock="relaxed" paddingInline="relaxed" maxWidth="prose">
      <Stack direction="horizontal" align="center" gap="comfortable">
        <Icon name="factory" size="xl" container circle containerVariant="accent" />
        <Stack gap="none">
          <Heading variant="title">Factory</Heading>
          <Text size="supporting" color="muted">
            Specialised agents chained into a governed delivery pipeline.
          </Text>
        </Stack>
      </Stack>

      <Text>
        A factory turns one request into one reviewed change by handing it between agents — each with
        its own identity, budget and least-privilege access. Every step is checked against policy before
        it runs, and the whole run traces back to the person who started it.
      </Text>

      <Stack gap="snug">
        <Heading variant="subsection">How a run moves</Heading>
        <Stack gap="snug">
          {STAGES.map((s) => (
            <Stack key={s.name} direction="horizontal" align="center" gap="comfortable">
              <Icon name={s.icon} color="accent" container circle />
              <Stack gap="none">
                <Text weight="heavy">{s.name}</Text>
                <Text size="supporting" color="muted">
                  {s.blurb}
                </Text>
              </Stack>
            </Stack>
          ))}
        </Stack>
      </Stack>

      <Text size="supporting" color="muted">
        No factories are running in this tenant yet. Define agents and the triggers that chain them on
        the Agents and Triggers pages; a live board will appear here once a factory is wired up.
      </Text>
    </Stack>
  );
}
