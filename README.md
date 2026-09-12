# 교사 개발자 — 직접 운영하는 수업 연구 작업실

교사가 수업 자료, 책방 활동과 마인드맵을 관리하고 참여자가 반 코드로 입장하는 Next.js 앱입니다.
이 저장소는 [imuzikr/dev-for-teachers](https://github.com/imuzikr/dev-for-teachers)의 소스를 바탕으로 만든 **독립 실행용 배포본**입니다.
운영 Firebase 설정, 실제 사용자·수업 데이터, DB 백업, 원본 Git 이력은 포함하지 않습니다.
코드 안의 데모 자료와 테스트 픽스처는 실행·검증을 위한 예제입니다.

- **설정 없이 실행:** 브라우저 메모리 기반 데모. Firebase에 연결하지 않습니다.
- **본인의 Firebase 연결:** 본인의 Authentication, Firestore, Storage에 저장합니다.
- **운영자:** 처음 관리자 Google 로그인을 완료한 계정 1명이 관리자이자 교사입니다.
- **참여자:** 학교 이름과 이름을 입력해 익명 세션으로 입장하고, 전달받은 반 코드로 참여합니다.

## 1. Fork하고 데모 실행하기

준비물: Node.js 22 이상과 npm, Git.

1. 이 저장소 오른쪽 위의 **Fork**를 눌러 본인 GitHub 계정에 복사합니다.
2. 아래 주소의 `YOUR_GITHUB_ID`를 본인 계정으로 바꿔 실행합니다.

```bash
git clone https://github.com/YOUR_GITHUB_ID/dev-for-teacher.git
cd dev-for-teacher
npm ci
npm run dev
```

[http://localhost:3000](http://localhost:3000)을 엽니다. Firebase 계정 없이 화면을 체험할 수 있습니다.
관리자 데모는 새 브라우저 세션에서 [http://localhost:3000/books](http://localhost:3000/books)로 직접 들어가 확인합니다. 첫 화면의 관리자 Google 로그인은 Firebase 설정 후 사용할 수 있습니다.
데모 데이터 변경은 서버 DB에 저장되지 않으며 새로고침하면 초기화됩니다. 일부 세션 정보는 브라우저에 남을 수 있습니다.
실제 수업 기록을 저장하려면 아래 Firebase 설정을 완료하세요.

## 2. 본인 Firebase 프로젝트 만들기

[Firebase Console](https://console.firebase.google.com/)에서 다음을 설정합니다.

1. 새 프로젝트를 만들고 웹 앱(`</>`)을 등록합니다.
2. **Authentication → Sign-in method**에서 **Anonymous(익명)**와 **Google**을 활성화합니다. Google 제공자의 지원 이메일도 지정합니다.
3. **Firestore Database**에서 기본 `(default)` 데이터베이스를 생성합니다. 테스트 모드의 전체 허용 규칙 대신 아래 저장소 규칙을 배포합니다.
4. 이미지 업로드를 사용하려면 **Storage**에서 버킷을 생성합니다. Firebase Storage 사용에는 Blaze 요금제 연결이 필요하므로 [공식 안내](https://firebase.google.com/docs/storage/web/start)를 확인하세요.
5. **Authentication → Settings → Authorized domains**에 로컬 개발용 `localhost`와 실제 배포 도메인을 추가합니다. 새 프로젝트에는 `localhost`가 자동 등록되지 않을 수 있습니다. [공식 안내](https://firebase.google.com/docs/auth/faq-and-troubleshooting)

## 3. 환경변수 입력하기

예제 파일을 복사합니다.

```bash
# macOS / Linux / Git Bash
cp .env.example .env.local
```

```powershell
# Windows PowerShell
Copy-Item .env.example .env.local
```

Firebase **프로젝트 설정 → 일반 → 내 앱 → SDK 설정 및 구성**의 값을 `.env.local`에 입력합니다.

| 환경변수 | Firebase 웹 설정 필드 |
| --- | --- |
| `NEXT_PUBLIC_FIREBASE_API_KEY` | `apiKey` |
| `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` | `authDomain` |
| `NEXT_PUBLIC_FIREBASE_PROJECT_ID` | `projectId` |
| `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET` | `storageBucket` |
| `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID` | `messagingSenderId` |
| `NEXT_PUBLIC_FIREBASE_APP_ID` | `appId` |

`authDomain`에는 `my-project.firebaseapp.com`처럼 호스트 이름만 넣습니다. `https://`나 경로를 붙이지 마세요.
`storageBucket`은 콘솔의 값을 그대로 사용합니다. 프로젝트 생성 시점에 따라 도메인 끝부분이 다를 수 있습니다.

여섯 값이 모두 비어 있으면 데모 모드입니다. 일부만 입력하면 잘못된 연결을 방지하기 위해 오류를 표시합니다.
값을 바꾼 뒤 개발 서버를 다시 시작하세요.

`.env.local`은 Git에서 제외됩니다. **서비스 계정 JSON, `private_key`, Admin SDK 비밀키는 이 변수에 넣지 마세요.**
`NEXT_PUBLIC_` 값은 빌드 시 브라우저 코드에 포함되는 공개 설정입니다. 데이터 접근은 보안 규칙과 인증으로 제한합니다.

## 4. 본인 프로젝트에 보안 규칙 배포하기

Firebase CLI를 설치하고 본인의 Google 계정으로 로그인합니다.

```bash
npm install -g firebase-tools
firebase login
firebase deploy --project YOUR_FIREBASE_PROJECT_ID --only firestore,storage
```

`YOUR_FIREBASE_PROJECT_ID`는 본인 프로젝트 ID로 교체합니다. 이 저장소는 기본 배포 프로젝트를 지정하지 않으므로 명령에 `--project`를 명시하세요.
Firestore는 `firestore.rules`와 `firestore.indexes.json`, Storage는 `storage.rules`를 사용합니다.
Storage 규칙의 Firestore 조회에 필요한 권한 설정을 Firebase CLI가 요청하면 해당 프로젝트 설정을 확인해 완료합니다.
Storage를 아직 만들지 않았다면 `--only firestore`로 먼저 배포할 수 있지만, Firebase 모드의 Storage 이미지 업로드는 버킷과 Storage 규칙 설정 후 사용할 수 있습니다.

규칙 배포와 웹 앱 배포는 별개입니다. GitHub에 push하는 것만으로 Firebase 규칙이 배포되지는 않습니다.

## 5. 관리자 등록 및 반 운영

1. Firebase 설정을 완료한 앱에서 **관리자 로그인 → Google 계정으로 관리자 로그인**을 선택합니다.
2. `system/admin` 문서가 없으면 해당 Google 계정이 첫 관리자로 등록됩니다. 참여자에게 주소를 공유하기 전에 운영자가 이 과정을 완료하세요.
3. 관리자가 반을 만들고 참여 코드를 전달합니다. 참여자는 이름·학교를 입력한 뒤 코드를 직접 입력합니다.
4. 반을 보관하면 일반 참여자는 해당 반 자료·본인 기록·모둠 카드에 새로 접근하거나 수정할 수 없습니다. 관리자는 조회하고 보관을 해제할 수 있습니다.

관리자는 익명 입장 순서가 아니라 **관리자 Google 로그인을 완료한 순서**로 정해집니다.
이미 관리자가 등록된 프로젝트에서는 다른 Google 계정이 관리자로 등록되지 않습니다.
참여자의 학교·이름 입력은 신원 확인이 아닙니다. 익명 세션을 잃으면 기존 UID의 기록을 동일 사용자로 복구하기 어려울 수 있습니다.

## 6. Vercel로 웹 앱 배포하기

1. [Vercel](https://vercel.com/)에서 본인의 Fork 저장소를 Import합니다.
2. Framework Preset은 **Next.js**, Root Directory는 저장소 루트를 사용합니다. 기본 빌드 명령은 `npm run build`입니다.
3. Project Settings의 Environment Variables에 위 여섯 변수를 **본인의 Firebase 값**으로 등록합니다. 실제 DB를 쓸 환경(Production/Preview/Development)을 구분하세요.
4. Deploy 후 Firebase Authentication의 Authorized domains에 발급된 도메인(예: `my-class.vercel.app`)을 추가합니다.
5. 관리자 로그인, 반 생성, 다른 브라우저의 참여자 코드 가입을 확인합니다.

환경변수를 비워 배포하면 공개 데모가 됩니다. 환경변수를 변경한 경우 **다시 빌드·배포**해야 브라우저에 반영됩니다.
개인 인증 도메인은 보안 헤더에도 자동 반영됩니다.

로컬에서 프로덕션 실행을 확인하려면:

```bash
npm run build
npm start
```

## 운영자 정보와 안내 문구 수정

공개 운영 전에 `components/SiteFooter.jsx`의 소속 안내와 `components/policies/PrivacyContent.jsx`의 운영자 이름·소속·연락 방법을 본인 정보로 바꾸세요. 개인정보처리방침과 `components/policies/TermsContent.jsx`의 약관은 원본에서 가져온 **예시 문서**입니다. 실제 가입 방식, 데이터 보관·삭제 방식, 시행일과 일치하도록 검토·수정해야 합니다.

## 테스트

```bash
# 환경변수 미설정/부분 설정/완전 설정 및 인증 도메인 검사
npm run test:distribution
# 기존 체크리스트와 확인 기록 테스트
npm run test:checklist
```

Firestore 에뮬레이터 테스트에는 Java 21 이상이 필요합니다.

```bash
npm --prefix tests/rules ci
npm run test:access
node --test tests/migrateClassAccess.test.mjs
```

`test:access`는 로컬의 `demo-rules-test` 프로젝트만 사용합니다. 실제 운영 DB에 접속하지 않습니다.
전체 기존 테스트 명령 `npm run test:rules`에는 원본에서 누락된 `functions/purgeClass.js`를 참조하는 삭제 테스트가 포함되어 있어 현재 전체 통과를 보장하지 않습니다. 이번 배포본은 이 테스트를 삭제하거나 무력화하지 않습니다.

## 데이터와 보안 범위

- 처음 만든 Firebase에는 운영 데이터가 없습니다. 새 반은 앱에서 생성하세요. 새 프로젝트는 데이터 이전 스크립트를 실행할 필요가 없습니다.
- 기존 앱의 DB를 가져오는 경우에만 [반 접근 데이터 이전 안내](docs/class-access-security.md)를 따릅니다. 백업 파일은 저장소 밖에 보관하세요.
- 참여 코드는 `classJoinSecrets`에 별도로 저장하며 관리자만 읽을 수 있습니다. 일반 참여자는 자신이 입력한 코드의 유효성만 확인합니다.
- 6자리 코드는 초대 수단입니다. 코드 입력 시도에 대한 서버 횟수 제한은 구현되어 있지 않습니다.
- 질문·답변·공지·키워드는 로그인한 참여자에게 공유됩니다. 해당 공개 영역에 비공개 수업 자료를 넣지 마세요.
- 보관 처리는 이후의 Firestore 접근을 제한합니다. 이미 내려받은 데이터와 스크린샷을 회수하지 않습니다. 기존 Storage 다운로드 토큰 URL도 자동 폐기되지 않습니다.
- 저장소에 실제 사용자 데이터, DB 내보내기, `.env.local`, 서비스 계정 키를 커밋하지 마세요. `.gitignore`는 보조 장치이며 파일 내용을 검사하는 도구가 아닙니다.

## 문제 해결

| 증상 | 확인할 내용 |
| --- | --- |
| Firebase를 설정했는데 데모로 보임 | 여섯 환경변수 등록 여부와 서버 재시작·재배포 여부 |
| Firebase 설정 일부 누락 오류 | `.env.example`의 여섯 항목을 모두 입력하거나 모두 비움 |
| `auth/unauthorized-domain` | Firebase Authentication의 Authorized domains |
| 익명 입장 실패 | Anonymous 로그인 활성화 여부 |
| 이미 다른 관리자 계정이 등록됨 | 처음 등록한 Google 계정 사용 여부 |
| `permission-denied` | 본인 프로젝트에 최신 규칙 배포 여부, 가입한 반인지, 보관 상태인지 |
| 이전 DB의 반이 안 보임 | 데이터 이전 안내의 `accessVersion: 2` 이전 완료 여부 |
| 이미지 업로드 실패 | Storage 버킷, 요금제, 규칙 배포 및 환경변수 확인 |
| 코드 입력 후 반이 안 보임 | 현재 코드인지, 참여 허용 상태인지, 보관된 반인지 확인 |

## 주요 파일

- `lib/firebase.js`: 개인 환경변수로 Firebase 초기화, 미설정 시 데모
- `lib/auth.js`: 익명 입장과 첫 Google 관리자 등록
- `lib/store.js`: Firestore / 데모 데이터 접근
- `firestore.rules`, `storage.rules`: 데이터와 이미지 접근 권한
- `app/books/page.js`: 책방과 수업 화면
- `.env.example`: 사용자별 연결 설정 양식

원본 기준: `imuzikr/dev-for-teachers`의 `bd1d5fbc1a59617b6a1a357f5cd899a80618c633`.
원본 저장소와 운영 서비스는 이 배포본과 별도로 관리됩니다.
