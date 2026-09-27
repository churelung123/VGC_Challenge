import type {Metadata} from 'next';
import type {ReactNode} from 'react';

export const metadata: Metadata = {
  title: 'Ryusei Bot',
  description: 'Discord ranked ladder bot',
};

export default function RootLayout({children}: {children: ReactNode}) {
  return (
    <html lang="vi">
      <body style={{margin: 0, fontFamily: 'ui-sans-serif, system-ui, sans-serif'}}>{children}</body>
    </html>
  );
}
