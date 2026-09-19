import type { Metadata, Viewport } from 'next';
import { Rajdhani, Inter, JetBrains_Mono } from 'next/font/google';
import './globals.css';
import './ui.css';
import './screens.css';
import { AppChrome } from '@/components/AppChrome';

const display = Rajdhani({
  subsets: ['latin'],
  weight: ['500', '700'],
  variable: '--font-display',
  display: 'swap',
});
const body = Inter({ subsets: ['latin'], variable: '--font-body', display: 'swap' });
const mono = JetBrains_Mono({ subsets: ['latin'], variable: '--font-mono', display: 'swap' });

export const metadata: Metadata = {
  title: 'Pairings',
  description: 'New chess-results pairings on your lock screen.',
  appleWebApp: { capable: true, title: 'Pairings', statusBarStyle: 'black-translucent' },
  icons: { apple: '/icons/icon-192.png' },
};

export const viewport: Viewport = {
  themeColor: '#1B1C1E',
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable} ${mono.variable}`}>
      <body>
        {children}
        <AppChrome />
      </body>
    </html>
  );
}
