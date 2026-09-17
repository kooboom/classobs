# classobs — CLASS 관찰 실습 앱

대학원 「수업행동분석론」 CLASS 관찰 실습용. 학생이 유튜브 수업 영상을 보며 10개 차원을 채점하면,
같은 세션의 모두가 각자 노트북에서 같은 비교 화면을 보고 "어디서 왜 갈렸는지" 토론한다.

- 주소: `https://app.koowoo.kr/classobs/`
- 구성: Node 18 + Express, 데이터는 JSON 파일(`data/`), 프런트는 바닐라 JS. 포트 **3003** (3002는 class-quiz)
- 설계 문서: [SPEC.md](SPEC.md)

---

## 수업 전 점검 (한 줄)

```bash
curl -s https://app.koowoo.kr/classobs/api/health
```

`{"ok":true}` 가 나오면 된다. Apache와 Node를 한 번에 거쳐 확인하는 명령이다.
그 밖의 것(HTML 오류 페이지, `Service Unavailable` 등)이 나오거나 아무 응답이 없으면 [문제 해결](#문제-해결)로. **수업 당일 오후에 한 번** 돌려 볼 것.

---

## 수업에서 쓰기

### 1. 세션 만들기 — 회차마다 하나

1. `https://app.koowoo.kr/classobs/new` 를 연다 (비밀번호 없음)
2. 제목(예: `2026-2학기 4주차`)과 유튜브 영상 주소를 넣고 **세션 만들기**
3. 화면에 크게 나온 **4자리 코드**를 칠판에 적는다

아래 "기존 세션" 목록에서 지난 세션의 제출 인원과 비교 화면을 다시 열 수 있다.
영상을 바꾸려면 새 세션을 만들면 된다(파일을 고칠 일이 없다).

### 2. 학생에게 알려줄 것

칠판에 두 줄:

```
app.koowoo.kr/classobs
코드 1234
```

학생은 주소로 들어가 코드와 이름을 넣고 입장한다. 같은 이름으로 다시 들어오면 이어서 쓰고, 다시 제출하면 덮어쓴다.
(링크로 보낼 때는 `https://app.koowoo.kr/classobs/?code=1234` 처럼 코드를 붙이면 코드 칸이 미리 채워진다.)

### 3. 비교·토론

- 학생이 제출하면 자동으로 비교 화면으로 넘어간다. 5초마다 새 제출이 반영된다
- 교수자 화면: `/classobs/new` 목록의 **비교 화면** 링크
- 리허설·시연: 비교 화면 맨 아래 **가상 학생 5명으로 데모** / **가상 데이터 지우기** (실제 학생 기록은 건드리지 않는다)

### 4. 토론 기록지 인쇄

비교 화면에서 `Ctrl+P` (Mac `⌘P`) → 용지 **A4**. 영상·버튼은 빠지고
요약 → 점 그래프 → 레이더 → 매트릭스 → 10개 차원 근거 전부 → 종합 의견 순으로 인쇄된다.
색이 빠져 보이면 인쇄 대화상자에서 **배경 그래픽**을 켠다.

---

## 서버에 처음 올리기

### 준비물 (서버에 한 번)

```bash
node --version          # v18 이상
npm install -g pm2      # 이미 있으면 생략 (pm2 --version 으로 확인)
```

### 1. 파일 두기

앱 폴더는 **`/home/app/public_html/classobs`** 다. 같은 서버의 `/class` 퀴즈(`/home/app/public_html/class`)와 같은 자리에 둔다.

```bash
cd /home/app/public_html
git clone https://github.com/kooboom/classobs.git
cd /home/app/public_html/classobs
```

- `data/` 폴더는 저장소에 없다. 첫 세션을 만들 때 자동으로 생긴다
- **root 가 아닌, pm2 를 돌릴 계정으로** 받는다. 폴더 주인이 달라지면 `data/` 에 쓰지 못한다

> ⚠ **이 위치는 Apache 문서 루트(`public_html`) 안이다.** 프록시가 잡히지 않는 곳에서는 Apache가 이 폴더를
> 파일 그대로 내보낸다 — `public/` 만이 아니라 **`data/`(학생 이름·점수·근거), `.git/`, `server.js`, `node_modules/` 전부**.
> 반드시 [Apache 연결](#apache-연결)의 **2단계(폴더 직접 접근 막기)**까지 한다.

### 2. 의존성 설치

```bash
cd /home/app/public_html/classobs
npm ci --omit=dev
```

`package-lock.json` 그대로 설치한다. 프런트는 설치할 것이 없다.

### 3. 시험 실행 (선택, 10초)

```bash
node server.js
# 다른 터미널에서:
curl -s http://127.0.0.1:3003/classobs/api/health     # {"ok":true}
# 확인했으면 Ctrl+C 로 끈다
```

### 4. pm2 로 등록

```bash
cd /home/app/public_html/classobs
pm2 start server.js --name classobs
pm2 save
```

`pm2 status` 에서 `classobs` 가 `online` 이면 된다.
**여기서 멈추면 안 된다.** 이 상태로는 서버가 재부팅되면 앱이 다시 뜨지 않는다. 바로 다음 절을 한다.

---

## 자동 시작 설정 — 반드시

> 같은 서버의 `/class` 는 이 설정이 없어서 재부팅 뒤 **10개월 동안 죽어 있었다.**
> 아래 세 단계를 전부 해야 한다. 특히 2번을 빼먹기 쉽다.

**1. startup 명령을 만든다** (pm2 를 돌리는 그 계정으로, `sudo` 없이)

```bash
pm2 startup
```

**2. 출력 마지막 줄에 나온 `sudo ...` 명령을 복사해 그대로 실행한다.**
`pm2 startup` 자체는 아무것도 설치하지 않는다. 이런 모양의 줄을 출력만 한다:

```
sudo env PATH=$PATH:/usr/bin /usr/lib/node_modules/pm2/bin/pm2 startup systemd -u app --hp /home/app
```

이 줄을 실행해야 systemd 서비스(`pm2-계정이름`)가 등록된다. 경로·계정 이름은 서버마다 다르니 **예시를 치지 말고 출력된 줄을 복사**한다.

**3. 지금 돌고 있는 목록을 저장한다** (재부팅 때 이 목록을 되살린다)

```bash
pm2 save
```

### 확인

```bash
systemctl is-enabled pm2-$USER      # enabled 가 나와야 한다
```

가능하면 **실제로 재부팅해서** 확인한다. 이것이 유일하게 확실한 시험이다.

```bash
sudo reboot
# 다시 접속한 뒤
pm2 status                                        # classobs 가 online
curl -s https://app.koowoo.kr/classobs/api/health # {"ok":true}
```

재부팅할 수 없는 서버라면 최소한 `systemctl is-enabled` 가 `enabled` 인지는 꼭 본다.

### 나중에 주의할 것

- pm2 목록을 바꿨으면(앱 추가·삭제) 다시 `pm2 save`
- **Node 를 업그레이드하면** pm2 경로가 바뀌어 자동 시작이 깨질 수 있다. `pm2 unstartup` → `pm2 startup` → 출력된 `sudo` 줄 실행 → `pm2 save` 를 다시 한다

---

## Apache 연결

두 가지를 건다. **둘 다 해야 한다.**

1. **프록시** — `app.koowoo.kr/classobs` 전체를 Node 로 넘긴다 ([`deploy/apache-classobs.conf`](deploy/apache-classobs.conf))
2. **폴더 직접 접근 막기** — 앱 폴더가 문서 루트 안에 있으므로, 프록시가 빠진 곳에서 Apache가 폴더를 파일로 내보내지 못하게 한다 ([`deploy/apache-classobs-deny.conf`](deploy/apache-classobs-deny.conf))

Node 는 `127.0.0.1` 에서만 받으므로 **3003 포트를 방화벽에 열지 않는다.**

### 1단계: 프록시

```bash
# 프록시 모듈 (이미 켜져 있으면 "already enabled")
sudo a2enmod proxy proxy_http

# 설정 파일 복사
sudo cp /home/app/public_html/classobs/deploy/apache-classobs.conf /etc/apache2/conf-available/classobs.conf

# app.koowoo.kr 의 VirtualHost 파일을 찾는다
grep -rl "app.koowoo.kr" /etc/apache2/sites-enabled/
```

찾은 파일의 `<VirtualHost *:443>` 블록 안에 한 줄을 넣는다 (80 블록이 리다이렉트만 하지 않고 직접 서비스한다면 그 블록에도):

```apache
Include conf-available/classobs.conf
```

- 같은 블록에 `ProxyPass /` 처럼 **전체를 넘기는 줄이 있으면 그보다 위에** 넣는다. 위에 있는 규칙이 먼저 적용된다
- `/class` 의 ProxyPass 가 이미 있다면 그 근처에 두면 된다

### 2단계: 폴더 직접 접근 막기

프록시는 Include 를 넣은 사이트에서만 동작한다. 80 포트 사이트, IP 로 들어오는 기본 사이트, 또는 프록시 모듈이 꺼진 경우에는
`https://…/classobs/data/submissions/1234.json` 같은 주소로 **학생 기록이 그대로 내려간다.**
이 설정은 VirtualHost 안이 아니라 **서버 전체**에 건다. 그래야 Include 를 빠뜨린 사이트까지 막힌다.

```bash
sudo cp /home/app/public_html/classobs/deploy/apache-classobs-deny.conf /etc/apache2/conf-available/classobs-deny.conf
sudo a2enconf classobs-deny
```

폴더 직접 접근만 막고 프록시 요청은 막지 않으므로 앱은 그대로 동작한다.
저장소 맨 위의 `.htaccess`(`Require all denied`)는 예비 장치다. 서버가 `.htaccess` 를 무시하게(`AllowOverride None`) 되어 있으면 효과가 없으니, 이 2단계를 대신하지 못한다.

앱 폴더를 옮기면 `classobs-deny.conf` 안의 경로도 같이 바꾼다.

### 반영과 확인

```bash
# 문법 확인 후 반영 (restart 가 아니라 reload — 다른 사이트가 끊기지 않는다)
sudo apachectl configtest        # Syntax OK
sudo systemctl reload apache2

# 앱이 뜨는지
curl -s https://app.koowoo.kr/classobs/api/health    # {"ok":true}

# 폴더가 막혔는지 — 프록시를 거치지 않는 기본 사이트로, 반드시 존재하는 파일을 요청한다
curl -s -o /dev/null -w "%{http_code}\n" -H "Host: classobs-check.invalid" http://127.0.0.1/classobs/package.json
```

마지막 명령의 결과:

| 코드 | 뜻 |
|---|---|
| `403` | 막힘 (정상) |
| `404` | 이 요청이 프록시로 가서 Node 가 답함 (정상). 2단계를 했는지는 `ls /etc/apache2/conf-enabled/ \| grep classobs-deny` 로 따로 확인 |
| `301`/`302` | 80 포트가 https 로 넘기도록 되어 있음. `curl -sk … https://127.0.0.1/classobs/package.json` 으로 한 번 더 |
| **`200`** | **노출됨.** 2단계가 적용되지 않은 것. 바로 고친다 |

없는 파일을 요청하면 막히지 않았어도 `404` 가 나와 안전해 보이므로, 항상 있는 `package.json` 으로 확인한다.

CentOS/RHEL(httpd) 이면: 프록시 모듈은 기본으로 켜져 있고, 두 파일 모두 `/etc/httpd/conf.d/` 에 두면 된다(그곳은 서버 전체 설정이다 — 프록시 파일만 VirtualHost 안에 `Include` 한다). `sudo systemctl reload httpd`.

---

## 고친 코드를 반영하기

```bash
cd /home/app/public_html/classobs
git pull
npm ci --omit=dev
pm2 restart classobs
curl -s https://app.koowoo.kr/classobs/api/health
```

`git pull` 은 `data/` 를 건드리지 않는다(저장소에 없는 폴더). 수업 중에는 반영하지 않는다.

---

## 데이터와 백업

모든 기록은 `data/` 폴더의 JSON 파일이다.

```
data/sessions.json               세션 목록 (코드·제목·영상 주소·만든 시각)
data/submissions/{코드}.json     그 세션의 제출
```

학기가 끝나면 폴더째 복사해 두면 된다.

```bash
cp -r /home/app/public_html/classobs/data ~/classobs-data-$(date +%Y%m%d)
```

---

## 문제 해결

| 증상 | 확인 | 조치 |
|---|---|---|
| 점검 명령에 `{"ok":true}` 대신 오류 페이지(`503` 등) | `pm2 status` | `classobs` 가 없거나 `stopped` → `pm2 start classobs` (목록에 없으면 [pm2 로 등록](#4-pm2-로-등록)부터) |
| `pm2 status` 는 online 인데 `502` | `curl -s http://127.0.0.1:3003/classobs/api/health` | 이건 되는데 바깥 주소만 안 되면 Apache 설정 문제 → [Apache 연결](#apache-연결) 다시 확인 |
| 앱이 계속 재시작됨 | `pm2 logs classobs --lines 50` | `EADDRINUSE` 면 3003 을 다른 프로그램이 쓰는 중: `sudo lsof -i :3003` |
| 재부팅 후 안 뜸 | `systemctl is-enabled pm2-$USER` | `enabled` 가 아니면 [자동 시작 설정](#자동-시작-설정--반드시)의 2번(sudo 줄)을 안 한 것 |
| 세션을 만들 때 "서버 오류" | `pm2 logs classobs` | `EACCES` 면 `data/` 쓰기 권한 문제 → 폴더 주인을 pm2 계정으로 |
| 폴더 확인 명령이 `200` | `ls /etc/apache2/conf-enabled/ \| grep classobs-deny` | 없으면 [2단계](#2단계-폴더-직접-접근-막기)를 안 한 것. 있는데도 `200` 이면 VirtualHost 에 `<Location>` 으로 전체 허용하는 설정이 있는지 확인 |
| 학생 화면에 "임베드가 막혀 있습니다" | — | 영상 주인이 외부 재생을 막은 것. 다른 영상으로 새 세션을 만들거나 프로젝터 화면을 보게 한다 |

설정값(보통 바꿀 일 없음): `PORT`(기본 3003 — 바꾸면 Apache 설정도 같이), `CLASSOBS_DATA_DIR`(기본 `./data`).

---

## 알려진 한계

- **서버가 죽었을 때의 비상 경로(SPEC 6절)는 아직 없다.** 연결 상태 표시와 결과 코드 붙여넣기 비교는 배포 후 실제로 돌려 본 다음 만든다.
  그때까지는 서버가 죽으면 학생 입력은 각자 브라우저에 남지만 비교 화면은 볼 수 없다. 그래서 수업 전 점검이 중요하다.

---

## 내 컴퓨터에서 실행 (개발)

```bash
npm install
npm start
# http://localhost:3003/classobs/     입장
# http://localhost:3003/classobs/new  세션 만들기
```
