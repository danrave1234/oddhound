'use client';
// Paste your site on the landing page; the address is carried through sign-in to the add-site form.
import { useRouter } from 'next/navigation';
import { Icon } from '@/ui/icons';

export function ScanForm() {
  const router = useRouter();
  return (
    <form className="scan-form" role="search" aria-label="Scan your site" onSubmit={(e) => {
      e.preventDefault();
      const url = String(new FormData(e.currentTarget).get('url') ?? '').trim();
      router.push(`/app/projects/new${url ? `?url=${encodeURIComponent(url)}` : ''}`);
    }}>
      <input className="input" name="url" inputMode="url" autoComplete="url" placeholder="your-site.com" aria-label="Your site's address" />
      <button className="btn btn-lg"><Icon name="sniff" /> Scan your site</button>
    </form>
  );
}
