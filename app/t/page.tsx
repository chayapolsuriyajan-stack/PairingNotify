import { Suspense } from 'react';
import { EventsScreen } from '@/components/EventsScreen';

export const metadata = { title: 'Events' };

export default function EventsPage() {
  return (
    <Suspense>
      <EventsScreen />
    </Suspense>
  );
}
