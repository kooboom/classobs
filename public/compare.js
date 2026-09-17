// 비교 화면
// - 5초마다 폴링해서 새 제출을 반영한다 (WebSocket 쓰지 않음)
// - 제출한 사람만 비교한다. 빈 점수는 —, 평균·범위·일치율에서 뺀다
// - 점 그래프·일치율은 원점수. NC 역산은 매트릭스 표기와 영역 평균에서만

const params = new URLSearchParams(location.search);
const CODE = params.get('code') || '';
const NAME = params.get('name') || '';
if (!/^[0-9]{4}$/.test(CODE)) {
    location.replace('./');
    throw new Error('code missing');
}

const POLL_MS = 5000;
const $ = (id) => document.getElementById(id);

// 사람 색 — 검증된 범주형 팔레트 순서(dataviz 기본값). 색만으로 사람을 구분하지 않도록
// 점·칩에는 항상 번호를 함께 쓴다. ink: 그 색 위에 올릴 번호 글자색
const PERSON_COLORS = [
    { fill: '#2a78d6', ink: '#fff' },
    { fill: '#eb6834', ink: '#111' },
    { fill: '#1baf7a', ink: '#111' },
    { fill: '#eda100', ink: '#111' },
    { fill: '#e87ba4', ink: '#111' },
    { fill: '#008300', ink: '#fff' },
    { fill: '#4a3aa7', ink: '#fff' },
    { fill: '#e34948', ink: '#fff' },
];
const colorOf = (p) => PERSON_COLORS[p.slot % PERSON_COLORS.length];

const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmt1 = (n) => (n === null || n === undefined ? '—' : n.toFixed(1));
const fmt2 = (n) => (n === null || n === undefined ? '—' : n.toFixed(2));
const pct = (r) => (r === null ? '—' : `${Math.round(r * 100)}%`);

function chip(p) {
    const c = colorOf(p);
    return `<span class="chip" style="background:${c.fill};color:${c.ink}">${p.slot + 1}</span>`;
}
function personLabel(p) {
    return `${chip(p)}<span class="pname">${esc(p.name)}</span>${p.demo ? '<span class="demo-badge">가상</span>' : ''}`;
}
function rawWithReverse(dim, s) {
    if (s === null) return '—';
    return dim.reverse ? `${s} <small>(역산 ${8 - s})</small>` : String(s);
}

// ---------- 상태 ----------

let session = null;
let list = [];
let people = [];
let stats = [];
let selectedKey = null;
let lastJson = '';

// ---------- 그리기 ----------

function renderAll() {
    people = comparePeople(list);
    stats = DIMENSIONS.map((d) => dimStats(people, d));
    if (!selectedKey || !DIMENSIONS.some((d) => d.key === selectedKey)) {
        selectedKey = topSplit(stats, 1)[0]?.dim.key || null;
    }

    const demoCount = list.filter((p) => p.demo).length;
    $('counts').textContent = `${list.length}명 중 ${people.length}명 제출`;
    $('counts').title = demoCount ? `가상 학생 ${demoCount}명 포함` : '';

    renderLegend();
    renderSummary();
    renderDots();
    renderMatrix();
    renderEvidence();
    renderComments();
}

function renderLegend() {
    $('legend').innerHTML = people.length
        ? people.map((p) => `<span class="legend-item">${personLabel(p)}</span>`).join('')
        : '';
}

function renderSummary() {
    const body = $('sum-body');
    if (people.length < 2) {
        body.innerHTML = `<p class="empty">${people.length ? '두 명 이상 제출하면 일치율을 계산합니다.' : '아직 제출한 사람이 없습니다.'}</p>`;
        return;
    }
    const ag = agreement(people);
    const top = topSplit(stats, 3);
    body.innerHTML = `
        <div class="tile">
            <div class="tile-label">±1 이내 일치율</div>
            <div class="tile-value">${pct(ag.within1)}</div>
            <div class="tile-note">실제 CLASS 관찰자 인증 합격선은 80%</div>
            <div class="tile-sub">${ag.pairs}개 비교 (사람 쌍 × 차원, 빈 점수 제외)</div>
        </div>
        <div class="tile">
            <div class="tile-label">완전 일치율</div>
            <div class="tile-value">${pct(ag.exact)}</div>
            <div class="tile-sub">점수가 똑같은 비율</div>
        </div>
        <div class="tile tile-top">
            <div class="tile-label">가장 갈린 차원 Top 3</div>
            <ol>${top.map((s) => `
                <li><button type="button" class="linklike${dimClass(s.dim)}" data-select="${s.dim.key}">
                    <b>${s.dim.key}</b> ${esc(s.dim.name)}</button> <span class="muted">폭 ${s.range}</span></li>`).join('')}
            </ol>
        </div>`;
}

