// localStorage 는 사생활 보호 모드 등에서 예외를 던질 수 있다. 실패해도 화면은 동작해야 한다.

const LS = {
    get(key) {
        try {
            const raw = localStorage.getItem(key);
            return raw === null ? null : JSON.parse(raw);
        } catch {
            return null;
        }
    },
    set(key, value) {
        try {
            localStorage.setItem(key, JSON.stringify(value));
        } catch {
            // 저장 못 해도 계속 진행
        }
    },
};

const KEYS = {
    name: 'classobs:name',
    session: (code) => `classobs:session:${code}`,
    draft: (code, name) => `classobs:draft:${code}:${name}`,
};

// 서버와 같은 규칙으로 이름을 정규화한다 (upsert 키)
function normalizeName(value) {
    return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, 20);
}
