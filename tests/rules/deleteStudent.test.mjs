import { before, after, beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { assertFails, assertSucceeds } from "@firebase/rules-unit-testing";
import { readFile } from "node:fs/promises";
import { serverTimestamp } from "firebase/firestore";
import { makeEnv, seed, asStudent } from "./helpers.mjs";
import { purgeStudentData } from "../../lib/dataDeletion.mjs";

const adapterSource = (await readFile(new URL("../../lib/firestoreDeletion.mjs", import.meta.url), "utf8"))
  .replace('"firebase/firestore"', JSON.stringify(import.meta.resolve("firebase/firestore")));
const { createDeletionAdapter } = await import(`data:text/javascript;base64,${Buffer.from(adapterSource).toString("base64")}`);

describe("학생 데이터 삭제와 재생성 차단", () => {
  let env;
  let db;
  let adapter;
  before(async () => { env = await makeEnv("demo-delete-student"); });
  after(async () => { await env?.cleanup(); });
  beforeEach(async () => {
    await env.clearFirestore();
    await seed(env, async (db) => {
      const records = {
        "system/admin": { uid: "admin" },
        "users/admin": { uid: "admin", role: "admin" },
        "users/gone": { uid: "gone", role: "student", realName: "삭제 학생", schoolName: "예제 학교" },
        "users/keep": { uid: "keep", role: "student" },
        "classes/c1": { createdBy: "admin", accessVersion: 2, archived: false },
        "classes/c1/attendanceRecords/gone": { uid: "gone", classId: "c1" },
        "classes/c1/questionSignals/gone": { uid: "gone", classId: "c1" },
        "classes/c1/seatLayouts/default": { classId: "c1", layoutId: "default", rows: 1, cols: 2, seats: ["gone", "keep"] },
        "classes/c1/groupAssignments/default": { classId: "c1", groups: [{ index: 1, members: [{ uid: "gone", name: "삭제 학생" }, { uid: "keep", name: "남을 학생" }] }] },
        "memberships/gone_c1": { uid: "gone", classId: "c1", accessVersion: 2 },
        "memberships/keep_c1": { uid: "keep", classId: "c1", accessVersion: 2 },
        "presence/gone_c1": { uid: "gone", classId: "c1" },
        "classJoinClaims/gone": { classId: "c1" },
        "rewards/gone": { uid: "gone", classId: "c1" },
        "kwl/gone": { userId: "gone", classId: "c1" },
        "studentNotes/gone": { studentUid: "gone", classId: "c1" },
        "bookConfirmations/gone": { authorId: "gone", classId: "c1" },
        "questions/own": { authorId: "gone" },
        "questions/own/answers/keep": { authorId: "keep" },
        "questions/other": { authorId: "keep", answerCount: 2, meTooIds: ["gone", "keep"], reflection: { authorId: "gone", authorName: "삭제 학생", text: "개인 내용" }, understoodAnswerId: "gone" },
        "questions/other/answers/gone": { authorId: "gone" },
        "questions/other/answers/keep": { authorId: "keep" },
        "notices/gone": { authorId: "gone" },
        "studyBoards/b1": { classId: "c1" },
        "studyBoards/b1/cards/gone": { authorId: "gone" },
        "studyBoards/b1/cards/keep": { authorId: "keep", memberUids: ["gone", "keep"], members: [{ uid: "gone", name: "삭제 학생" }, { uid: "keep", name: "남을 학생" }], leaderUid: "gone" },
        "bookActivities/a1": { classId: "c1" },
        "bookActivities/a1/entries/gone": { authorId: "gone" },
        "bookActivities/a1/entries/keep": { authorId: "keep" },
        "bookActivities/a1/groups/g1": { memberUids: ["gone", "keep"], members: [{ uid: "gone", name: "삭제 학생" }, { uid: "keep", name: "남을 학생" }] },
        "bookActivities/a1/groups/g1/words/gone": { authorId: "gone" },
        "bookActivities/a1/groups/g1/words/keep": { authorId: "keep" },
      };
      for (const [path, data] of Object.entries(records)) await db.doc(path).set(data);
    });
    db = env.authenticatedContext("admin", { email: "admin@example.test", email_verified: true, firebase: { sign_in_provider: "google.com" } }).firestore();
    adapter = createDeletionAdapter(db, { deleteUserImages: async () => {} });
  });

  it("활동 기록과 내장된 개인정보를 지우고 다른 학생 자료는 남긴다", async () => {
    const profile = () => ({ schoolName: "예제 학교", realName: "새 학생", role: "student", requestedRole: null, createdAt: serverTimestamp() });
    const anonymous = (uid) => env.authenticatedContext(uid, { firebase: { sign_in_provider: "anonymous" } }).firestore();
    await assertSucceeds(anonymous("fresh").doc("users/fresh").set(profile()));
    await purgeStudentData(adapter, "gone");
    for (const path of ["users/gone", "classes/c1/attendanceRecords/gone", "classes/c1/questionSignals/gone", "memberships/gone_c1", "presence/gone_c1", "classJoinClaims/gone", "rewards/gone", "kwl/gone", "studentNotes/gone", "bookConfirmations/gone", "questions/own", "questions/own/answers/keep", "questions/other/answers/gone", "notices/gone", "studyBoards/b1/cards/gone", "bookActivities/a1/entries/gone", "bookActivities/a1/groups/g1/words/gone"]) {
      assert.equal((await db.doc(path).get()).exists, false, `남아 있는 데이터: ${path}`);
    }
    for (const path of ["users/admin", "users/keep", "classes/c1", "memberships/keep_c1", "questions/other/answers/keep", "studyBoards/b1/cards/keep", "bookActivities/a1/entries/keep", "bookActivities/a1/groups/g1/words/keep"]) {
      assert.equal((await db.doc(path).get()).exists, true, `보존할 데이터: ${path}`);
    }
    assert.deepEqual((await db.doc("classes/c1/seatLayouts/default").get()).data().seats, [null, "keep"]);
    assert.deepEqual((await db.doc("classes/c1/groupAssignments/default").get()).data().groups[0].members, [{ uid: "keep", name: "남을 학생" }]);
    assert.deepEqual((await db.doc("bookActivities/a1/groups/g1").get()).data().memberUids, ["keep"]);
    const question = (await db.doc("questions/other").get()).data();
    assert.equal(question.answerCount, 1);
    assert.deepEqual(question.meTooIds, ["keep"]);
    assert.ok(!question.reflection?.authorId);
    assert.ok(!question.understoodAnswerId);
    const groupCard = (await db.doc("studyBoards/b1/cards/keep").get()).data();
    assert.deepEqual(groupCard.memberUids, ["keep"]);
    assert.deepEqual(groupCard.members, [{ uid: "keep", name: "남을 학생" }]);
    assert.ok(!groupCard.leaderUid);
    assert.deepEqual((await db.doc("deletedUsers/gone").get()).data(), { deleted: true });
    const removedUserDb = anonymous("gone");
    await assertFails(removedUserDb.doc("users/gone").set(profile()));
    await assertFails(removedUserDb.doc("classes/c1").get());
    await purgeStudentData(adapter, "gone");
  });

  it("이미지 삭제 실패 시 프로필을 남겨 재시도할 수 있고 새 쓰기는 차단된다", async () => {
    const failing = createDeletionAdapter(db, { deleteUserImages: async () => { throw new Error("storage unavailable"); } });
    await assert.rejects(purgeStudentData(failing, "gone"), /storage unavailable/);
    assert.equal((await db.doc("users/gone").get()).exists, true);
    await assertFails(asStudent(env, "gone").firestore().doc("users/gone").update({ realName: "재생성" }));
    await purgeStudentData(adapter, "gone");
    assert.equal((await db.doc("users/gone").get()).exists, false);
  });

  it("답변 삭제 직후 중단되어도 재시도가 답변 수와 참조를 복구한다", async () => {
    const interrupted = { ...adapter, update: async (path, data) => {
      if (path === "questions/other") throw new Error("interrupted after answers");
      return adapter.update(path, data);
    } };
    await assert.rejects(purgeStudentData(interrupted, "gone"), /interrupted after answers/);
    assert.equal((await db.doc("questions/other/answers/gone").get()).exists, false);
    await purgeStudentData(adapter, "gone");
    const question = (await db.doc("questions/other").get()).data();
    assert.equal(question.answerCount, 1);
    assert.ok(!question.understoodAnswerId);
  });

  it("질문 작성자 삭제가 시작되면 다른 학생의 늦은 답변도 차단한다", async () => {
    const other = asStudent(env, "keep").firestore();
    const answer = () => ({ authorId: "keep", content: "답변", createdAt: serverTimestamp() });
    await assertSucceeds(other.doc("questions/own/answers/before").set(answer()));
    const interrupted = createDeletionAdapter(db, { deleteUserImages: async () => { throw new Error("paused cleanup"); } });
    await assert.rejects(purgeStudentData(interrupted, "gone"), /paused cleanup/);
    await assertFails(other.doc("questions/own/answers/late").set(answer()));
    await assertSucceeds(other.doc("questions/other/answers/new").set(answer()));
    await purgeStudentData(adapter, "gone");
    await assertFails(other.doc("questions/own/answers/after").set(answer()));
  });

  it("일반 학생은 다른 학생 삭제를 시작할 수 없고 관리자 계정은 삭제되지 않는다", async () => {
    const studentAdapter = createDeletionAdapter(asStudent(env, "keep").firestore(), { deleteUserImages: async () => {} });
    await assert.rejects(purgeStudentData(studentAdapter, "gone"), /permission|permissions/i);
    await assert.rejects(purgeStudentData(adapter, "admin"), /관리자/);
    assert.equal((await db.doc("users/admin").get()).exists, true);
    assert.equal((await db.doc("users/gone").get()).exists, true);
  });
});
