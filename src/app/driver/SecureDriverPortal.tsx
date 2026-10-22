"use client";
import { useCallback, useEffect, useState } from 'react';
import DriverPageClient from './DriverPageClient';
async function portalRequest(path: string, body?: unknown) {
  const response = await fetch('/driver/portal/' + path, { method: body ? 'POST' : 'GET', credentials: 'same-origin', cache: 'no-store', headers: { 'Content-Type': 'application/json', 'X-Driver-Intent': 'portal' }, ...(body ? { body: JSON.stringify(body) } : {}) });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'Please try again.');
  return result;
}
export default function SecureDriverPortal({ staging = false }: { staging?: boolean }) {
  const [signedIn, setSignedIn] = useState(false);
  const [checking, setChecking] = useState(true);
  const [busy, setBusy] = useState(false);
  const [code, setCode] = useState('');
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [generation, setGeneration] = useState(0);
  const sessionExpired = useCallback(() => setSignedIn(false), []);
  const [profile, setProfile] = useState('owner');
  useEffect(() => {
    // Discard old JS credentials and URL invitations; no silent migration into secure sessions.
    localStorage.removeItem('matni-driver-portal-session');
    sessionStorage.removeItem('matni-driver-key');
    if (location.search || location.hash) history.replaceState({}, '', location.pathname);
    let cancelled = false;
    void portalRequest('session').then(() => { if (!cancelled) setSignedIn(true); }).catch(() => {}).finally(() => { if (!cancelled) setChecking(false); });
    return () => { cancelled = true; };
  }, []);
  async function run(action: () => Promise<void>) {
    setBusy(true); setMessage('');
    try { await action(); } catch (error) { setMessage(error instanceof Error ? error.message : 'Please try again.'); }
    finally { setBusy(false); }
  }
  async function exchange(value: string) { await portalRequest('exchange', { code: value.trim() }); setCode(''); setGeneration(value => value + 1); setSignedIn(true); }
  async function testLogin() {
    const response = await fetch('/driver/staging/invite', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Driver-Intent': 'portal' }, body: JSON.stringify({ profile }) });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Test sign-in unavailable');
    await exchange(result.code);
  }
  return <div className={staging ? 'pb-36' : ''}>
    {staging && <aside className="fixed bottom-0 left-0 right-0 z-[9999] border-t border-amber-300 bg-[#071c38] p-3 text-center text-sm text-white"><strong className="text-amber-200">Staging · fictional bookings · read-only</strong><p>Secure sign-in test. No live customers, payments, GPS or messages.</p><label>Test driver <select aria-label="Test driver" value={profile} onChange={e => setProfile(e.target.value)} className="ml-2 rounded border border-white/40 bg-[#071c38] p-2"><option value="owner">Colin’s assigned jobs</option><option value="other">Other driver (same name)</option><option value="empty">Driver with no jobs</option></select></label><button disabled={busy} onClick={() => void run(testLogin)} className="ml-2 rounded bg-emerald p-2 text-navy">Open test jobs</button></aside>}
    {message && <p role="status" className="relative z-10 bg-navy p-4 text-center text-amber-200">{message}</p>}
    {checking ? <p className="p-8 text-white">Checking sign-in…</p> : signedIn ? <DriverPageClient key={generation} cookieSession onSessionExpired={sessionExpired} onSecureSignOut={() => run(async () => { await portalRequest('logout', {}); setSignedIn(false); })} /> : <main className="mx-auto min-h-screen max-w-lg px-6 pb-40 pt-16 text-white">
      <h1 className="text-3xl font-bold">My Jobs</h1><p className="mt-3 text-white/70">Sign in with a one-use code. No shared driver key is needed.</p>
      {!staging && <form className="mt-6 space-y-3" onSubmit={e => { e.preventDefault(); void run(async () => { const result = await portalRequest('request-code', { email }); setMessage(result.message); }); }}><label className="block">Driver email<input type="email" required value={email} onChange={e => setEmail(e.target.value)} autoComplete="email" className="mt-2 w-full rounded border border-white/30 bg-navy p-3" /></label><button disabled={busy} className="rounded bg-emerald p-3 text-navy">Email my sign-in code</button></form>}
      <form className="mt-6 space-y-3" onSubmit={e => { e.preventDefault(); void run(() => exchange(code)); }}><label className="block">Sign-in code<input type="text" required value={code} onChange={e => setCode(e.target.value)} autoComplete="one-time-code" autoCapitalize="none" spellCheck={false} className="mt-2 w-full rounded border border-white/30 bg-navy p-3" /></label><button disabled={busy} className="rounded bg-emerald p-3 font-bold text-navy">Sign in</button></form>
      <p className="mt-4 text-sm text-white/60">Codes expire after 15 minutes. Your sign-in stays on this device until you sign out or it expires.</p>
    </main>}
  </div>;
}
