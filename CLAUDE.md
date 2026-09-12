# dev-for-teacher — 배포본 개발 안내

이 저장소는 `imuzikr/dev-for-teachers`에서 분리한 독립 실행용 소스입니다. 설치·배포는 [README.md](README.md)를 기준으로 합니다. 운영 프로젝트의 연결값이나 사용자 데이터를 커밋하지 않습니다.

## 실행 구조

- Next.js 15 App Router, React 19, Firebase Web SDK를 사용합니다.
- `lib/firebase.js`의 여섯 환경변수가 모두 비어 있으면 메모리 데모입니다. 일부만 채우면 오류를 표시합니다.
- 실제 운영은 운영자 자신의 Firebase Authentication·Firestore·Storage와 보안 규칙을 사용합니다.
- 최초 Google 관리자 로그인 계정 1명이 `system/admin`에 등록됩니다. 일반 참여자는 이름·학교를 입력한 익명 세션으로 반 코드를 입력합니다.
- 개발용 역할 전환과 메모리 데모는 Firebase 보안 규칙의 권한을 부여하지 않습니다.

## 현재 경로

| 경로 | 역할 |
| --- | --- |
| `/` | 참여자 입장과 관리자 Google 로그인 |
| `/books` | 프로젝트·활동·자료·마인드맵과 반 운영 |
| `/admin` | 관리자 전용 사용자 목록·활동 확인·탈퇴 처리 |
| `/privacy`, `/terms` | 운영자가 수정해야 하는 안내 문서 |
| `/board`, `/report` | 폐지된 경로: 404 반환 |

`/study` 화면은 없습니다. 예전 공부방 데이터 접근 함수 일부는 삭제·호환 처리에 남아 있으므로 함수별 참조를 확인한 뒤 수정하세요.

## 주요 파일

- `lib/auth.js`, `lib/user.js`: 로그인·프로필·역할 판정
- `lib/store.js`: 화면에서 사용하는 Firestore/데모 CRUD와 구독
- `lib/bookProjectStorage.js`: 프로젝트 이미지 저장
- `components/BasicFormatEditor.jsx`, `RichTextDisplay.jsx`: 현재 서식 입력·출력
- `components/MindmapCanvas.jsx`: 현재 마인드맵
- `components/BookClassroomTools.jsx`: 반 관리·수업 준비 연결
- `firestore.rules`, `storage.rules`: 서버에서 강제하는 접근 권한
- `DESIGN.md`, `app/globals.css`, `app/book-sidebar.css`: 기존 디자인 계약과 스타일

## 변경·검증 원칙

- 데이터 변경은 Firebase와 데모 양쪽을 확인합니다. 삭제는 실패를 숨기지 않고 재시도할 수 있게 유지합니다.
- 반 삭제 시 반에 속한 기록과 저장 이미지를 정리하되 다른 반과 공용 수업 자료를 보존합니다.
- 사용자의 Firebase Authentication 계정 자체는 브라우저에서 다른 사용자 대신 삭제할 수 없습니다. 앱 데이터 정리와 인증 계정 삭제를 구분합니다.
- 구독 콜백의 오류를 빈 목록으로 처리하는 기존 코드를 새 삭제 코드에 복사하지 않습니다.
- 테스트 데이터를 운영 프로젝트에 심지 않습니다. 에뮬레이터의 `demo-*` 프로젝트만 사용합니다.
- 규칙을 바꾸면 Firestore·Storage 테스트를 실행하고, README의 명령으로 운영자가 자신의 프로젝트에 규칙을 별도로 배포합니다.
- 의존성·도구 설치는 이 저장소의 기존 계약을 따릅니다. 사용하지 않는 화면을 되살리기 위해 패키지를 추가하지 않습니다.
- pdf.js 본체와 복사하는 worker는 모두 `legacy` 빌드를 사용합니다. `scripts/copy-pdf-worker.mjs`가 predev/prebuild에서 같은 출처의 worker를 준비합니다.

```bash
npm ci
npm run test:distribution
npm run test:unit
npm run test:checklist
npm --prefix tests/rules ci
npm run test:rules
npm --prefix tests/rules run test:storage
npm run build
```

테스트별 범위와 실행 조건은 [tests/rules/README.md](tests/rules/README.md), 운영 데이터 이전은 [docs/class-access-security.md](docs/class-access-security.md)를 참고하세요.
