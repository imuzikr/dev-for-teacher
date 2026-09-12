// =============================================================
// 규칙 테스트 공용 헬퍼
// -------------------------------------------------------------
// 실제 firestore.rules 파일을 그대로 에뮬레이터에 올려 검증합니다.
// 규칙을 눈으로 읽어서는 놓치기 쉬운 것들(없는 문서 읽기, 집합 비교의
// 허점, 반 소유자 판정 등)을 실제 요청으로 확인하는 것이 목적입니다.
//
// 파일마다 projectId를 다르게 주어 서로의 데이터에 영향을 주지 않게 합니다.
// =============================================================
import { initializeTestEnvironment } from "@firebase/rules-unit-testing";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const RULES_PATH = resolve(here, "../../firestore.rules");

// emulators:exec 이 넣어 주는 값을 쓰고, 없으면 기본 포트로 떨어집니다.
function emulatorTarget() {
  const raw = process.env.FIRESTORE_EMULATOR_HOST;
  if (!raw) return { host: "127.0.0.1", port: 8080 };
  const [host, port] = raw.split(":");
  return { host, port: Number(port) };
}

export async function makeEnv(projectId) {
  const { host, port } = emulatorTarget();
  return initializeTestEnvironment({
    projectId,
    firestore: { rules: readFileSync(RULES_PATH, "utf8"), host, port },
  });
}

// ── 로그인 컨텍스트 ──
// 교사 역할은 클레임 또는 users 프로필에서, 관리자는 system/admin UID에서 판정합니다.
// 최초 관리자 등록 테스트는 별도로 Google 로그인 토큰을 제공합니다.
export const asStudent = (env, uid) =>
  env.authenticatedContext(uid, { email: `${uid}@example.test`, email_verified: true });

export const asTeacher = (env, uid) =>
  env.authenticatedContext(uid, {
    role: "teacher",
    email: `${uid}@example.test`,
    email_verified: true,
  });

export const asAdmin = (env, uid) =>
  env.authenticatedContext(uid, {
    role: "admin",
    email: `${uid}@example.test`,
    email_verified: true,
  });

// 규칙을 우회해 사전 데이터를 심습니다(테스트 준비용).
export const seed = (env, fn) => env.withSecurityRulesDisabled((ctx) => fn(ctx.firestore()));
