// CLASS 차원 정의 — Pre-K / K-3 판
// 연령대별 판본을 바꿀 때는 이 파일만 교체한다.
// 브라우저에서는 전역 상수로, 서버에서는 require 로 쓴다.
//
// reverse: true  → 입력·저장은 원점수. 영역 평균을 낼 때만 8 − 원점수로 역산한다.
// hint           → 근거 입력란 placeholder. 무엇을 적을지 안내한다.

const DOMAINS = [
    { key: 'ES', no: 1, name: '정서적 지원', short: '정서', en: 'Emotional Support', question: '학생들이 안전하고 지지받는다고 느끼는가' },
    { key: 'CO', no: 2, name: '교실 조직', short: '조직', en: 'Classroom Organization', question: '교실이 효율적으로 운영되고 있는가' },
    { key: 'IS', no: 3, name: '교수적 지원', short: '교수', en: 'Instructional Support', question: '학생들이 깊이 있게 배우고 있는가' },
];

const DIMENSIONS = [
    {
        key: 'PC', domain: 'ES', name: '긍정적 분위기',
        indicators: ['관계', '긍정적 정서', '긍정적 의사소통', '존중'],
        hint: '인사·웃음·따뜻한 말이 오간 장면',
    },
    {
        key: 'NC', domain: 'ES', name: '부정적 분위기', reverse: true,
        indicators: ['부정적 정서', '징벌적 통제', '비꼼과 무례', '심각한 부정성'],
        hint: '짜증·꾸짖음·위협 장면 (없었다면 "없음")',
    },
    {
        key: 'TS', domain: 'ES', name: '교사 민감성',
        indicators: ['인식력', '반응성', '문제의 효과적 해결', '학생 안정감'],
        hint: '교사가 학생의 어려움을 알아채고 반응한 장면',
    },
    {
        key: 'RSP', domain: 'ES', name: '학생 관점 존중',
        indicators: ['학생 관심사와 동기', '자율성과 리더십 지원', '의미 있는 토론', '움직임 제한'],
        hint: '학생이 고르거나 이끈 장면',
    },
    {
        key: 'BM', domain: 'CO', name: '행동 관리',
        indicators: ['명확한 행동 기대', '사전 예방적 접근', '문제행동 재지시', '학생 행동'],
        hint: '규칙 안내나 문제행동을 돌려세운 장면',
    },
    {
        key: 'P', domain: 'CO', name: '생산성',
        indicators: ['학습시간 극대화', '루틴', '전환', '준비'],
        hint: '전환 장면',
    },
    {
        key: 'ILF', domain: 'CO', name: '교수학습 형식',
        indicators: ['효과적 촉진', '다양한 방법과 자료', '학생 흥미', '명확한 학습 목표'],
        hint: '학생 참여를 끌어낸 방법·자료',
    },
    {
        key: 'CD', domain: 'IS', name: '개념 발달',
        indicators: ['분석과 추론', '창작', '통합', '실생활 연결'],
        hint: '교사의 질문을 그대로',
    },
    {
        key: 'QF', domain: 'IS', name: '피드백의 질',
        indicators: ['비계설정', '피드백 순환', '사고과정 촉진', '정보 제공', '격려와 확언'],
        hint: '학생 답에 교사가 되돌려준 말을 그대로',
    },
    {
        key: 'LM', domain: 'IS', name: '언어 모델링',
        indicators: ['잦은 대화', '개방형 질문', '반복과 확장', '자기 및 병행 서술', '고급 언어'],
        hint: '교사가 학생의 말을 받아 넓힌 말',
    },
];

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { DOMAINS, DIMENSIONS };
}
