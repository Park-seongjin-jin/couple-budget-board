# 성진 & 소원 머니보드

월급, 생활비, 적금, VOO, 주식투자, 월별 리포트, 기사 게시물과 댓글을 기록하는 웹 기반 보드입니다.

## 인터넷에 올리는 구조

성진 맥이 꺼져도 소원이가 접속하려면 아래처럼 씁니다.

```text
화면 배포: Vercel 또는 Netlify
데이터 저장: Supabase
접속 방식: 둘 다 같은 웹주소로 접속
```

## Supabase 설정

Supabase에서 새 프로젝트를 만들고 SQL Editor에 들어가서 `supabase.sql` 내용을 실행합니다.

그 다음 `Project Settings > API`에서 아래 두 값을 복사해 `supabase-config.js`에 넣습니다.

```js
window.MONEY_BOARD_SUPABASE = {
  url: "https://YOUR_PROJECT_ID.supabase.co",
  anonKey: "YOUR_SUPABASE_ANON_KEY",
  boardId: "seongjin-sowon",
};
```

## 배포

Vercel이나 Netlify에서 이 폴더를 배포하면 됩니다.

```text
/Users/seongjin/Documents/Development/Xcode/couple-budget-board
```

배포 후 생기는 주소를 소원이에게 보내면 됩니다.

```text
https://your-site.vercel.app
```

## 혼자 미리 보기

`index.html`을 브라우저로 열면 로컬 저장으로 동작합니다.

```text
/Users/seongjin/Documents/Development/Xcode/couple-budget-board/index.html
```

## 참고

현재 Supabase 정책은 둘만 쓰는 빠른 MVP용입니다. 주소와 키를 아는 사람이 접근할 수 있으므로, 완전한 비공개 앱으로 쓰려면 다음 단계에서 이메일 로그인과 사용자별 권한을 추가하는 편이 좋습니다.
