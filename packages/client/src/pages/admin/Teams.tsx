import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  Team,
  TeamWithPasswordHint,
  RoundSummary,
  CreateTeamBody,
  BulkCreateTeamsBody,
  UpdateTeamBody,
} from "@desco/shared";
import { RoundStatus } from "@desco/shared";
import { apiFetch, ApiClientError } from "../../lib/api.js";
import { ROUND_STATUS_BADGE_CLASS, ROUND_STATUS_LABEL } from "../../lib/ui.js";
import { Modal } from "../../components/Modal.js";

export default function AdminTeams() {
  const { roundId } = useParams<{ roundId: string }>();
  const id = Number(roundId);
  const [createOpen, setCreateOpen] = useState(false);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Team | null>(null);
  const [bulkResult, setBulkResult] = useState<TeamWithPasswordHint[] | null>(null);

  const qc = useQueryClient();

  const round = useQuery({
    queryKey: ["rounds", id],
    queryFn: () => apiFetch<RoundSummary>(`/api/rounds/${id}`),
    enabled: Number.isFinite(id),
  });

  const teams = useQuery({
    queryKey: ["rounds", id, "teams"],
    queryFn: () => apiFetch<Team[]>(`/api/rounds/${id}/teams`),
    enabled: Number.isFinite(id),
  });

  const removeMut = useMutation({
    mutationFn: (teamId: number) => apiFetch(`/api/teams/${teamId}`, { method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["rounds", id, "teams"] });
      qc.invalidateQueries({ queryKey: ["rounds", id] });
    },
  });

  const onDelete = async (t: Team) => {
    if (!confirm(`"${t.name}" 팀을 삭제하시겠습니까?`)) return;
    try {
      await removeMut.mutateAsync(t.id);
    } catch (e) {
      if (e instanceof ApiClientError) alert(e.body.error.message);
    }
  };

  const status = round.data?.status;
  const canEdit = status === RoundStatus.Preparing;

  return (
    <div>
      <header className="mb-6">
        <Link to="/admin/rounds" className="text-xs text-slate-500 hover:underline">
          ← 차수 목록
        </Link>
        <div className="mt-2 flex items-end justify-between">
          <div>
            <div className="flex items-center gap-2">
              {status && (
                <span
                  className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                    ROUND_STATUS_BADGE_CLASS[status]
                  }`}
                >
                  {ROUND_STATUS_LABEL[status]}
                </span>
              )}
              <h1 className="text-2xl font-bold">
                {round.data?.name ?? `차수 #${id}`} — 팀 관리
              </h1>
            </div>
            {round.data && (
              <p className="mt-1 text-sm text-slate-500">
                팀 {round.data.team_count} · 시도 {round.data.total_attempts} · 성공 {round.data.total_successes}
              </p>
            )}
          </div>
          {canEdit && (
            <div className="flex gap-2">
              <button
                onClick={() => setBulkOpen(true)}
                className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm hover:bg-slate-100"
              >
                일괄 생성
              </button>
              <button
                onClick={() => setCreateOpen(true)}
                className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
              >
                + 새 팀
              </button>
            </div>
          )}
        </div>
        {!canEdit && status && (
          <p className="mt-3 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-700">
            준비 단계의 차수에만 팀을 추가/수정할 수 있습니다.
          </p>
        )}
      </header>

      <div className="rounded-xl border border-slate-200 bg-white">
        {teams.isLoading && <p className="p-6 text-sm text-slate-500">불러오는 중…</p>}
        {teams.data && teams.data.length === 0 && (
          <p className="p-6 text-sm text-slate-500">아직 등록된 팀이 없습니다.</p>
        )}
        {teams.data && teams.data.length > 0 && (
          <ul className="divide-y divide-slate-200">
            {teams.data.map((t) => (
              <li key={t.id} className="flex items-center gap-4 px-5 py-4">
                <div className="flex-1">
                  <p className="font-semibold">{t.name}</p>
                  <p className="text-xs text-slate-500">
                    아이디 <code>{t.username}</code> · 팀 ID {t.id}
                  </p>
                </div>
                {canEdit && (
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setEditTarget(t)}
                      className="rounded-md border border-slate-300 px-3 py-1.5 text-xs hover:bg-slate-100"
                    >
                      수정
                    </button>
                    <button
                      onClick={() => onDelete(t)}
                      className="rounded-md border border-red-200 px-3 py-1.5 text-xs text-red-600 hover:bg-red-50"
                    >
                      삭제
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      <CreateTeamModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        roundId={id}
      />
      <BulkCreateModal
        open={bulkOpen}
        onClose={() => setBulkOpen(false)}
        roundId={id}
        onCreated={(rows) => setBulkResult(rows)}
      />
      <EditTeamModal target={editTarget} onClose={() => setEditTarget(null)} />
      <BulkResultModal result={bulkResult} onClose={() => setBulkResult(null)} />
    </div>
  );
}

function CreateTeamModal({
  open,
  onClose,
  roundId,
}: {
  open: boolean;
  onClose: () => void;
  roundId: number;
}) {
  const qc = useQueryClient();
  const [form, setForm] = useState<CreateTeamBody>({ name: "", username: "", password: "" });
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setForm({ name: "", username: "", password: "" });
      setError(null);
    }
  }, [open]);

  const mut = useMutation({
    mutationFn: (body: CreateTeamBody) =>
      apiFetch<Team>(`/api/rounds/${roundId}/teams`, { method: "POST", body }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["rounds", roundId, "teams"] });
      qc.invalidateQueries({ queryKey: ["rounds", roundId] });
      onClose();
    },
  });

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      await mut.mutateAsync(form);
    } catch (e) {
      if (e instanceof ApiClientError) setError(e.body.error.message);
      else setError("팀 생성에 실패했습니다.");
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="새 팀 만들기">
      <form onSubmit={onSubmit} className="space-y-4">
        <FormInput
          label="팀명"
          value={form.name}
          onChange={(v) => setForm((f) => ({ ...f, name: v }))}
          placeholder="예: 1팀"
          required
        />
        <FormInput
          label="로그인 아이디"
          value={form.username}
          onChange={(v) => setForm((f) => ({ ...f, username: v }))}
          placeholder="예: team1"
          required
        />
        <FormInput
          label="비밀번호"
          value={form.password}
          onChange={(v) => setForm((f) => ({ ...f, password: v }))}
          placeholder="4자리 이상"
          required
        />
        {error && <p className="text-sm text-red-600">{error}</p>}
        <ModalActions onClose={onClose} submitLabel={mut.isPending ? "생성 중…" : "생성"} busy={mut.isPending} />
      </form>
    </Modal>
  );
}

