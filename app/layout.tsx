import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import './globals.css';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

const title = 'RMDY — The repair network for AI agents';
const description = 'The open repair network for AI agents. Reproduce failures, fund USDT bounties, and install verified runtime fixes.';

const siteUrl = 'https://rmdy-repair-network.ahmed186aa.chatgpt.site';
const socialImage = `${siteUrl}/og.png`;

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title,
  description,
  openGraph: {
    title: 'RMDY',
    description: 'The repair network for AI agents.',
    url: siteUrl,
    images: [{ url: socialImage, width: 1200, height: 630, alt: 'RMDY — the repair network for AI agents' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'RMDY',
    description: 'The repair network for AI agents.',
    images: [socialImage],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
