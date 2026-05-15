import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { User, CreateUserBody, UpdateUserBody } from "@desco/shared";
import { apiFetch, ApiClientError } from "../../lib/api.js";
import { Modal } from "../../components/Modal.js";
import { getUser } from "../../lib/auth.js";

export default function AdminUsers() {
  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<User | null>(null);

  const qc = useQueryClient();
  const me = getUser();
  const { data, isLoading } = useQuery({
    queryKey: ["users"],
    queryFn: () => apiFetch<User[]>("/api/users"),
  });

  const deactivateMut = useMutation({
    mutationFn: (id: number) => apiFetch(`/api/users/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["users"] }),
  });

  const onDeactivate = async (u: User) => {
    if (!confirm(`"${u.display_name}" 계정을 비활성화하시겠습니까?`)) return;
    try {
      await deactivateMut.mutateAsync(u.id);
    } catch (e) {
      if (e instanceof ApiClientError) alert(e.body.error.message);
    }
  };

  return (
    <div>
      <header className="mb-6 flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-bold">계정 관리</h1>
          <p className="mt-1 text-sm text-slate-500">관리자/FT 계정을 생성·관리하세요.</p>
        </div>
        <button
          onClick={() => setCreateOpen(true)}
          className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
        >
          + 새 계정
        </button>
      </header>

      <div className="rounded-xl border border-slate-200 bg-white">
        {isLoading && <p className="p-6 text-sm text-slate-500">불러오는 중…</p>}
        {data && data.length === 0 && (
          <p className="p-6 text-sm text-slate-500">계정이 없습니다.</p>
        )}
        {data && data.length > 0 && (
          <table className="w-full text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase text-slate-500">
              <tr>
                <th className="px-5 py-3">역할</th>
                <th className="px-5 py-3">표시 이름</th>
                <th className="px-5 py-3">아이디</th>
                <th className="px-5 py-3">상태</th>
                <th className="px-5 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {data.map((u) => (
                <tr key={u.id}>
                  <td className="px-5 py-3">
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                        u.role === "admin"
                          ? "bg-indigo-100 text-indigo-700"
                          : "bg-sky-100 text-sky-700"
                      }`}
                    >
                      {u.role === "admin" ? "관리자" : "FT"}
                    </span>
                  </td>
                  <td className="px-5 py-3 font-medium">{u.display_name}</td>
                  <td className="px-5 py-3 font-mono text-xs text-slate-600">{u.username}</td>
                  <td className="px-5 py-3">
                    {u.is_active ? (
                      <span className="text-xs text-emerald-700">활성</span>
                    ) : (
                      <span className="text-xs text-slate-400">비활성</span>
                    )}
                  </td>
                  <td className="px-5 py-3 text-right">
                    <div className="inline-flex gap-2">
                      <button
                        onClick={() => setEditTarget(u)}
                        className="rounded-md border border-slate-300 px-3 py-1.5 text-xs hover:bg-slate-100"
                      >
                        수정
                      </button>
                      {u.is_active && me?.id !== u.id && (
                        <button
                          onClick={() => onDeactivate(u)}
                          className="rounded-md border border-red-200 px-3 py-1.5 text-xs text-red-600 hover:bg-red-50"
                        >
                          비활성화
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <CreateUserModal open={createOpen} onClose={() => setCreateOpen(false)} />
      <EditUserModal target={editTarget} onClose={() => setEditTarget(null)} />
    </div>
  );
}

function CreateUserModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const [form, setForm] = useState<CreateUserBody>({
    username: "",
    password: "",
    role: "ft",
    display_name: "",
  });
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setForm({ username: "", password: "", role: "ft", display_name: "" });
      setError(null);
    }
  }, [open]);

  const mut = useMutation({
    mutationFn: (body: CreateUserBody) =>
      apiFetch<User>("/api/users", { method: "POST", body }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["users"] });
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
      else setError("계정 생성에 실패했습니다.");
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="새 계정 만들기">
      <form onSubmit={onSubmit} className="space-y-4">
        <label className="block">
          <span className="mb-1 block text-sm font-medium">역할</span>
          <select
            value={form.role}
            onChange={(e) => setForm((f) => ({ ...f, role: e.target.value as "admin" | "ft" }))}
            className="w-48 rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-slate-900"
          >
            <option value="ft">FT</option>
            <option value="admin">관리자</option>
          </select>
        </label>
        <label className="block">
          <span className="mb-1 block text-sm font-medium">표시 이름</span>
          <input
            value={form.display_name}
            onChange={(e) => setForm((f) => ({ ...f, display_name: e.target.value }))}
            required
            placeholder="예: 김철수"
            className="w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-slate-900"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-sm font-medium">아이디</span>
          <input
            value={form.username}
            onChange={(e) => setForm((f) => ({ ...f, username: e.target.value }))}
            required
            placeholder="영문/숫자"
            className="w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-slate-900"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-sm font-medium">초기 비밀번호</span>
          <input
            value={form.password}
            onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
            required
            placeholder="4자리 이상"
            className="w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-slate-900"
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
            {mut.isPending ? "생성 중…" : "생성"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function EditUserModal({ target, onClose }: { target: User | null; onClose: () => void }) {
  const qc = useQueryClient();
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (target) {
      setDisplayName(target.display_name);
      setPassword("");
      setIsActive(target.is_active);
      setError(null);
    }
  }, [target]);

  const mut = useMutation({
    mutationFn: (body: UpdateUserBody) =>
      apiFetch<User>(`/api/users/${target!.id}`, { method: "PUT", body }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["users"] });
      onClose();
    },
  });

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!target) return;
    setError(null);
    const body: UpdateUserBody = { display_name: displayName, is_active: isActive };
    if (password.length > 0) body.password = password;
    try {
      await mut.mutateAsync(body);
    } catch (e) {
      if (e instanceof ApiClientError) setError(e.body.error.message);
      else setError("수정에 실패했습니다.");
    }
  };

  return (
    <Modal open={target !== null} onClose={onClose} title="계정 수정">
      <form onSubmit={onSubmit} className="space-y-4">
        <label className="block">
          <span className="mb-1 block text-sm font-medium">표시 이름</span>
          <input
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            required
            className="w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-slate-900"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-sm font-medium">비밀번호 재설정 (변경 시만 입력)</span>
          <input
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="비워두면 변경 안 됨"
            className="w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-slate-900"
          />
        </label>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={isActive}
            onChange={(e) => setIsActive(e.target.checked)}
          />
          <span className="text-sm">활성 계정</span>
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
