// 차수 access_code 생성기. 6자리, 혼동 글자 제외.

import { eq } from "drizzle-orm";
import { rounds } from "../db/schema.js";
import type { DbClient } from "../db/client.js";

// O/0, I/L/1 제외 + 명백히 헷갈리는 2/Z 제외
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXY3456789";

const generateRaw = (): string => {
  const buf = crypto.getRandomValues(new Uint8Array(6));
  let s = "";
  for (let i = 0; i < 6; i++) s += ALPHABET[buf[i]! % ALPHABET.length];
  return s;
};

// 저장 형식: 6자리 (대시 없음). 표시는 클라이언트가 3-3 으로 포맷.
export const normalizeAccessCode = (input: string): string =>
  input.replace(/[^A-Z0-9]/gi, "").toUpperCase().slice(0, 6);

export const formatAccessCode = (raw: string): string => {
  if (raw.length !== 6) return raw;
  return `${raw.slice(0, 3)}-${raw.slice(3)}`;
};

export const generateUniqueAccessCode = async (db: DbClient): Promise<string> => {
  // 충돌 가능성 매우 낮지만 안전하게 재시도
  for (let attempt = 0; attempt < 10; attempt++) {
    const code = generateRaw();
    const dup = await db
      .select({ id: rounds.id })
      .from(rounds)
      .where(eq(rounds.access_code, code))
      .get();
    if (!dup) return code;
  }
  throw new Error("access_code 생성 실패: 충돌이 반복됨");
};
