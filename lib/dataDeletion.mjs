const CLASS_CHILDREN = ["attendanceRecords", "seatLayouts", "groupAssignments", "questionSignals"];
const CLASS_RECORDS = ["bookResources", "bookConfirmations", "bookHelpNotes", "rewards", "studentNotes", "kwl", "presence", "memberships", "classJoinLookup", "classJoinClaims"];

function validId(value) {
  if (typeof value !== "string" || !value || value.includes("/")) throw new Error("삭제 대상 ID가 올바르지 않습니다.");
}

async function removeRows(adapter, path, field, value) {
  for (const row of await adapter.list(path, field, value)) await adapter.remove(row.path);
}

export async function purgeClassData(adapter, classId) {
  validId(classId);
  const classPath = `classes/${classId}`;
  if (await adapter.get(classPath)) await adapter.update(classPath, { archived: true });
  // Storage permissions need the class document; retain it on any failed cleanup.
  await adapter.deleteClassImages(classId);
  for (const activity of await adapter.list("bookActivities", "classId", classId)) {
    for (const group of await adapter.list(`${activity.path}/groups`)) {
      await removeRows(adapter, `${group.path}/words`);
      await adapter.remove(group.path);
    }
    await removeRows(adapter, `${activity.path}/entries`);
    await adapter.remove(activity.path);
  }
  for (const board of await adapter.list("studyBoards", "classId", classId)) {
    await removeRows(adapter, `${board.path}/cards`);
    await adapter.remove(board.path);
  }
  for (const child of CLASS_CHILDREN) await removeRows(adapter, `${classPath}/${child}`);
  for (const path of CLASS_RECORDS) await removeRows(adapter, path, "classId", classId);
  await removeRows(adapter, "bookProjects", "classId", classId);
  for (const path of [`bookProjects/${classId}`, `broadcasts/${classId}`, `classJoinSecrets/${classId}`]) {
    await adapter.remove(path);
  }
  await adapter.remove(classPath);
}

export async function purgeStudentData(adapter, uid) {
  validId(uid);
  if ((await adapter.get("system/admin"))?.uid === uid) throw new Error("유일한 관리자 계정은 삭제할 수 없습니다.");
  const profile = await adapter.get(`users/${uid}`);
  if (profile?.role && profile.role !== "student") throw new Error("학생 계정만 삭제할 수 있습니다. 교사 자료는 별도로 이전해 주세요.");
  // Keep only a UID tombstone: the browser cannot revoke Firebase Auth tokens.
  await adapter.set(`deletedUsers/${uid}`, { deleted: true });
  await removeRows(adapter, "memberships", "uid", uid);
  await adapter.deleteUserImages(uid);
  for (const question of await adapter.list("questions")) {
    if (question.data.authorId === uid) {
      await removeRows(adapter, `${question.path}/answers`);
      await adapter.remove(question.path);
    } else {
      const answers = await adapter.list(`${question.path}/answers`, "authorId", uid);
      for (const answer of answers) await adapter.remove(answer.path);
      const changes = {};
      const remaining = await adapter.list(`${question.path}/answers`);
      if (question.data.answerCount !== remaining.length) changes.answerCount = remaining.length;
      if (question.data.understoodAnswerId && !remaining.some((answer) => answer.id === question.data.understoodAnswerId)) changes.understoodAnswerId = null;
      if (question.data.reflection?.authorId === uid) changes.reflection = null;
      if (question.data.meTooIds?.includes(uid)) changes.meTooIds = question.data.meTooIds.filter((id) => id !== uid);
      if (Object.keys(changes).length) await adapter.update(question.path, changes);
    }
  }
  for (const board of await adapter.list("studyBoards")) {
    for (const card of await adapter.list(`${board.path}/cards`)) {
      if (card.data.authorId === uid) await adapter.remove(card.path);
      else {
        const changes = removeGroupMember(card.data, uid);
        if (changes) await adapter.update(card.path, changes);
      }
    }
  }
  for (const activity of await adapter.list("bookActivities")) {
    await removeRows(adapter, `${activity.path}/entries`, "authorId", uid);
    for (const group of await adapter.list(`${activity.path}/groups`)) {
      await removeRows(adapter, `${group.path}/words`, "authorId", uid);
      const changes = removeGroupMember(group.data, uid);
      if (changes) await adapter.update(group.path, changes);
    }
  }
  for (const classroom of await adapter.list("classes")) {
    await removeRows(adapter, `${classroom.path}/attendanceRecords`, "uid", uid);
    await removeRows(adapter, `${classroom.path}/questionSignals`, "uid", uid);
    for (const layout of await adapter.list(`${classroom.path}/seatLayouts`)) {
      if (layout.data.seats?.includes(uid)) await adapter.update(layout.path, { seats: layout.data.seats.map((id) => id === uid ? null : id) });
    }
    for (const assignment of await adapter.list(`${classroom.path}/groupAssignments`)) {
      const groups = (assignment.data.groups ?? []).map((group) => ({ ...group, ...removeGroupMember(group, uid) }));
      if (JSON.stringify(groups) !== JSON.stringify(assignment.data.groups)) await adapter.update(assignment.path, { groups });
    }
  }
  for (const [path, field] of [["memberships", "uid"], ["presence", "uid"], ["rewards", "uid"], ["kwl", "userId"], ["studentNotes", "studentUid"], ["bookConfirmations", "authorId"], ["notices", "authorId"]]) {
    await removeRows(adapter, path, field, uid);
  }
  await adapter.remove(`classJoinClaims/${uid}`);
  await adapter.remove(`users/${uid}`);
}

function removeGroupMember(group, uid) {
  const changes = {};
  if (group.members?.some((member) => member?.uid === uid)) changes.members = group.members.filter((member) => member?.uid !== uid);
  if (group.memberUids?.includes(uid)) changes.memberUids = group.memberUids.filter((id) => id !== uid);
  if (group.leaderUid === uid) changes.leaderUid = "";
  return Object.keys(changes).length ? changes : null;
}
