import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Shell } from '@/ui/shell';
import { currentUser, mayScanVerifiedSites } from '@/lib/server';
import { SetupSteps } from '@/ui/setup-steps';
import { NewProjectForm } from './form';

export const metadata = { title: 'New project' };

export default async function NewProject({ searchParams }: { searchParams: Promise<{ url?: string }> }) {
  const { url } = await searchParams;
  const initialOrigin = typeof url === 'string' ? url.slice(0, 300) : '';
  const user = await currentUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(`/app/projects/new${initialOrigin ? `?url=${encodeURIComponent(initialOrigin)}` : ''}`)}`);
  if (!mayScanVerifiedSites(user)) redirect('/app');
  return (
    <Shell active="/app" user={user} toolbar={<div className="crumbs"><Link href="/app">Projects</Link><span className="muted">/</span><strong>New project</strong></div>}>
      <div className="content-narrow">
        <SetupSteps current={1} />
        <div className="page-head" style={{ marginBottom: 18 }}>
          <div>
            <h1 className="h1">Add a site</h1>
            <p className="lead">Next you&apos;ll prove you own it, then approve what Oddhound may do.</p>
          </div>
        </div>
        <div className="card card-pad">
          <NewProjectForm initialOrigin={initialOrigin} />
        </div>
      </div>
    </Shell>
  );
}
