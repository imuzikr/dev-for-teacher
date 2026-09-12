# Firestore·Storage 규칙과 데이터 삭제 테스트

실제 `firestore.rules`와 `storage.rules`를 로컬 에뮬레이터에 올려 인증된 SDK 요청으로 검증합니다. 운영 Firebase에는 접속하지 않고 `demo-` 프로젝트만 사용합니다.

## 준비

Node.js 22 이상과 Java 21을 설치하고 저장소 루트에서 실행합니다.

```bash
npm ci
npm --prefix tests/rules ci
```

테스트 도구는 운영 빌드 의존성과 분리되어 있습니다. Cloud Functions 배포나 서비스 계정 키는 필요하지 않습니다.

## 실행

```bash
# 전체 Firestore·Storage 규칙과 실제 클라이언트 삭제 로직
npm run test:rules

# 가입 코드·멤버십·보관 반 접근
npm run test:access

# Storage 규칙만
npm --prefix tests/rules run test:storage

# 에뮬레이터가 필요 없는 단위 테스트
npm run test:unit
```

전체 테스트는 Firestore와 Storage 에뮬레이터를 모두 시작합니다. Storage 검사를 자동으로 건너뛰지 않습니다. 파일별 실행을 순차 처리하고 테스트 제한 시간을 두며, 완료 후 남은 SDK 연결 때문에 프로세스가 대기하지 않도록 `--test-force-exit`를 사용합니다. `emulators:exec`가 종료 시 에뮬레이터도 정리합니다.

## 주요 검증 범위

| 파일 | 검증 내용 |
|---|---|
| `memberships.test.mjs`, `archiveIsolation.test.mjs` | 비공개 참여 코드, 멤버십, 보관 반 접근 차단 |
| `users.test.mjs` | 최초 Google 관리자 등록, 익명 프로필, 역할 상승 방지 |
| `deleteClass.test.mjs` | 실제 클라이언트 삭제 어댑터로 하위 자료와 가입 정보 삭제, 다른 반 보존, 실패 후 재시도 |
| `deleteStudent.test.mjs` | 학생 활동과 포함된 신원 삭제, 재생성 차단, 답변 삭제 중단 후 복구, 늦은 답변 차단 |
| `bookProjectStorageRules.test.mjs` | 이미지 업로드·조회, 불변 파일, 관리자 전용 목록 조회·삭제 |
| `attendance.test.mjs`, `seatGroups.test.mjs` | 과거 출석·자리·모둠 자료 접근 및 삭제 권한 |
| `studyCards.test.mjs`, `bookEntries.test.mjs` 등 | 카드·활동 제출·프로젝트·확인 기록 규칙 |

삭제 테스트는 앱과 같은 `lib/dataDeletion.mjs`와 `lib/firestoreDeletion.mjs`를 호출합니다. Firestore 삭제 요청은 보안 규칙을 우회하지 않습니다. 사전 데이터 준비만 규칙을 우회합니다. 이미지 삭제 실패는 주입하여 재시도를 검사하고, 실제 Storage 접근 권한은 별도 Storage 테스트에서 확인합니다.

## 테스트 작성 원칙

- 사전 데이터는 실제 저장 형식에 맞추세요. 잘못된 필드 때문에 거부되면 보안 검사가 잘못 통과할 수 있습니다.
- 허용과 거부 사례를 함께 검사하세요. 관리자 권한은 역할 문자열만으로 생기지 않고 `system/admin`의 UID와 일치해야 합니다.
- 새 컬렉션이나 포함된 사용자 식별 필드를 추가하면 삭제 로직과 삭제 테스트도 함께 갱신하세요.
- 에뮬레이터 검증은 실제 Firebase 프로젝트의 설정·과금·배포 검증을 대신하지 않습니다.
