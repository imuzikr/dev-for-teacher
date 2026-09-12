// 실제 클라이언트와 같은 삭제 오케스트레이션·Firestore 어댑터를 보안 규칙 아래 실행합니다.
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { makeEnv, seed, asAdmin, asStudent } from "./helpers.mjs";
import { purgeClassData } from "../../lib/dataDeletion.mjs";
import { readFile } from "node:fs/promises";

// Keep the production adapter, resolving Firebase to this isolated test package.
const adapterSource = (await readFile(new URL("../../lib/firestoreDeletion.mjs", import.meta.url), "utf8"))
  .replace("\"firebase/firestore\"", JSON.stringify(import.meta.resolve("firebase/firestore")));
const { createDeletionAdapter } = await import(`data:text/javascript;base64,${Buffer.from(adapterSource).toString("base64")}`);

const PROJECT_ID = "demo-purge-test";
const KEEP = "cKeep"; // 남아 있어야 하는 다른 반
const GONE = "cGone"; // 지울 반

describe("반 삭제 시 하위 데이터 정리", () => {
  let env;
  let db;
  let adapter;
  const imageDeletes = [];

  before(async () => {
    env = await makeEnv(PROJECT_ID);
    db = asAdmin(env, "teacherA").firestore();
    adapter = createDeletionAdapter(db, { deleteClassImages: async (id) => imageDeletes.push(id) });
    await seed(env, async (db) => {
    await db.doc("system/admin").set({ uid: "teacherA" });
    // ── 지울 반에 딸린 자료를 빠짐없이 심습니다 ──
    await db.doc(`classes/${GONE}`).set({ createdBy: "teacherA", archived: true, name: "지울 반" });

    // 반 문서의 하위 컬렉션 (실명·학번이 들어가는 곳)
    await db.doc(`classes/${GONE}/attendanceRecords/2026-08-23_stu1`).set({
      classId: GONE, uid: "stu1", date: "2026-08-23", name: "학생A", studentId: "30101",
    });
    await db.doc(`classes/${GONE}/seatLayouts/default`).set({ classId: GONE, layoutId: "default", seats: [] });
    await db.doc(`classes/${GONE}/groupAssignments/default`).set({
      classId: GONE, groups: [{ index: 1, members: [{ uid: "stu1", name: "학생A", studentId: "30101" }] }],
    });
    await db.doc(`classes/${GONE}/questionSignals/stu1`).set({
      classId: GONE, uid: "stu1", name: "학생A", studentId: "30101",
    });

    // 공부방 보드 + 카드(하위 컬렉션)
    await db.doc(`studyBoards/b1`).set({ classId: GONE, title: "보드", type: "cards", editMode: "open" });
    await db.doc(`studyBoards/b1/cards/stu1`).set({ authorId: "stu1", title: "카드", content: "내용" });

    // 책방 활동 + 모둠/낱말/제출물(2단계 하위 컬렉션)
    await db.doc(`bookActivities/a1`).set({ classId: GONE, type: "consonant", title: "닿소리" });
    await db.doc(`bookActivities/a1/groups/g1`).set({ activityId: "a1", groupName: "1모둠" });
    await db.doc(`bookActivities/a1/groups/g1/words/w1`).set({ authorId: "stu1", text: "낱말" });
    await db.doc(`bookActivities/a1/entries/stu1`).set({
      activityId: "a1", authorId: "stu1", authorName: "학생A", answers: { K: "안다" },
    });

    // classId로 묶인 최상위 기록들
    await db.doc(`rewards/${GONE}_stu1`).set({ classId: GONE, uid: "stu1", count: 5 });
    await db.doc(`studentNotes/n1`).set({ classId: GONE, studentUid: "stu1", text: "관찰 메모" });
    await db.doc(`kwl/k1`).set({ classId: GONE, userId: "stu1", date: "2026-08-23", K: "안다" });
    await db.doc(`presence/stu1_${GONE}`).set({ classId: GONE, uid: "stu1", visible: true });
    await db.doc(`memberships/stu1_${GONE}`).set({ classId: GONE, uid: "stu1" });
    await db.doc(`broadcasts/${GONE}`).set({ classId: GONE, mode: "slide" });

    // ── 남아 있어야 하는 것들 ──
    await db.doc(`classes/${KEEP}`).set({ createdBy: "teacherA", archived: false, name: "남을 반" });
    await db.doc(`classes/${KEEP}/attendanceRecords/2026-08-23_stu9`).set({ classId: KEEP, uid: "stu9" });
    await db.doc(`studyBoards/b9`).set({ classId: KEEP, title: "남을 보드", type: "cards" });
    await db.doc(`bookActivities/a9`).set({ classId: KEEP, type: "consonant" });
    await db.doc(`rewards/${KEEP}_stu9`).set({ classId: KEEP, uid: "stu9", count: 3 });
    await db.doc(`memberships/stu9_${KEEP}`).set({ classId: KEEP, uid: "stu9" });
    // 수업 자료는 반이 아니라 교사(ownerId)에 귀속 — 반을 지워도 남아야 합니다.
    await db.doc(`lessons/l1`).set({ ownerId: "teacherA", title: "수업 자료" });

    await db.doc(`classJoinSecrets/${GONE}`).set({ joinCode: "123456" });
    await db.doc("classJoinLookup/123456").set({ classId: GONE });
    await db.doc("classJoinClaims/stu1").set({ classId: GONE });
    await db.doc(`bookProjects/${GONE}`).set({ classId: GONE });
    await db.doc("bookResources/r1").set({ classId: GONE });
    await db.doc("bookHelpNotes/h1").set({ classId: GONE });
    await db.doc("bookConfirmations/conf1").set({ classId: GONE });
    });
    await purgeClassData(adapter, GONE);
  });

  after(async () => {
    await env?.cleanup();
  });

  const gone = async (path) => {
    const snap = await db.doc(path).get();
    assert.equal(snap.exists, false, `남아 있으면 안 됩니다: ${path}`);
  };
  const kept = async (path) => {
    const snap = await db.doc(path).get();
    assert.equal(snap.exists, true, `지워지면 안 됩니다: ${path}`);
  };

  it("반 문서가 사라진다", async () => {
    await gone(`classes/${GONE}`);
  });

  it("반 하위 컬렉션이 남지 않는다 (출석부·자리표·기본 모둠·손들기)", async () => {
    await gone(`classes/${GONE}/attendanceRecords/2026-08-23_stu1`);
    await gone(`classes/${GONE}/seatLayouts/default`);
    await gone(`classes/${GONE}/groupAssignments/default`);
    await gone(`classes/${GONE}/questionSignals/stu1`);
  });

  it("공부방 보드와 카드가 남지 않는다", async () => {
    await gone("studyBoards/b1");
    await gone("studyBoards/b1/cards/stu1");
  });

  it("책방 활동의 2단계 하위 컬렉션까지 남지 않는다", async () => {
    await gone("bookActivities/a1");
    await gone("bookActivities/a1/groups/g1");
    await gone("bookActivities/a1/groups/g1/words/w1");
    await gone("bookActivities/a1/entries/stu1");
  });

  it("classId로 묶인 최상위 기록이 남지 않는다", async () => {
    await gone(`rewards/${GONE}_stu1`);
    await gone("studentNotes/n1");
    await gone("kwl/k1");
    await gone(`presence/stu1_${GONE}`);
    await gone(`memberships/stu1_${GONE}`);
    await gone(`broadcasts/${GONE}`);
  });

  it("다른 반의 자료는 건드리지 않는다", async () => {
    await kept(`classes/${KEEP}`);
    await kept(`classes/${KEEP}/attendanceRecords/2026-08-23_stu9`);
    await kept("studyBoards/b9");
    await kept("bookActivities/a9");
    await kept(`rewards/${KEEP}_stu9`);
    await kept(`memberships/stu9_${KEEP}`);
  });

  it("교사의 수업 자료는 남는다 (반이 아니라 교사 소유)", async () => {
    await kept("lessons/l1");
  });

  it("가입 코드와 프로젝트·확인 자료가 남지 않는다", async () => {
    for (const path of [`classJoinSecrets/${GONE}`, "classJoinLookup/123456", "classJoinClaims/stu1", `bookProjects/${GONE}`, "bookResources/r1", "bookHelpNotes/h1", "bookConfirmations/conf1"]) await gone(path);
    assert.ok(imageDeletes.includes(GONE));
  });

  it("학생은 반 삭제를 시작할 수 없다", async () => {
    const studentAdapter = createDeletionAdapter(asStudent(env, "stu9").firestore(), { deleteClassImages: async () => { throw new Error("must not reach storage"); } });
    await assert.rejects(purgeClassData(studentAdapter, KEEP), /permission|permissions/i);
    await kept(`classes/${KEEP}`);
  });

  it("Storage 삭제 실패는 반 문서를 보존하고 재시도가 완료된다", async () => {
    const failingAdapter = createDeletionAdapter(db, { deleteClassImages: async () => { throw new Error("storage unavailable"); } });
    await assert.rejects(purgeClassData(failingAdapter, KEEP), /storage unavailable/);
    await kept(`classes/${KEEP}`);
    assert.equal((await db.doc(`classes/${KEEP}`).get()).data().archived, true);
    await purgeClassData(adapter, KEEP);
    await gone(`classes/${KEEP}`);
    await gone(`classes/${KEEP}/attendanceRecords/2026-08-23_stu9`);
  });

  it("이미 지워진 반에 다시 실행해도 안전하다 (멱등)", async () => {
    await purgeClassData(adapter, GONE);
  });
});
