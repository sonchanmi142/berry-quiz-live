# RADIQ Live V3

방사선학과용 실시간 퀴즈 앱입니다.

## 추가된 기능
- Supabase 데이터베이스에 문제 영구 저장
- Supabase Storage에 문제 이미지 영구 저장
- 제한시간 종료 후 진행자와 참가자 화면에 정답 공개
- 남은 시간을 큰 숫자로 표시
- 10초 이하에서 숫자와 진행 막대가 빨간색으로 변경
- 앱 이름을 RADIQ Live로 변경
- QR 공개 입장, 최대 40명, 속도 점수, 최종 순위

## Supabase 설정
1. Supabase에서 새 프로젝트를 만듭니다.
2. SQL Editor에 `supabase/setup.sql` 내용을 붙여넣고 실행합니다.
3. Storage에서 public bucket을 만듭니다.
   - 이름: `question-images`
   - Public bucket: 켜기
4. Project Settings > API에서 Project URL과 service_role key를 확인합니다.

service_role 키는 GitHub에 직접 올리지 마세요.

## Render 환경변수
Render 서비스의 Environment 메뉴에 다음을 추가합니다.
- `SUPABASE_URL`: Supabase Project URL
- `SUPABASE_SERVICE_ROLE_KEY`: Supabase service_role key
- `SUPABASE_IMAGE_BUCKET`: `question-images`

저장 후 Manual Deploy > Deploy latest commit을 실행합니다.
