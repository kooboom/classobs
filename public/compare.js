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
let focusSlot = null; // 레이더에서 강조한 사람 (slot). null 이면 모두 같게
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
    renderRadar();
    renderMatrix();
    renderEvidence();
    renderPrintEvidence();
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

// ---------- (3) 레이더 ----------
// 꼭짓점 10개, 사람마다 선 하나. 1~7점을 중심에서 바깥으로(1점도 중심에 뭉치지 않게 v/7 비율).
// 빈 점수는 radarRuns 로 선을 끊는다.
const RADAR = { W: 560, H: 470, cx: 280, cy: 232, R: 168 };

function radarPoint(i, v) {
    const angle = -Math.PI / 2 + (i * 2 * Math.PI) / DIMENSIONS.length;
    const r = (v / 7) * RADAR.R;
    return [RADAR.cx + r * Math.cos(angle), RADAR.cy + r * Math.sin(angle)];
}
const pt = ([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`;

function renderRadar() {
    const chart = $('rd-chart');
    const legend = $('rd-legend');
    if (!people.length) {
        chart.innerHTML = '<p class="empty">제출이 들어오면 그려집니다.</p>';
        legend.innerHTML = '';
        return;
    }
    if (focusSlot !== null && !people.some((p) => p.slot === focusSlot)) focusSlot = null;

    const n = DIMENSIONS.length;
    const parts = [];

    // 눈금 고리 1~7 (7은 조금 진하게) + 바퀴살
    for (let v = 1; v <= 7; v++) {
        const ring = DIMENSIONS.map((_, i) => pt(radarPoint(i, v))).join(' ');
        parts.push(`<polygon class="ring${v === 7 ? ' outer' : ''}" points="${ring}"/>`);
    }
    for (const v of [1, 3, 5, 7]) {
        const [x, y] = radarPoint(0, v);
        parts.push(`<text class="ring-label" x="${x + 4}" y="${y + 4}">${v}</text>`);
    }
    DIMENSIONS.forEach((dim, i) => {
        const [x, y] = radarPoint(i, 7);
        parts.push(`<line class="spoke${dim.key === selectedKey ? ' sel' : ''}" x1="${RADAR.cx}" y1="${RADAR.cy}" x2="${x.toFixed(1)}" y2="${y.toFixed(1)}"/>`);
    });

    // 축 이름 — 누르면 그 차원의 근거
    DIMENSIONS.forEach((dim, i) => {
        const [x, y] = radarPoint(i, 7.95);
        const dx = x - RADAR.cx;
        const anchor = Math.abs(dx) < 8 ? 'middle' : dx > 0 ? 'start' : 'end';
        const label = dim.reverse ? 'NC(역산)' : dim.key;
        const cls = `axis-label${dim.reverse ? ' rev' : ''}${dim.key === selectedKey ? ' sel' : ''}`;
        const yTop = y < RADAR.cy - RADAR.R * 0.9 ? y - 14 : y > RADAR.cy + RADAR.R * 0.9 ? y + 4 : y - 5;
        parts.push(`<g class="${cls}" data-select="${dim.key}" role="button" tabindex="0" aria-label="${esc(dim.name)} 근거 보기">
            <text x="${x.toFixed(1)}" y="${yTop.toFixed(1)}" text-anchor="${anchor}"><tspan class="ab">${label}</tspan><tspan class="nm" x="${x.toFixed(1)}" dy="13">${esc(dim.name)}</tspan></text>
        </g>`);
    });

    // 사람 선. 강조한 사람은 맨 위에 그린다
    const order = [...people].sort((a, b) => (a.slot === focusSlot) - (b.slot === focusSlot));
    for (const p of order) {
        const c = colorOf(p);
        const values = DIMENSIONS.map((d) => radarValue(p, d));
        const { closed, runs } = radarRuns(values);
        const state = focusSlot === null ? '' : p.slot === focusSlot ? ' focus' : ' dim';
        const g = [`<g class="person${state}" data-slot="${p.slot}">`];

        for (const run of runs) {
            const points = run.map((i) => pt(radarPoint(i, values[i]))).join(' ');
            if (closed) g.push(`<polygon class="line" points="${points}" stroke="${c.fill}"/>`);
            else if (run.length > 1) g.push(`<polyline class="line" points="${points}" stroke="${c.fill}"/>`);
        }
        values.forEach((v, i) => {
            if (v === null) return;
            const dim = DIMENSIONS[i];
            const [x, y] = radarPoint(i, v);
            const raw = scoreOf(p, dim.key);
            const tipText = `${p.slot + 1} ${p.name}${p.demo ? ' (가상)' : ''} — ${dim.key} ${dim.reverse ? `원점수 ${raw} (역산 ${v})` : `${v}점`}`;
            g.push(`<g class="vertex" data-tip="${esc(tipText)}" data-select="${dim.key}">
                <circle class="hit" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="9"/>
                <circle class="mark" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="4" fill="${c.fill}"/>
            </g>`);
            // 강조한 사람만 꼭짓점 값을 적는다 (모든 점에 숫자를 달지 않는다)
            if (p.slot === focusSlot) {
                const [lx, ly] = radarPoint(i, v + 0.75);
                g.push(`<text class="value" x="${lx.toFixed(1)}" y="${(ly + 4).toFixed(1)}">${v}</text>`);
            }
        });
        g.push('</g>');
        parts.push(g.join(''));
    }

    chart.innerHTML = `<svg viewBox="0 0 ${RADAR.W} ${RADAR.H}" role="img" aria-label="10개 차원 레이더. NC는 역산값">${parts.join('')}</svg>`;

    legend.innerHTML = people.map((p) => {
        const missing = DIMENSIONS.filter((d) => scoreOf(p, d.key) === null).map((d) => d.key);
        const pressed = p.slot === focusSlot;
        return `<button type="button" class="rd-person${pressed ? ' on' : ''}${focusSlot !== null && !pressed ? ' off' : ''}"
            data-focus="${p.slot}" aria-pressed="${pressed}">
            <span class="swatch" style="background:${colorOf(p).fill}"></span>${personLabel(p)}
            ${missing.length ? `<span class="missing" title="빈 점수: ${missing.join(', ')}">빈 ${missing.join('·')}</span>` : ''}
        </button>`;
    }).join('') + (focusSlot !== null ? '<button type="button" class="rd-all" data-focus="">모두 같게 보기</button>' : '');
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

// 인쇄용: 10개 차원 전부의 근거. 타임스탬프는 글자 그대로
function renderPrintEvidence() {
    const body = $('pev-body');
    if (!people.length) {
        body.innerHTML = '<p class="empty">아직 제출한 사람이 없습니다.</p>';
        return;
    }
    body.innerHTML = sortBySplit(stats).map((st) => {
        const dim = st.dim;
        const items = people
            .map((p) => ({ p, s: scoreOf(p, dim.key), ev: p.scores?.[dim.key]?.ev || '' }))
            .filter((it) => it.s !== null || it.ev)
            .sort((a, b) => (a.s ?? 99) - (b.s ?? 99) || a.p.slot - b.p.slot);
        return `<div class="pev-dim${dim.reverse ? ' rev' : ''}">
            <div class="pev-head"><span class="abbr">${dim.key}</span> <b>${esc(dim.name)}</b>
                <span class="muted">평균 ${fmt1(st.mean)} · 폭 ${st.range === null ? '—' : st.range}${dim.reverse ? ' · 원점수, 낮을수록 좋음' : ''}</span></div>
            ${items.length ? `<ol>${items.map((it) => `<li><b class="pev-score">${it.s === null ? '—' : `${it.s}점`}${dim.reverse && it.s !== null ? ` <small>(역산 ${8 - it.s})</small>` : ''}</b>
                <span>${personLabel(it.p)} — ${it.ev ? esc(it.ev) : '<span class="muted">(근거 없음)</span>'}</span></li>`).join('')}</ol>` : '<p class="empty">점수나 근거 없음</p>'}
        </div>`;
    }).join('');
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
    renderRadar(); // 선택한 축 표시
    // 좁은 창에서는 근거가 아래에 있으니 보이도록 옮겨 준다
    if (matchMedia('(max-width: 900px)').matches) $('evidence').scrollIntoView({ block: 'start' });
}

document.addEventListener('click', (e) => {
    const focus = e.target.closest('[data-focus]');
    if (focus) {
        // 같은 이름을 다시 누르면 강조를 푼다
        const slot = focus.dataset.focus === '' ? null : Number(focus.dataset.focus);
        focusSlot = slot === focusSlot ? null : slot;
        renderRadar();
        return;
    }
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
    if ((e.key === 'Enter' || e.key === ' ') && e.target.matches?.('.dot-row, .mx-row, .axis-label')) {
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
for (const id of ['dots-body', 'rd-chart']) {
    $(id).addEventListener('pointermove', (e) => {
        const target = e.target.closest('[data-tip]');
        if (target) showTip(target.dataset.tip, e.clientX, e.clientY);
        else tip.hidden = true;
    });
    $(id).addEventListener('pointerleave', () => { tip.hidden = true; });
}

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

// 인쇄한 기록지에 언제 뽑았는지 남긴다
window.addEventListener('beforeprint', () => {
    const now = new Date();
    $('printed-at').textContent = `인쇄 ${now.toLocaleDateString('ko-KR')} ${stamp(now)}`;
});
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
