// 데모 데이터 — 가상 학생 5명
// 균등분포로 뽑지 않는다. 실제 CLASS 연구의 분포를 따라야
// "교수적 지원이 유독 낮다"는 이 도구의 핵심 발견이 화면에 나타난다.

const { DIMENSIONS } = require('./public/dimensions');

// 차원별 평균·표준편차 (NC는 원점수)
// 출처: La Paro, K. M., Pianta, R. C., & Stuhlman, M. (2004).
//       The Classroom Assessment Scoring System: Findings from the prekindergarten year.
//       미국 Pre-K 교실 표본의 차원별 평균·표준편차.
const PARAMS = {
    PC: { mean: 5.1, sd: 0.95 },
    NC: { mean: 1.8, sd: 0.78 },
    TS: { mean: 4.5, sd: 1.0 },
    RSP: { mean: 4.3, sd: 0.9 },
    BM: { mean: 4.8, sd: 1.1 },
    P: { mean: 4.4, sd: 1.0 },
    ILF: { mean: 4.1, sd: 1.0 },
    CD: { mean: 2.9, sd: 1.2 },
    QF: { mean: 2.1, sd: 1.1 },
    LM: { mean: 2.8, sd: 0.9 },
};

// 관찰자 편향(관대/엄격): 학생마다 하나의 고정값을 전 차원에 더한다
const BIAS_RANGE = 0.6;

// 교수적 지원(CD·QF·LM)은 관찰자들이 가장 많이 갈리는 영역이다.
// 분산(variance)을 1.4배로 키운다 → 표준편차는 √1.4 ≈ 1.18배
const IS_DOMAIN = 'IS';
const IS_VARIANCE_FACTOR = 1.4;

const NAMES = ['김민지', '이서준', '박지현', '최도윤', '정하은', '강태오', '윤서아', '한지후', '오예린', '서준호'];