function dimClass(dim) {
    return dim.reverse ? ' rev-text' : '';
}

// 점 그래프 한 줄의 SVG. 1~7 축, 같은 점수는 위로 쌓는다
const DOT = { W: 420, left: 24, step: 62, r: 9, gap: 20 };
const xOf = (v) => DOT.left + (v - 1) * DOT.step;

function dotSvg(st) {
    const byScore = new Map();
    for (const v of st.values) {
        if (!byScore.has(v.s)) byScore.set(v.s, []);
        byScore.get(v.s).push(v);
    }
    const stack = Math.max(1, ...[...byScore.values()].map((a) => a.length));
    const axisY = 6 + stack * DOT.gap;
    const nc = st.dim.reverse;
    const H = axisY + (nc ? 34 : 20);

    const parts = [];
    // 구간 경계 (1–2 / 3–5 / 6–7)
    for (const b of [2.5, 5.5]) {
        parts.push(`<line class="band-line" x1="${xOf(b)}" x2="${xOf(b)}" y1="2" y2="${axisY}"/>`);
    }
    parts.push(`<line class="axis" x1="${xOf(1) - 12}" x2="${xOf(7) + 12}" y1="${axisY}" y2="${axisY}"/>`);
    for (let k = 1; k <= 7; k++) {
        parts.push(`<line class="tick" x1="${xOf(k)}" x2="${xOf(k)}" y1="${axisY}" y2="${axisY + 4}"/>`);
        parts.push(`<text class="tick-label" x="${xOf(k)}" y="${axisY + 15}">${k}</text>`);
    }
    if (nc) {
        parts.push(`<text class="nc-good" x="${xOf(1) - 12}" y="${axisY + 30}">← 왼쪽이 좋음</text>`);
        parts.push(`<text class="nc-raw" x="${xOf(7) + 12}" y="${axisY + 30}">원점수</text>`);
    }
    if (st.mean !== null) {
        parts.push(`<line class="mean-mark" x1="${xOf(st.mean)}" x2="${xOf(st.mean)}" y1="${axisY - 5}" y2="${axisY + 5}"><title>평균 ${fmt1(st.mean)}</title></line>`);
    }
    for (const [s, group] of byScore) {
        group.sort((a, b) => a.person.slot - b.person.slot);
        group.forEach((v, i) => {
            const c = colorOf(v.person);
            const cx = xOf(s);
            const cy = axisY - DOT.gap / 2 - 1 - i * DOT.gap;
            const tip = `${v.person.slot + 1} ${v.person.name}${v.person.demo ? ' (가상)' : ''} — ${s}점`;
            parts.push(`<g class="dot" data-tip="${esc(tip)}">
                <circle class="hit" cx="${cx}" cy="${cy}" r="${DOT.r + 3}"/>
                <circle cx="${cx}" cy="${cy}" r="${DOT.r}" fill="${c.fill}" stroke="#fff" stroke-width="2"/>
                <text x="${cx}" y="${cy + 4}" fill="${c.ink}">${v.person.slot + 1}</text>
            </g>`);
        });
    }
    return `<svg viewBox="0 0 ${DOT.W} ${H}" role="img" aria-label="${esc(st.dim.name)} 점수 분포">${parts.join('')}</svg>`;
}

function renderDots() {
    const body = $('dots-body');
    if (!people.length) {
        body.innerHTML = '<p class="empty">제출이 들어오면 그려집니다.</p>';
        return;
    }
    body.innerHTML = sortBySplit(stats).map((st) => `
        <div class="dot-row${st.dim.reverse ? ' rev' : ''}${st.dim.key === selectedKey ? ' sel' : ''}" data-select="${st.dim.key}" role="button" tabindex="0"
             aria-label="${st.dim.key} ${esc(st.dim.name)} 근거 보기">
            <div class="dot-label"><span class="abbr">${st.dim.key}</span><span>${esc(st.dim.name)}</span></div>
            ${dotSvg(st)}
            <div class="dot-stats">
                <span>평균 <b>${fmt1(st.mean)}</b></span>
                <span>폭 <b>${st.range === null ? '—' : st.range}</b></span>
            </div>
        </div>`).join('');
}

