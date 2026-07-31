# Berry Quiz Live V2

## 새 기능
- 인터넷만 되면 어디서든 QR로 입장 가능한 배포형 구조
- 진행자가 입력창으로 문제와 선택지 A~D 작성
- 선택지 2~4개 사용 가능
- 문제 위 이미지 업로드
- 참가자가 휴대폰에서 큰 버튼으로 답변
- 정답 속도에 따른 점수
- 최대 40명
- 최종 전체 순위

## 컴퓨터에서 실행
```powershell
npm.cmd install
npm.cmd start
```
브라우저에서 http://localhost:3000

## 다른 와이파이·모바일 데이터에서도 접속시키기
이 앱은 컴퓨터에서만 실행하면 외부 접속이 되지 않습니다.
Render, Railway 같은 Node.js 호스팅에 배포해 공개 HTTPS 주소를 받아야 합니다.

### Render 배포 순서
1. 이 폴더를 GitHub 저장소에 업로드
2. Render에서 New Web Service 선택
3. 저장소 연결
4. Build Command: npm install
5. Start Command: npm start
6. 배포 후 받은 https 주소로 접속
7. 그 주소에서 퀴즈방을 만들면 QR도 공개 주소로 생성됨

## 주의
현재 문제는 data/questions.json에 저장됩니다.
일부 무료 호스팅은 재배포 또는 재시작 시 작성한 문제가 초기화될 수 있습니다.
행사 전에 문제를 모두 만든 뒤 data/questions.json 파일까지 GitHub에 반영하는 방식이 가장 안전합니다.
