import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'nSights',
  description: 'Fund research, model portfolios and branded client decks for Irish advisory firms.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-white text-brand-ink antialiased">{children}</body>
    </html>
  );
}