function renderMatrix() {
    const table = $('mx-body');
    if (!people.length) {
        table.innerHTML = '<tbody><tr><td class="empty">제출이 들어오면 채워집니다.</td></tr></tbody>';
        return;
    }
    const head = `<thead><tr><th class="mx-dim">차원</th>${people.map((p) => `<th class="mx-person">${personLabel(p)}</th>`).join('')}
        <th class="mx-stat">평균</th><th class="mx-stat">범위</th><th class="mx-stat">폭</th></tr></thead>`;

    const rows = stats.map((st) => {
        const cells = people.map((p) => {
            const s = scoreOf(p, st.dim.key);
            return `<td class="mx-cell${s === null ? ' blank' : ` ${scoreBand(s)}`}">${rawWithReverse(st.dim, s)}</td>`;
        }).join('');
        const mean = st.mean === null ? '—' : st.dim.reverse ? `${fmt1(st.mean)} <small>(역산 ${fmt1(8 - st.mean)})</small>` : fmt1(st.mean);
        return `<tr class="mx-row${st.dim.reverse ? ' rev' : ''}${st.dim.key === selectedKey ? ' sel' : ''}" data-select="${st.dim.key}" tabindex="0">
            <th class="mx-dim"><span class="abbr">${st.dim.key}</span> ${esc(st.dim.name)}</th>${cells}
            <td class="mx-stat">${mean}</td>
            <td class="mx-stat">${st.n ? `${st.min}–${st.max}` : '—'}</td>
            <td class="mx-stat">${st.range === null ? '—' : st.range}</td></tr>`;
    }).join('');

    // 영역 평균 3행 — 사람별 평균(NC 역산, 빈 점수 제외), 오른쪽은 그 평균들의 평균·범위·폭
    const perPerson = people.map((p) => personDomains(p));
    const domainRows = DOMAINS.map((domain, di) => {
        const avgs = perPerson.map((d) => d[di]);
        const vals = avgs.filter((a) => a.avg !== null).map((a) => a.avg);
        const mean = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
        const min = vals.length ? Math.min(...vals) : null;
        const max = vals.length ? Math.max(...vals) : null;
        const cells = avgs.map((a) => `<td class="mx-cell dom-cell">${fmt2(a.avg)}${a.avg !== null && a.n < a.total ? ` <small>(${a.n}/${a.total})</small>` : ''}</td>`).join('');
        return `<tr class="mx-domain"><th class="mx-dim">${esc(domain.name)} 평균${domain.key === 'ES' ? ' <small>NC 역산</small>' : ''}</th>${cells}
            <td class="mx-stat">${fmt2(mean)}</td>
            <td class="mx-stat">${vals.length ? `${fmt2(min)}–${fmt2(max)}` : '—'}</td>
            <td class="mx-stat">${vals.length >= 2 ? fmt2(max - min) : '—'}</td></tr>`;
    }).join('');

    table.innerHTML = `${head}<tbody>${rows}</tbody><tfoot>${domainRows}</tfoot>`;
}

function evidenceHtml(text) {
    if (!text) return '<span class="muted">(근거 없음)</span>';
    return splitEvidence(text).map((part) => (part.stamp
        ? `<button type="button" class="stamp-link" data-seek="${part.seconds}" title="영상을 이 지점으로">${esc(part.stamp)}</button>`
        : esc(part.text))).join('');
}

function renderEvidence() {
    const body = $('ev-body');
    const dim = DIMENSIONS.find((d) => d.key === selectedKey);
    if (!dim) {
        body.innerHTML = `<p class="empty">${people.length ? '차원을 누르면 근거가 점수 낮은 순으로 나옵니다.' : '아직 제출한 사람이 없습니다.'}</p>`;
        return;
    }
    const st = stats.find((s) => s.dim.key === dim.key);
    // 점수 오름차순. 점수는 없고 근거만 있는 사람은 맨 아래
    const items = people
        .map((p) => ({ p, s: scoreOf(p, dim.key), ev: p.scores?.[dim.key]?.ev || '' }))
        .filter((it) => it.s !== null || it.ev)
        .sort((a, b) => (a.s ?? 99) - (b.s ?? 99) || a.p.slot - b.p.slot);

    body.innerHTML = `
        <div class="ev-head${dim.reverse ? ' rev' : ''}">
            <span class="abbr">${dim.key}</span> <b>${esc(dim.name)}</b>
            <span class="muted">평균 ${fmt1(st.mean)} · 폭 ${st.range === null ? '—' : st.range}${dim.reverse ? ' · 원점수, 낮을수록 좋음' : ''}</span>
        </div>
        ${items.length ? `<ol class="ev-list">${items.map((it) => `
            <li>
                <span class="ev-score">${it.s === null ? '—' : `${it.s}점`}${dim.reverse && it.s !== null ? ` <small>(역산 ${8 - it.s})</small>` : ''}</span>
                <span class="ev-who">${personLabel(it.p)}</span>
                <span class="ev-text">${evidenceHtml(it.ev)}</span>
            </li>`).join('')}</ol>` : '<p class="empty">이 차원에 점수나 근거를 낸 사람이 없습니다.</p>'}`;
}

