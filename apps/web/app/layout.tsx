import type { Metadata } from 'next';
import { Funnel_Display, Atkinson_Hyperlegible_Next, Atkinson_Hyperlegible_Mono } from 'next/font/google';
import './globals.css';
import './motion.css';

// Self-hosted at build time (no runtime request to Google). Display: compact grotesque with character for headings,
// numbers and stamps. Text and mono: Atkinson Hyperlegible keeps I/l/1 and O/0 apart in URLs, slugs and hashes.
const display = Funnel_Display({ subsets: ['latin'], variable: '--font-display-face', display: 'swap' });
const text = Atkinson_Hyperlegible_Next({ subsets: ['latin'], variable: '--font-text-face', display: 'swap' });
const mono = Atkinson_Hyperlegible_Mono({ subsets: ['latin'], variable: '--font-mono-face', display: 'swap' });

export const metadata: Metadata = {
  title: { default: 'Oddhound — Find what you didn\'t test', template: '%s · Oddhound' },
  description: 'An exploratory testing agent that tries the unexpected things real users do, and proves what breaks.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${text.variable} ${mono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
