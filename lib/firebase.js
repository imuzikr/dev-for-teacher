// 개인 Firebase 웹 앱의 설정은 .env.local 또는 배포 환경변수에 넣습니다.
// 아무 값도 설정하지 않으면 외부 DB에 연결하지 않는 데모 모드로 실행합니다.
import { initializeApp, getApps } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth } from "firebase/auth";
import { getStorage } from "firebase/storage";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY?.trim() || "",
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN?.trim() || "",
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID?.trim() || "",
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET?.trim() || "",
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID?.trim() || "",
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID?.trim() || "",
};

const missingFields = Object.keys(firebaseConfig).filter((key) => !firebaseConfig[key]);
if (missingFields.length > 0 && missingFields.length < Object.keys(firebaseConfig).length) {
  throw new Error(`Firebase 설정이 일부 누락되었습니다: ${missingFields.join(", ")}. .env.example의 여섯 환경변수를 모두 설정하거나 모두 비워 주세요.`);
}
export const isFirebaseConfigured = missingFields.length === 0;

let db = null;
let auth = null;
let storage = null;

if (isFirebaseConfigured) {
  const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
  db = getFirestore(app);
  auth = getAuth(app);
  storage = getStorage(app);
}

export { db, auth, storage };
