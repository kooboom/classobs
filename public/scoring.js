// 점수 계산 — 채점 화면과 비교 화면이 같이 쓴다. dimensions.js 다음에 불러온다.
//
// 저장되는 값은 항상 원점수다. 역산(8 − 원점수)은 여기서, 표시 시점에만 한다.

// 영역 평균에 들어가는 값. reverse 차원(NC)만 8 − 원점수
function domainValue(dim, raw) {
    return dim.reverse ? 8 - raw : raw;
}

// scores: { PC: { s: 5, ev: '...' }, ... }
// → [{ key, name, avg, n, total }]  avg 는 입력된 차원만으로 낸 평균(없으면 null)
function domainAverages(scores) {
    return DOMAINS.map((domain) => {
        const dims = DIMENSIONS.filter((d) => d.domain === domain.key);
        const values = dims
            .filter((d) => Number.isInteger(scores[d.key]?.s))
            .map((d) => domainValue(d, scores[d.key].s));
        const avg = values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
        return { key: domain.key, name: domain.name, avg, n: values.length, total: dims.length };
    });
}

// 1–2 낮음 / 3–5 중간 / 6–7 높음
function scoreBand(s) {
    if (s <= 2) return 'low';
    if (s <= 5) return 'mid';
    return 'high';
}
