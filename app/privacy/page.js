import Link from "next/link";
import SiteFooter from "@/components/SiteFooter";
import PrivacyContent from "@/components/policies/PrivacyContent";

export const metadata = { title: "개인정보처리방침 — 교사 개발자" };

// =============================================================
// 배포본 개인정보처리방침 예시 — 운영자가 실제 운영 내용과 시행일을 지정합니다.
// 본문은 PrivacyContent와 푸터 모달에서 공유합니다.
// =============================================================
export default function PrivacyPage() {
  return (
    <div className="policy-shell">
      <header className="policy-top">
        <Link href="/" className="policy-home">📚 교사 개발자</Link>
      </header>
      <main className="policy-body">
        <PrivacyContent />
      </main>
      <SiteFooter />
    </div>
  );
}
