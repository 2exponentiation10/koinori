# 주일 룸 예약 서비스

주일 룸 예약을 서버에 바로 배포할 수 있게 만든 최소 기능 MVP입니다.

기능:

- 주일 날짜만 예약 가능
- 매주 목요일 오전 10시 이후에만 예약 오픈
- 최소 예약 인원 4명 검증
- 5타임 고정 사용 처리
- 남는 방이 있으면 자동 배정, 없으면 자동 대기 등록
- 운영자 페이지에서 취소 시 대기 1순위 자동 승격
- SQLite 파일 기반 저장
- 관리자 로그인 쿠키 인증
- Docker/Compose 배포 파일 포함
- GitHub Actions 자동배포 워크플로 포함
- 모바일 전용 화면 구성
- `/opt/protfolio/*` 경로 규칙과 배포 구조 정렬

## 실행

```bash
npm install
npm run dev
```

기본 주소는 `http://localhost:3000`입니다.

환경 변수 예시는 `.env.example`에 있습니다.

## 관리자 페이지

관리자 페이지는 `http://localhost:3000/admin` 입니다.

배포 시 운영 화면을 보호하려면 환경 변수를 설정하세요.

```bash
ADMIN_KEY=your-secret-key npm start
```

설정 후 `/admin/login`에서 관리자 키를 입력하면 쿠키로 로그인됩니다.

## 배포

단일 Node 서버면 바로 올릴 수 있습니다.

```bash
npm ci
PORT=3000 HOST_PORT=7085 ADMIN_KEY=your-secret-key TRUST_PROXY=1 COOKIE_SECURE=1 npm start
```

리버스 프록시(Nginx 등) 뒤에 붙이면 운영하기 쉽습니다.

### Docker

```bash
docker build -t koinori .
docker run -d \
  --name koinori \
  -p 7085:3000 \
  -e ADMIN_KEY=your-secret-key \
  -e TRUST_PROXY=1 \
  -e COOKIE_SECURE=1 \
  -v $(pwd)/data:/app/data \
  koinori
```

또는 `docker-compose.yml`을 그대로 사용해도 됩니다.

```bash
docker compose up -d --build
```

### Nginx

중앙 프록시(`/opt/protfolio/satoori`의 nginx 컨테이너)에 넣을 예시 설정은 `deploy/nginx/koinori.conf`에 넣어두었습니다.

HTTPS 뒤에 둘 경우:

- Nginx에서 SSL 종료
- 앱에는 `TRUST_PROXY=1`
- 쿠키 보안을 위해 `COOKIE_SECURE=1`
- 앱 포트는 `7085`

## GitHub 자동배포

`main` 또는 `master` 브랜치에 push 되면 `.github/workflows/deploy.yml`이 실행되어 서버로 배포되도록 구성했습니다.

배포 방식은 다른 프로젝트들과 동일하게 repo 전용 self-hosted runner를 서버에 붙여서 사용합니다.

필요한 GitHub Actions Secrets/Variables:

- Secret `ADMIN_KEY`: 관리자 로그인 키
- Variable `KOINORI_APP_PORT`: 앱 포트. 기본값 `7085`

배포 흐름:

1. GitHub Actions가 `npm ci`와 `npm run verify`를 실행합니다.
2. self-hosted runner가 서버 작업 디렉터리에서 코드를 검증합니다.
3. `scripts/deploy_koinori.sh`가 `/opt/protfolio/koinori`로 소스를 동기화합니다.
4. `docker compose up -d --build`로 컨테이너를 재배포합니다.
5. 마지막으로 `http://127.0.0.1:7085/health`를 확인합니다.

서버에 한 번만 준비할 것:

```bash
sudo mkdir -p /opt/protfolio/koinori/data
sudo chown -R $USER:$USER /opt/protfolio/koinori
docker --version
docker compose version
```

현재 워크플로 기본값:

- 앱 경로: `/opt/protfolio/koinori`
- 앱 포트: `7085`
- 공개 도메인: `koinori.protfolio.store`
- Docker Compose 파일: `docker-compose.yml`
- 런타임 데이터 경로: `/opt/protfolio/koinori/data`

## 화면 구성

- 공개 화면: 모바일 전용 예약 화면, 타임별 현황, 예약 폼, 하단 빠른 이동
- 운영 화면: 모바일 전용 운영 화면, 운영 요약, 카드형 예약 관리, 대기 명단
