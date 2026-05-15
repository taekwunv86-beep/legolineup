#!/usr/bin/env node
// 시드 SQL 생성기. PBKDF2-SHA256 해시를 만들어 .seed.generated.sql 로 출력한다.
// 사용:  SEED_ADMIN_PASSWORD=xxx node scripts/generate-seed.mjs
// 또는:  pnpm --filter @desco/worker run db:seed:local

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ITER = 100_000;
const SALT_BYTES = 16;
const HASH_BYTES = 32;

const hashPassword = (password) => {
  const salt = crypto.randomBytes(SALT_BYTES);
  const hash = crypto.pbkdf2Sync(password, salt, ITER, HASH_BYTES, "sha256");
  return `pbkdf2$${ITER}$${salt.toString("base64")}$${hash.toString("base64")}`;
};

const adminPw = process.env.SEED_ADMIN_PASSWORD ?? "admin1234";
const ftPw = process.env.SEED_FT_PASSWORD ?? "ft1234";

const sqlEscape = (s) => s.replace(/'/g, "''");

const sql = `-- 자동 생성된 시드 SQL. 다시 실행해도 안전 (INSERT OR IGNORE).
INSERT OR IGNORE INTO users (username, password_hash, role, display_name)
VALUES ('admin', '${sqlEscape(hashPassword(adminPw))}', 'admin', '관리자');

INSERT OR IGNORE INTO users (username, password_hash, role, display_name)
VALUES ('ft01', '${sqlEscape(hashPassword(ftPw))}', 'ft', 'FT 김철수');
`;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const out = path.join(__dirname, "..", ".seed.generated.sql");
fs.writeFileSync(out, sql, "utf8");
console.error(`[seed] generated ${out}`);
console.error(`[seed] 로그인 정보:`);
console.error(`[seed]   admin / ${adminPw}`);
console.error(`[seed]   ft01  / ${ftPw}`);
