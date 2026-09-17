// 비교 화면 계산 — dimensions.js, scoring.js 다음에 불러온다.
// 규칙
// - 비교 대상은 제출한 사람(status: submitted)만.
// - 빈 점수는 계산에서 뺀다(평균·범위·일치율 모두). 화면에는 —.
// - 점 그래프·일치율·범위는 원점수로 계산한다. 역산은 영역 평균과 표시에서만.

function scoreOf(person, key) {
    const s = person.scores?.[key]?.s;
    return Number.isInteger(s) && s >= 1 && s <= 7 ? s : null;
}

// 사람마다 고정 번호·색 슬롯. 파일에 처음 들어온 순서를 따른다 —
// 폴링 중 누가 새로 제출해도 기존 사람의 번호·색이 바뀌지 않게.
function comparePeople(list) {
    return list
        .map((p, i) => ({ ...p, slot: i }))
        .filter((p) => p.status === 'submitted');
}

// 차원 하나의 통계. values 는 점수가 있는 사람만
function dimStats(people, dim) {
    const values = people
        .map((p) => ({ person: p, s: scoreOf(p, dim.key) }))
        .filter((v) => v.s !== null);
    const n = values.length;
    if (!n) return { dim, values, n, mean: null, min: null, max: null, range: null, sd: null };
    const nums = values.map((v) => v.s);
    const mean = nums.reduce((a, b) => a + b, 0) / n;
    const min = Math.min(...nums);
    const max = Math.max(...nums);
    const sd = Math.sqrt(nums.reduce((a, b) => a + (b - mean) ** 2, 0) / n);
    // 폭은 두 사람 이상일 때만 의미가 있다
    return { dim, values, n, mean, min, max, range: n >= 2 ? max - min : null, sd };
}

// 모든 사람 쌍 × 10차원. 둘 중 하나라도 빈 점수면 그 쌍·차원은 뺀다
function agreement(people) {
    let pairs = 0;
    let within1 = 0;
    let exact = 0;
    for (const dim of DIMENSIONS) {
        for (let i = 0; i < people.length; i++) {
            for (let j = i + 1; j < people.length; j++) {
                const a = scoreOf(people[i], dim.key);
                const b = scoreOf(people[j], dim.key);
                if (a === null || b === null) continue;
                pairs++;
                if (Math.abs(a - b) <= 1) within1++;
                if (a === b) exact++;
            }
        }
    }
    return {
        pairs,
        within1: pairs ? within1 / pairs : null,
        exact: pairs ? exact / pairs : null,
    };
}

// 불일치 폭이 큰 순. 같으면 표준편차 큰 순, 그래도 같으면 원래 차원 순서.
// 폭을 낼 수 없는 차원(두 명 미만)은 맨 아래
function sortBySplit(stats) {
    const order = new Map(DIMENSIONS.map((d, i) => [d.key, i]));
    return [...stats].sort((a, b) => {
        if (a.range === null || b.range === null) {
            if (a.range === b.range) return order.get(a.dim.key) - order.get(b.dim.key);
            return a.range === null ? 1 : -1;
        }
        return (b.range - a.range) || (b.sd - a.sd) || (order.get(a.dim.key) - order.get(b.dim.key));
    });
}

function topSplit(stats, count = 3) {
    return sortBySplit(stats).filter((s) => s.range !== null).slice(0, count);
}

// 1인의 영역 평균 — scoring.js 의 domainAverages 를 그대로 쓴다(NC 역산, 빈 점수 제외)
function personDomains(person) {
    return domainAverages(person.scores || {});
}

// 레이더에 그릴 값: NC(reverse)는 역산값, 빈 점수는 null
function radarValue(person, dim) {
    const s = scoreOf(person, dim.key);
    if (s === null) return null;
    return dim.reverse ? 8 - s : s;
}

// 빈 점수가 있으면 그 꼭짓점에서 선을 끊는다. 0점이나 이웃 값으로 잇지 않는다.
// values: 꼭짓점 순서대로의 값(null 가능) → { closed, runs: [[꼭짓점 번호...], ...] }
// 모두 있으면 닫힌 도형 하나. 아니면 빈 칸 사이의 연속 구간들(원형으로 이어 본다)
function radarRuns(values) {
    const n = values.length;
    const present = values.map((v) => v !== null);
    if (present.every(Boolean)) return { closed: true, runs: [values.map((_, i) => i)] };
    const firstGap = present.indexOf(false);
    const runs = [];
    let current = [];
    for (let k = 1; k <= n; k++) {
        const i = (firstGap + k) % n;
        if (present[i]) {
            current.push(i);
        } else {
            if (current.length) runs.push(current);
            current = [];
        }
    }
    return { closed: false, runs };
}

// "[03:41]" "[1:02:05]" → 초
function parseStamp(text) {
    const parts = text.replace(/[[\]]/g, '').split(':').map(Number);
    return parts.reduce((acc, n) => acc * 60 + n, 0);
}

// 근거 문장을 글자 조각과 타임스탬프 조각으로 나눈다
function splitEvidence(text) {
    const out = [];
    const re = /\[(\d{1,2}:)?\d{1,2}:\d{2}\]/g;
    let last = 0;
    let m;
    while ((m = re.exec(text))) {
        if (m.index > last) out.push({ text: text.slice(last, m.index) });
        out.push({ stamp: m[0], seconds: parseStamp(m[0]) });
        last = m.index + m[0].length;
    }
    if (last < text.length) out.push({ text: text.slice(last) });
    return out;
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { scoreOf, comparePeople, dimStats, agreement, sortBySplit, topSplit, personDomains, splitEvidence, parseStamp, radarValue, radarRuns };
}