function BulkCreateModal({
  open,
  onClose,
  roundId,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  roundId: number;
  onCreated: (rows: TeamWithPasswordHint[]) => void;
}) {
  const qc = useQueryClient();
  const [count, setCount] = useState(5);
  const [namePrefix, setNamePrefix] = useState("{i}팀");
  const [usernamePrefix, setUsernamePrefix] = useState("team{i}");
  const [pattern, setPattern] = useState<"random4" | "random6">("random4");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) setError(null);
  }, [open]);

  const mut = useMutation({
    mutationFn: (body: BulkCreateTeamsBody) =>
      apiFetch<TeamWithPasswordHint[]>(`/api/rounds/${roundId}/teams/bulk`, {
        method: "POST",
        body,
      }),
    onSuccess: (rows) => {
      qc.invalidateQueries({ queryKey: ["rounds", roundId, "teams"] });
      qc.invalidateQueries({ queryKey: ["rounds", roundId] });
      onCreated(rows);
      onClose();
    },
  });

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      await mut.mutateAsync({
        count,
        name_prefix: namePrefix || undefined,
        username_prefix: usernamePrefix || undefined,
        password_pattern: pattern,
      });
    } catch (e) {
      if (e instanceof ApiClientError) setError(e.body.error.message);
      else setError("일괄 생성에 실패했습니다.");
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="팀 일괄 생성">
      <form onSubmit={onSubmit} className="space-y-4">
        <label className="block">
          <span className="mb-1 block text-sm font-medium">생성 개수</span>
          <input
            type="number"
            min={1}
            max={50}
            value={count}
            onChange={(e) => setCount(Number(e.target.value))}
            className="w-32 rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-slate-900"
          />
        </label>
        <FormInput
          label="팀명 패턴"
          value={namePrefix}
          onChange={setNamePrefix}
          placeholder="{i}팀"
          hint="{i} 는 1부터 시작하는 번호로 치환됩니다."
        />
        <FormInput
          label="아이디 패턴"
          value={usernamePrefix}
          onChange={setUsernamePrefix}
          placeholder="team{i}"
        />
        <label className="block">
          <span className="mb-1 block text-sm font-medium">비밀번호</span>
          <select
            value={pattern}
            onChange={(e) => setPattern(e.target.value as "random4" | "random6")}
            className="w-48 rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-slate-900"
          >
            <option value="random4">랜덤 숫자 4자리</option>
            <option value="random6">랜덤 숫자 6자리</option>
          </select>
        </label>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <ModalActions onClose={onClose} submitLabel={mut.isPending ? "생성 중…" : "생성"} busy={mut.isPending} />
      </form>
    </Modal>
  );
}

