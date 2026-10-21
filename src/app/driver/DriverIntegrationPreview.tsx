"use client";
import { useEffect, useState } from 'react';
import DriverPageClient from './DriverPageClient';
export default function DriverIntegrationPreview() {
  const [ready, setReady] = useState(false);
  const [profile, setProfile] = useState('owner');
  const [error, setError] = useState('');
  useEffect(() => {
    let cancelled = false;
    setReady(false); setError('');
    void fetch('/driver/preview-session', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ profile }) })
      .then(async response => { if (!response.ok) throw new Error(); return response.json(); })
      .then(session => { if (!cancelled) { localStorage.setItem('matni-driver-portal-session', session.sessionToken); setReady(true); } })
      .catch(() => { if (!cancelled) setError('The staging preview could not sign in. Refresh to retry.'); });
    return () => { cancelled = true; };
  }, [profile]);
  return <div className="pb-36">
    <aside className="fixed bottom-0 left-0 right-0 z-[9999] border-t border-amber-300 bg-[#071c38] p-3 text-center text-sm text-white">
      <strong className="text-amber-200">Staging · fictional bookings · read-only</strong>
      <p>Real booking API code. No live customers, payments, GPS or messages.</p>
      <label>Test driver <select aria-label="Test driver" value={profile} onChange={event => setProfile(event.target.value)} className="ml-2 rounded border border-white/40 bg-[#071c38] p-2"><option value="owner">Colin’s assigned jobs</option><option value="other">Other driver (same name)</option><option value="empty">Driver with no jobs</option></select></label>
    </aside>
    {error ? <p role="alert" className="p-8 text-white">{error}</p> : ready ? <DriverPageClient key={profile} portal="driver" /> : <p className="p-8 text-white">Opening staging jobs…</p>}
  </div>;
}