// 근거 문장 풀: 차원 × 점수 구간(1–2 low / 3–5 mid / 6–7 high) × 3문장
// NC는 원점수 기준이다: low = 부정성이 거의 없음, high = 부정성이 큼
const EVIDENCE = {
    PC: {
        low: ['교사와 학생 사이 인사나 웃음이 거의 없음', '교사 말투가 사무적이고 눈 맞춤이 드묾', '또래끼리 대화가 적고 분위기가 가라앉아 있음'],
        mid: ['활동 시작 때 웃으며 칭찬하지만 금방 사무적으로 돌아감', '일부 학생과만 따뜻한 대화가 오감', '학생 이름을 부르며 반기지만 대화가 이어지지 않음'],
        high: ['교사와 학생이 자주 웃고 이름을 부르며 대화함', '학생들이 교사에게 스스럼없이 다가가 이야기를 꺼냄', '또래끼리 "고마워" "괜찮아"가 자연스럽게 오감'],
    },
    NC: {
        low: ['짜증이나 꾸짖음이 보이지 않음', '교사 목소리가 끝까지 차분함', '학생 간 다툼 장면 없음'],
        mid: ['교사가 한숨 쉬며 "또?"라고 말함', '줄 서기에서 큰 소리로 여러 번 주의를 줌', '학생 실수에 교사가 짧게 비꼬는 말을 함'],
        high: ['교사가 소리를 높여 반 전체를 꾸짖음', '활동에서 빼겠다고 반복해서 위협함', '학생을 다른 학생들 앞에서 망신 줌'],
    },
    TS: {
        low: ['손 든 학생을 한참 동안 알아채지 못함', '울먹이는 학생을 두고 활동을 그대로 진행', '질문한 학생에게 답하지 않고 넘어감'],
        mid: ['어려워하는 학생에게 다가가지만 한 번 보고 지나감', '앞쪽 학생들의 신호에만 반응함', '도움을 청하면 돕지만 먼저 살피지는 않음'],
        high: ['표정이 굳은 학생에게 먼저 다가가 눈높이를 맞춰 물어봄', '막힌 학생을 알아채고 바로 힌트를 줌', '학생들이 망설임 없이 교사에게 도움을 청함'],
    },
    RSP: {
        low: ['활동 순서와 방법을 모두 교사가 정함', '학생이 꺼낸 이야기를 끊고 계획대로 진행', '자리에서 움직이지 못하게 계속 제지함'],
        mid: ['두 가지 활동 중 하나를 고르게 함', '학생 의견을 듣지만 활동에 반영하지 않음', '일부 학생에게만 발표 역할을 줌'],
        high: ['학생이 제안한 방법으로 활동을 바꿔 진행함', '모둠 이끔이를 학생들이 돌아가며 맡음', '학생의 관심사(공룡)를 수업 예시로 끌어옴'],
    },
    BM: {
        low: ['규칙 안내 없이 시작해 여러 명이 돌아다님', '같은 학생의 방해 행동이 계속 반복됨', '문제가 커진 뒤에야 큰 소리로 제지함'],
        mid: ['규칙을 말하지만 지켜지는지 확인하지 않음', '떠드는 학생 이름을 여러 번 부름', '대부분 따르지만 뒤쪽 학생들이 자주 흐트러짐'],
        high: ['활동 전에 약속을 짧게 확인하고 시작함', '흐트러지려는 학생 옆으로 조용히 가서 바로잡음', '학생들이 신호 하나에 바로 주목함'],
    },
    P: {
        low: ['자료를 찾느라 학생들이 몇 분간 기다림', '전환 때마다 긴 공백이 생김', '할 일이 없는 학생이 많음'],
        mid: ['전환은 되지만 정리 시간이 길어짐', '루틴은 있으나 일부 학생이 무엇을 할지 모름', '준비물 나눠주는 동안 대기 시간이 생김'],
        high: ['노래 한 소절로 정리하고 바로 다음 활동으로 넘어감', '자료가 미리 모둠별로 놓여 있음', '대기 시간 없이 모두 할 일이 있음'],
    },
    ILF: {
        low: ['교사 설명만 길게 이어지고 학생 참여가 없음', '학습지 한 가지로만 진행', '무엇을 배우는지 안내가 없음'],
        mid: ['그림 자료를 보여주기만 하고 질문은 없음', '참여하는 학생과 딴짓하는 학생이 섞여 있음', '목표를 말하지만 활동과 연결하지 않음'],
        high: ['실물 자료를 직접 만져 보게 하며 질문을 던짐', '알아볼 것을 칠판에 적고 활동 중에 다시 짚음', '대부분의 학생이 몸을 앞으로 기울이고 참여함'],
    },
    CD: {
        low: ['"이건 무슨 색이지?"처럼 답이 하나인 질문만 함', '외우기와 따라 말하기 위주', '배운 것을 생활과 연결하는 말이 없음'],
        mid: ['"왜 그렇게 생각해?"라고 한 번 묻고 넘어감', '지난 시간 내용을 짧게 떠올리게 함', '예측해 보게 하지만 이유는 묻지 않음'],
        high: ['"물에 넣으면 어떻게 될까? 왜?"라고 묻고 직접 해 봄', '학생들이 계획을 세우고 결과를 비교함', '집에서 본 것과 오늘 배운 것을 연결하게 함'],
    },
    QF: {
        low: ['"맞아", "틀렸어"로만 반응하고 넘어감', '틀린 답에 정답을 바로 알려줌', '학생 답에 반응 없이 다음 학생을 지목'],
        mid: ['"잘했어" 칭찬은 많지만 무엇이 좋은지 말하지 않음', '한 번 되묻지만 대화가 이어지지 않음', '일부 학생에게만 힌트를 줌'],
        high: ['틀린 답에 "어떻게 세었는지 보여줄래?"라고 되물음', '학생 답을 받아 두세 번 주고받으며 생각을 넓힘', '"다시 세어 봐서 찾아냈구나"처럼 과정을 짚어 격려'],
    },
    LM: {
        low: ['지시하는 말 외에 대화가 거의 없음', '"네/아니오"로 답할 질문만 함', '학생 말을 받지 않고 교사 말만 이어짐'],
        mid: ['열린 질문을 가끔 하지만 답을 기다리지 않음', '학생 말을 되풀이하지만 넓히지 않음', '새 낱말을 쓰지만 뜻을 풀어주지 않음'],
        high: ['"빨간 차"를 "빨갛고 바퀴가 큰 소방차구나"로 넓혀 줌', '교사가 자기 행동을 말로 풀어 들려줌', '"관찰", "비교" 같은 낱말을 쓰고 뜻을 함께 이야기함'],
    },
};