function EditTeamModal({ target, onClose }: { target: Team | null; onClose: () => void }) {
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (target) {
      setName(target.name);
      setPassword("");
      setError(null);
    }
  }, [target]);

  const mut = useMutation({
    mutationFn: (body: UpdateTeamBody) =>
      apiFetch<Team>(`/api/teams/${target!.id}`, { method: "PUT", body }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["rounds"] });
      onClose();
    },
  });

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!target) return;
    setError(null);
    const body: UpdateTeamBody = { name };
    if (password.length > 0) body.password = password;
    try {
      await mut.mutateAsync(body);
    } catch (e) {
      if (e instanceof ApiClientError) setError(e.body.error.message);
      else setError("수정에 실패했습니다.");
    }
  };

  return (
    <Modal open={target !== null} onClose={onClose} title="팀 수정">
      <form onSubmit={onSubmit} className="space-y-4">
        <FormInput label="팀명" value={name} onChange={setName} required />
        <FormInput
          label="비밀번호 재설정 (변경 시에만 입력)"
          value={password}
          onChange={setPassword}
          placeholder="비워두면 변경 안 됨"
        />
        {error && <p className="text-sm text-red-600">{error}</p>}
        <ModalActions onClose={onClose} submitLabel={mut.isPending ? "저장 중…" : "저장"} busy={mut.isPending} />
      </form>
    </Modal>
  );
}

function BulkResultModal({
  result,
  onClose,
}: {
  result: TeamWithPasswordHint[] | null;
  onClose: () => void;
}) {
  if (!result) return null;
  const csv = [
    ["팀명", "아이디", "비밀번호"].join(","),
    ...result.map((r) => [r.name, r.username, r.password_plain ?? ""].join(",")),
  ].join("\n");
  return (
    <Modal open={result !== null} onClose={onClose} title="생성 결과 — 비밀번호 확인" widthClass="max-w-lg">
      <p className="mb-3 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-700">
        ⚠ 비밀번호는 이 화면을 닫으면 다시 볼 수 없습니다. 인쇄/복사해두세요.
      </p>
      <table className="mb-4 w-full text-sm">
        <thead className="bg-slate-100 text-left text-xs text-slate-600">
          <tr>
            <th className="px-3 py-2">팀명</th>
            <th className="px-3 py-2">아이디</th>
            <th className="px-3 py-2">비밀번호</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-200">
          {result.map((r) => (
            <tr key={r.id}>
              <td className="px-3 py-2">{r.name}</td>
              <td className="px-3 py-2 font-mono">{r.username}</td>
              <td className="px-3 py-2 font-mono">{r.password_plain}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="flex justify-end gap-2">
        <button
          onClick={() => {
            navigator.clipboard.writeText(csv);
            alert("클립보드에 복사되었습니다.");
          }}
          className="rounded-lg border border-slate-300 px-4 py-2 text-sm hover:bg-slate-100"
        >
          CSV 복사
        </button>
        <button
          onClick={onClose}
          className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
        >
          확인
        </button>
      </div>
    </Modal>
  );
}

function FormInput({
  label,
  value,
  onChange,
  placeholder,
  required,
  hint,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  required?: boolean;
  hint?: string;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium">{label}</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        required={required}
        className="w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-slate-900"
      />
      {hint && <span className="mt-1 block text-xs text-slate-500">{hint}</span>}
    </label>
  );
}

function ModalActions({
  onClose,
  submitLabel,
  busy,
}: {
  onClose: () => void;
  submitLabel: string;
  busy?: boolean;
}) {
  return (
    <div className="flex justify-end gap-2 pt-2">
      <button
        type="button"
        onClick={onClose}
        className="rounded-lg border border-slate-300 px-4 py-2 text-sm hover:bg-slate-100"
      >
        취소
      </button>
      <button
        type="submit"
        disabled={busy}
        className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
      >
        {submitLabel}
      </button>
    </div>
  );
}
