import { notFound } from 'next/navigation';
import { Button, Chip, HazardBanner, Panel, Row, RowList, SectionHeader, TabBar } from '@/components/ui';

export const metadata = { title: 'Design kit', robots: { index: false } };

const muted = { color: 'var(--muted)' } as const;

/** Component gallery for development. Hidden in production. */
export default function DesignKit() {
  if (process.env.NODE_ENV === 'production') notFound();

  return (
    <>
      <main className="ef-page">
        <SectionHeader index="00" caption="AIC // DESIGN KIT">Components</SectionHeader>

        <HazardBanner label="System degraded">
          Auto-discovery is down. Pinned tournaments still work.
        </HazardBanner>

        <SectionHeader index="01" caption="Buttons">Actions</SectionHeader>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <Button arrow>Enable notifications</Button>
          <Button variant="secondary">Send test push</Button>
          <Button disabled>Disabled</Button>
        </div>

        <SectionHeader index="02" caption="Panels">Notify</SectionHeader>
        <Panel code="02 / NOTIFY" title="Notifications" status={<Chip tone="ok">Active</Chip>} serial="AIC-PN-0002">
          <p style={{ margin: 0 }}>Push is on for this device.</p>
        </Panel>
        <Panel code="03 / WATCH" title="Bangkok Open 2026" status={<Chip tone="accent" solid>Live</Chip>} active>
          <p style={{ margin: 0 }}>Round 5 pairings published.</p>
        </Panel>

        <SectionHeader index="03" caption="Rows">History</SectionHeader>
        <RowList>
          <Row leading="05" tick="white" trailing="-" active>
            <strong>Somchai P.</strong> <span style={muted}>2150</span>
          </Row>
          <Row leading="04" tick="black" trailing="1">Nattapong K. <span style={muted}>1980</span></Row>
          <Row leading="03" tick="white" trailing="1/2">Arthit S. <span style={muted}>2045</span></Row>
        </RowList>

        <SectionHeader index="04" caption="Chips">Status</SectionHeader>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Chip>Standby</Chip>
          <Chip tone="info">Online</Chip>
          <Chip tone="alert">Not found</Chip>
          <Chip tone="neutral" solid>White</Chip>
          <Chip tone="accent" solid>Black</Chip>
        </div>
      </main>
      <TabBar
        items={[
          { href: '/design', label: 'Now' },
          { href: '/t', label: 'Events' },
          { href: '/follow', label: 'Follow' },
          { href: '/settings', label: 'Settings' },
        ]}
      />
    </>
  );
}
