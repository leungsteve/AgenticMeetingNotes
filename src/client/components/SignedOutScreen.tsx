interface SignedOutScreenProps {
  onSignIn: () => void;
}

export default function SignedOutScreen({ onSignIn }: SignedOutScreenProps) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-100 px-6">
      <div className="w-full max-w-md rounded-2xl border border-slate-200/80 bg-white p-8 shadow-shell">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
          You're signed out
        </p>
        <h1 className="mt-1 text-xl font-semibold tracking-tight text-slate-900">
          See you next time
        </h1>
        <p className="mt-3 text-sm text-slate-600">
          Your session has been ended. Sign back in with your work Google account whenever you're
          ready.
        </p>

        <button
          type="button"
          onClick={onSignIn}
          className="mt-6 inline-flex w-full items-center justify-center rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-slate-800"
        >
          Sign in again
        </button>
      </div>
    </div>
  );
}