// 비교 화면의 종합 의견 카드를 시험하려고 넣는다. 등급 판정 문구는 쓰지 않는다.
// 빈 문자열은 "비어 있는 사람은 카드를 만들지 않는다"를 확인하기 위한 것이다.
const COMMENTS = [
    '분위기는 따뜻한데 질문이 대부분 답이 하나인 질문이었다. 이유를 묻는 질문이 늘면 좋겠다.',
    '전환이 매끄러워 학습 시간이 잘 확보되었다. 피드백이 "잘했어"에서 멈추는 점이 아쉽다.',
    '학생 의견을 듣는 장면이 여러 번 있었지만 수업 흐름에 반영되지는 않았다.',
    '교사가 학생 말을 받아 넓혀 주는 장면이 인상적이었다. 다만 일부 학생에게 집중되었다.',
    '',
];
const MEMOS = ['대집단 활동 위주, 아동 약 18명', '영상 중반에 소집단으로 전환됨', '', '카메라가 교사 쪽만 비춰 학생 반응이 잘 안 보임', ''];

// 표준정규분포 — Box–Muller
function normal(random) {
    let u = 0;
    while (u === 0) u = random(); // log(0) 방지
    const v = random();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

function band(s) {
    if (s <= 2) return 'low';
    if (s <= 5) return 'mid';
    return 'high';
}

function pick(list, random) {
    return list[Math.floor(random() * list.length)];
}

function shuffle(list, random) {
    const a = [...list];
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
}

function timestamp(seconds) {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `[${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}]`;
}

// 편향은 −0.6 ~ +0.6 을 고르게 나눈 값을 학생들에게 섞어 배정한다.
// 5명이면 −0.6, −0.3, 0, +0.3, +0.6 — 관대한 사람부터 엄격한 사람까지 늘 한 명씩 있게 된다.
function biases(count, random) {
    if (count === 1) return [0];
    const values = Array.from({ length: count }, (_, i) => -BIAS_RANGE + (2 * BIAS_RANGE * i) / (count - 1));
    return shuffle(values, random);
}

// 원점수 하나: 정규분포에서 뽑고 → 편향을 더하고 → 1~7로 자르고 → 정수 반올림
function drawScore(dim, bias, random) {
    const { mean, sd } = PARAMS[dim.key];
    const spread = dim.domain === IS_DOMAIN ? sd * Math.sqrt(IS_VARIANCE_FACTOR) : sd;
    const x = mean + spread * normal(random) + bias;
    return Math.round(Math.min(7, Math.max(1, x)));
}

// exclude: 실제 학생이 이미 쓰는 이름 (가상 데이터가 덮어쓰지 않게)
// maxSeconds: 타임스탬프 상한 — 영상 길이를 알면 넘겨준다
function generateDemo({ count = 5, exclude = [], maxSeconds = 600, random = Math.random } = {}) {
    const names = shuffle(NAMES.filter((n) => !exclude.includes(n)), random).slice(0, count);
    const personal = biases(names.length, random);
    const comments = shuffle(COMMENTS, random);
    const memos = shuffle(MEMOS, random);
    const lo = Math.min(10, maxSeconds / 10);
    const hi = Math.max(lo + 1, maxSeconds - 10);
    const now = new Date().toISOString();

    return names.map((name, i) => {
        const scores = {};
        for (const dim of DIMENSIONS) {
            const s = drawScore(dim, personal[i], random);
            const at = lo + random() * (hi - lo);
            scores[dim.key] = { s, ev: `${timestamp(at)} ${pick(EVIDENCE[dim.key][band(s)], random)}` };
        }
        return {
            name,
            status: 'submitted',
            demo: true,
            bias: Number(personal[i].toFixed(2)),
            scores,
            memo: memos[i % memos.length],
            comment: comments[i % comments.length],
            updatedAt: now,
        };
    });
}

module.exports = { PARAMS, BIAS_RANGE, IS_VARIANCE_FACTOR, EVIDENCE, generateDemo, drawScore };