function renderComments() {
    const body = $('cm-body');
    const withComment = people.filter((p) => (p.comment || '').trim());
    if (!withComment.length) {
        body.innerHTML = `<p class="empty">${people.length ? '종합 의견을 적은 사람이 없습니다.' : '아직 제출한 사람이 없습니다.'}</p>`;
        return;
    }
    body.innerHTML = withComment.map((p) => `
        <article class="card">
            <header>${personLabel(p)}</header>
            <p>${esc(p.comment)}</p>
            ${(p.memo || '').trim() ? `<p class="memo-small"><b>관찰 메모</b> ${esc(p.memo)}</p>` : ''}
        </article>`).join('');
}

// ---------- 선택·툴팁 ----------

function select(key) {
    selectedKey = key;
    for (const el of document.querySelectorAll('[data-select].sel')) el.classList.remove('sel');
    for (const el of document.querySelectorAll(`.dot-row[data-select="${key}"], .mx-row[data-select="${key}"]`)) el.classList.add('sel');
    renderEvidence();
    // 좁은 창에서는 근거가 아래에 있으니 보이도록 옮겨 준다
    if (matchMedia('(max-width: 900px)').matches) $('evidence').scrollIntoView({ block: 'start' });
}

document.addEventListener('click', (e) => {
    const seek = e.target.closest('[data-seek]');
    if (seek) {
        Video.seek(Number(seek.dataset.seek));
        Video.play();
        return;
    }
    const target = e.target.closest('[data-select]');
    if (target) select(target.dataset.select);
});
document.addEventListener('keydown', (e) => {
    if ((e.key === 'Enter' || e.key === ' ') && e.target.matches?.('.dot-row, .mx-row')) {
        e.preventDefault();
        select(e.target.dataset.select);
    }
});

const tip = $('tip');
function showTip(text, x, y) {
    tip.textContent = text;
    tip.hidden = false;
    const w = tip.offsetWidth;
    tip.style.left = `${Math.min(window.innerWidth - w - 8, x + 12)}px`;
    tip.style.top = `${y - 34}px`;
}
$('dots-body').addEventListener('pointermove', (e) => {
    const dot = e.target.closest('.dot');
    if (dot) showTip(dot.dataset.tip, e.clientX, e.clientY);
    else tip.hidden = true;
});
$('dots-body').addEventListener('pointerleave', () => { tip.hidden = true; });

// ---------- 불러오기 ----------

function stamp(date = new Date()) {
    return date.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
}

async function loadSession() {
    try {
        const res = await fetch(`api/sessions/${CODE}`);
        if (res.status === 404) {
            $('counts').textContent = '없는 세션 코드입니다';
            playerUI.message('없는 세션 코드입니다.', true);
            return true;
        }
        if (!res.ok) return false;
        session = await res.json();
        $('title').textContent = session.title;
        document.title = `${session.title} · CLASS 비교`;
        playerUI.start(session.videoUrl);
        return true;
    } catch {
        return false;
    }
}

async function loadSubmissions() {
    try {
        const res = await fetch(`api/sessions/${CODE}/submissions`);
        if (!res.ok) throw new Error(res.status);
        const data = await res.json();
        const json = JSON.stringify(data);
        if (json !== lastJson) {
            lastJson = json;
            list = data;
            renderAll();
        }
        $('updated').textContent = `갱신 ${stamp()}`;
    } catch {
        $('updated').textContent = '갱신 실패 — 다시 시도 중';
    }
}

const playerUI = bindPlayerUI();

$('subtitle').textContent = `세션 ${CODE} · 5초마다 새 제출 반영`;
if (NAME) {
    $('back').href = `score.html?code=${CODE}&name=${encodeURIComponent(NAME)}`;
    $('back').hidden = false;
}

(async function start() {
    renderAll();
    let sessionLoaded = await loadSession();
    await loadSubmissions();
    setInterval(async () => {
        if (!sessionLoaded) sessionLoaded = await loadSession();
        loadSubmissions();
    }, POLL_MS);
})();

// ---------- 데모 ----------

async function demo(method) {
    const state = $('demo-state');
    state.textContent = '처리 중…';
    try {
        const duration = Video.duration();
        const res = await fetch(`api/sessions/${CODE}/demo`, {
            method,
            headers: { 'Content-Type': 'application/json' },
            body: method === 'POST' ? JSON.stringify({ maxSeconds: duration || undefined }) : undefined,
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || res.status);
        state.textContent = method === 'POST' ? `가상 학생 ${data.created.length}명을 만들었습니다.` : `가상 학생 ${data.removed}명을 지웠습니다.`;
        await loadSubmissions();
    } catch (err) {
        state.textContent = `실패: ${err.message}`;
    }
}
$('demo-add').addEventListener('click', () => demo('POST'));
$('demo-clear').addEventListener('click', () => demo('DELETE'));
