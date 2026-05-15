import { useEffect, useState, type FormEvent } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import type { LoginResponse, TeamByCodeResponse } from "@desco/shared";
import { apiFetch, ApiClientError } from "../../lib/api.js";
import { saveSession } from "../../lib/auth.js";

type Step =
  | { kind: "code" }
  | { kind: "team"; data: TeamByCodeResponse };

const normalizeCode = (s: string) => s.replace(/[^A-Za-z0-9]/g, "").toUpperCase().slice(0, 6);
const formatCode = (s: string) => {
  const n = normalizeCode(s);
  return n.length <= 3 ? n : `${n.slice(0, 3)}-${n.slice(3)}`;
};

export default function TeamLogin() {
  const navigate = useNavigate();
  const [search] = useSearchParams();
  const initialCode = normalizeCode(search.get("code") ?? "");

  const [step, setStep] = useState<Step>({ kind: "code" });
  const [code, setCode] = useState(initialCode);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // URL ?code=XXXXXX 가 있으면 자동으로 1단계 진행
  useEffect(() => {
    if (initialCode.length === 6 && step.kind === "code") {
      void fetchTeams(initialCode);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchTeams = async (rawCode: string) => {
    setBusy(true);
    setError(null);
    try {
      const data = await apiFetch<TeamByCodeResponse>("/api/auth/team-by-code", {
        method: "POST",
        body: { code: rawCode },
      });
      setStep({ kind: "team", data });
    } catch (e) {
      if (e instanceof ApiClientError) setError(e.body.error.message);
      else setError("차수 코드를 확인하지 못했습니다.");
    } finally {
      setBusy(false);
    }
  };

  const onSubmitCode = (e: FormEvent) => {
    e.preventDefault();
    void fetchTeams(code);
  };

  const onPickTeam = async (teamId: number) => {
    if (step.kind !== "team") return;
    setBusy(true);
    setError(null);
    try {
      const res = await apiFetch<LoginResponse>("/api/auth/team-login", {
        method: "POST",
        body: { code, team_id: teamId },
      });
      saveSession(res.token, res.user);
      navigate("/team", { replace: true });
    } catch (e) {
      if (e instanceof ApiClientError) setError(e.body.error.message);
      else setError("입장에 실패했습니다.");
    } finally {
      setBusy(false);
    }
  };

  if (step.kind === "team") {
    return <TeamPickStep data={step.data} busy={busy} error={error} onPick={onPickTeam} onBack={() => setStep({ kind: "code" })} />;
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-900 p-4">
      <form
        onSubmit={onSubmitCode}
        className="w-full max-w-sm rounded-2xl bg-white p-8 shadow-xl"
      >
        <p className="mb-1 text-xs uppercase tracking-wider text-slate-400">Legolineup</p>
        <h1 className="mb-1 text-2xl font-bold">팀 입장</h1>
        <p className="mb-6 text-sm text-slate-500">운영자가 알려준 차수 코드를 입력하세요.</p>

        <label className="mb-5 block">
          <span className="mb-1 block text-xs font-medium text-slate-500">차수 코드</span>
          <input
            value={formatCode(code)}
            onChange={(e) => setCode(normalizeCode(e.target.value))}
            required
            autoFocus
            autoComplete="off"
            inputMode="text"
            placeholder="ABC-XK2"
            className="w-full rounded-lg border border-slate-300 px-3 py-4 text-center font-mono text-2xl tracking-widest outline-none focus:border-slate-900"
          />
        </label>

        {error && (
          <div className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={busy || code.length < 6}
          className="w-full rounded-lg bg-slate-900 py-3 text-base font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
        >
          {busy ? "확인 중…" : "다음"}
        </button>
      </form>
    </div>
  );
}

function TeamPickStep({
  data,
  busy,
  error,
  onPick,
  onBack,
}: {
  data: TeamByCodeResponse;
  busy: boolean;
  error: string | null;
  onPick: (teamId: number) => void;
  onBack: () => void;
}) {
  const [pending, setPending] = useState<{ id: number; name: string } | null>(null);

  const onConfirm = () => {
    if (!pending) return;
    onPick(pending.id);
    setPending(null);
  };

  return (
    <div className="flex min-h-screen flex-col bg-slate-900 p-4 pt-8">
      <header className="mx-auto mb-6 w-full max-w-md text-white">
        <button onClick={onBack} className="mb-3 text-xs text-slate-400 hover:underline">
          ← 차수 코드 다시 입력
        </button>
        <p className="text-xs uppercase tracking-wider text-slate-400">차수</p>
        <h1 className="text-2xl font-bold">{data.round.name}</h1>
        <p className="mt-1 text-sm text-slate-300">자신의 팀을 선택하세요.</p>
      </header>

      {error && (
        <div className="mx-auto mb-4 w-full max-w-md rounded-lg bg-red-500/20 px-3 py-2 text-sm text-red-200">
          {error}
        </div>
      )}

      <div className="mx-auto grid w-full max-w-md grid-cols-2 gap-3">
        {data.teams.length === 0 && (
          <p className="col-span-2 text-center text-sm text-slate-400">
            아직 등록된 팀이 없습니다. 운영자에게 문의하세요.
          </p>
        )}
        {data.teams.map((t) => (
          <button
            key={t.id}
            disabled={busy}
            onClick={() => setPending(t)}
            className="rounded-2xl bg-white px-4 py-6 text-xl font-bold text-slate-900 shadow-lg active:bg-slate-100 disabled:opacity-50"
          >
            {t.name}
          </button>
        ))}
      </div>

      {pending && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onClick={() => setPending(null)}
        >
          <div
            className="w-full max-w-xs rounded-2xl bg-white p-6 text-center shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="mb-1 text-sm text-slate-500">선택한 팀</p>
            <p className="mb-6 text-3xl font-bold text-slate-900">{pending.name}</p>
            <p className="mb-6 text-base text-slate-700">{pending.name}이 맞으신가요?</p>
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => setPending(null)}
                disabled={busy}
                className="rounded-xl border border-slate-300 py-3 text-base font-semibold text-slate-700 hover:bg-slate-100"
              >
                아니오
              </button>
              <button
                onClick={onConfirm}
                disabled={busy}
                className="rounded-xl bg-slate-900 py-3 text-base font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
              >
                예
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
