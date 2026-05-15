// TM-06 — 임시 (Phase 4 에서 본격 구현)
export default function Ended({
  teamName,
  onLogout,
}: {
  teamName: string;
  onLogout: () => void;
}) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-slate-900 text-white">
      <div className="w-full max-w-sm rounded-2xl bg-slate-800 p-8 text-center">
        <p className="mb-1 text-xs uppercase tracking-wider text-slate-400">{teamName}</p>
        <h1 className="mb-3 text-3xl font-bold">수고하셨습니다</h1>
        <p className="mb-6 text-sm text-slate-300">차수가 종료되었습니다.</p>
        <button
          onClick={onLogout}
          className="rounded-lg bg-white px-4 py-2 text-sm font-semibold text-slate-900 hover:bg-slate-100"
        >
          로그아웃
        </button>
      </div>
    </div>
  );
}
