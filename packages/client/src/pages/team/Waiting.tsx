export default function Waiting({
  teamName,
  onLogout,
}: {
  teamName: string;
  onLogout: () => void;
}) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-slate-900 text-white">
      <div className="w-full max-w-sm rounded-2xl bg-slate-800 p-8 text-center">
        <p className="mb-1 text-xs uppercase tracking-wider text-slate-400">팀</p>
        <h1 className="mb-6 text-3xl font-bold">{teamName}</h1>
        <p className="mb-1 text-lg">관리자가 시작하기를</p>
        <p className="mb-6 text-lg">기다리는 중...</p>
        <div className="mx-auto mb-6 h-2 w-32 animate-pulse rounded-full bg-slate-700" />
        <button
          onClick={onLogout}
          className="text-xs text-slate-400 underline-offset-4 hover:underline"
        >
          로그아웃
        </button>
      </div>
    </div>
  );
}
