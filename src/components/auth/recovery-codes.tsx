export function RecoveryCodes({ codes }: { codes: string[] }) {
  return <div data-slot="recovery-codes" className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-amber-950 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-100">
    <p className="text-sm font-semibold text-amber-950 dark:text-amber-100">Copiez ces codes maintenant : ils ne seront plus affichés.</p>
    <div className="mt-3 grid grid-cols-2 gap-2 font-mono text-xs">{codes.map(code => <span key={code}>{code}</span>)}</div>
  </div>
}
