import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Round, CreateRoundBody, UpdateRoundBody } from "@desco/shared";
import { DEFAULT_TIME_LIMIT_SECONDS, RoundStatus } from "@desco/shared";
import { apiFetch, ApiClientError } from "../../lib/api.js";
import { ROUND_STATUS_BADGE_CLASS, ROUND_STATUS_LABEL } from "../../lib/ui.js";
import { Modal } from "../../components/Modal.js";

export default function AdminRounds() {
  const [filter, setFilter] = useState<"" | "preparing" | "active" | "ended">("");
  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Round | null>(null);

  const qc = useQueryClient();
  const { data, isLoading, error } = useQuery({
    queryKey: ["rounds", filter],
    queryFn: () => {
      const qs = filter ? `?status=${filter}` : "";
      return apiFetch<Round[]>(`/api/rounds${qs}`);
    },
  });

  const removeMut = useMutation({
    mutationFn: (id: number) => apiFetch(`/api/rounds/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["rounds"] }),
  });

  const onDelete = async (r: Round) => {
    if (!confirm(`"${r.name}" 차수를 삭제하시겠습니까? 되돌릴 수 없습니다.`)) return;
    try {
      await removeMut.mutateAsync(r.id);
    } catch (e) {
      if (e instanceof ApiClientError) alert(e.body.error.message);
    }
  };

  return (
    <div>
      <header className="mb-6 flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-bold">차수 관리</h1>
          <p className="mt-1 text-sm text-slate-500">교육 차수를 생성·운영하세요.</p>
        </div>
        <button
          onClick={() => setCreateOpen(true)}
          className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
        >
          + 새 차수
        </button>
      </header>

      <div className="mb-4 flex gap-2">
        {([
          ["", "전체"],
          ["preparing", "준비"],
          ["active", "진행 중"],
          ["ended", "종료"],
        ] as const).map(([val, label]) => (
          <button
            key={val}
            onClick={() => setFilter(val as typeof filter)}
            className={`rounded-full border px-3 py-1 text-xs ${
              filter === val
                ? "border-slate-900 bg-slate-900 text-white"
                : "border-slate-300 bg-white text-slate-700 hover:bg-slate-100"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="rounded-xl border border-slate-200 bg-white">
        {isLoading && <p className="p-6 text-sm text-slate-500">불러오는 중…</p>}
        {error && (
          <p className="p-6 text-sm text-red-600">차수 목록을 불러오지 못했습니다.</p>
        )}
        {data && data.length === 0 && (
          <p className="p-6 text-sm text-slate-500">등록된 차수가 없습니다. 우측 상단에서 추가하세요.</p>
        )}
        {data && data.length > 0 && (
          <ul className="divide-y divide-slate-200">
            {data.map((r) => (
              <li key={r.id} className="flex items-center gap-4 px-5 py-4">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                        ROUND_STATUS_BADGE_CLASS[r.status]
                      }`}
                    >
                      {ROUND_STATUS_LABEL[r.status]}
                    </span>
                    <p className="font-semibold">{r.name}</p>
                  </div>
                  <p className="mt-1 text-xs text-slate-500">
                    제한 시간 {Math.floor(r.time_limit_seconds / 60)}분 · ID {r.id}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Link
                    to={`/admin/rounds/${r.id}/teams`}
                    className="rounded-md border border-slate-300 px-3 py-1.5 text-xs hover:bg-slate-100"
                  >
                    팀 관리
                  </Link>
                  {r.status === RoundStatus.Preparing && (
                    <button
                      onClick={() => setEditTarget(r)}
                      className="rounded-md border border-slate-300 px-3 py-1.5 text-xs hover:bg-slate-100"
                    >
                      수정
                    </button>
                  )}
                  {r.status !== RoundStatus.Active && (
                    <button
                      onClick={() => onDelete(r)}
                      className="rounded-md border border-red-200 px-3 py-1.5 text-xs text-red-600 hover:bg-red-50"
                    >
                      삭제
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <CreateRoundModal open={createOpen} onClose={() => setCreateOpen(false)} />
      <EditRoundModal target={editTarget} onClose={() => setEditTarget(null)} />
    </div>
  );
}

function CreateRoundModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [minutes, setMinutes] = useState(DEFAULT_TIME_LIMIT_SECONDS / 60);
  const [error, setError] = useState<string | null>(null);

  const mut = useMutation({
    mutationFn: (body: CreateRoundBody) =>
      apiFetch<Round>("/api/rounds", { method: "POST", body }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["rounds"] });
      setName("");
      setMinutes(DEFAULT_TIME_LIMIT_SECONDS / 60);
      setError(null);
      onClose();
    },
  });

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      await mut.mutateAsync({ name, time_limit_seconds: minutes * 60 });
    } catch (e) {
      if (e instanceof ApiClientError) setError(e.body.error.message);
      else setError("차수 생성에 실패했습니다.");
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="새 차수 만들기">
      <form onSubmit={onSubmit} className="space-y-4">
        <label className="block">
          <span className="mb-1 block text-sm font-medium">차수명</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            placeholder="예: 2026 상반기 신입교육 1차"
            className="w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-slate-900"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-sm font-medium">제한 시간 (분)</span>
          <input
            type="number"
            min={1}
            max={120}
            value={minutes}
            onChange={(e) => setMinutes(Number(e.target.value))}
            required
            className="w-32 rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-slate-900"
          />
          <span className="ml-2 text-xs text-slate-500">기본 15분</span>
        </label>
        {error && <p className="text-sm text-red-600">{error}</p>}
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
            disabled={mut.isPending}
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
          >
            {mut.isPending ? "생성 중…" : "생성"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function EditRoundModal({ target, onClose }: { target: Round | null; onClose: () => void }) {
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [minutes, setMinutes] = useState(15);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (target) {
      setName(target.name);
      setMinutes(target.time_limit_seconds / 60);
      setError(null);
    }
  }, [target]);

  const mut = useMutation({
    mutationFn: (body: UpdateRoundBody) =>
      apiFetch<Round>(`/api/rounds/${target!.id}`, { method: "PUT", body }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["rounds"] });
      onClose();
    },
  });

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      await mut.mutateAsync({ name, time_limit_seconds: minutes * 60 });
    } catch (e) {
      if (e instanceof ApiClientError) setError(e.body.error.message);
      else setError("수정에 실패했습니다.");
    }
  };

  return (
    <Modal open={target !== null} onClose={onClose} title="차수 수정">
      <form onSubmit={onSubmit} className="space-y-4">
        <label className="block">
          <span className="mb-1 block text-sm font-medium">차수명</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            className="w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-slate-900"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-sm font-medium">제한 시간 (분)</span>
          <input
            type="number"
            min={1}
            max={120}
            value={minutes}
            onChange={(e) => setMinutes(Number(e.target.value))}
            required
            className="w-32 rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-slate-900"
          />
        </label>
        {error && <p className="text-sm text-red-600">{error}</p>}
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
            disabled={mut.isPending}
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
          >
            {mut.isPending ? "저장 중…" : "저장"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
