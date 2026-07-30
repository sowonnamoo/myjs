/**
 * cutline.js - 지금 선택된 사이즈(규격/비규격 상관없이 재단사이즈 + 작업사이즈)에
 * 맞춰 칼선 PDF를 만들어 다운로드합니다. "작업선" 버튼(#printCutlineBtn) 클릭 시 동작합니다.
 *
 * - 빨간선(접수/재단 사이즈): widthInput × heightInput 값을 그대로 씀
 * - 검은선(작업사이즈, 칼선): workWidthInput × workHeightInput 값을 그대로 씀
 *   (01my.html 자체 로직상 재단사이즈 + 4mm(가로/세로 각각 +4mm)로 항상 자동 계산되어 있음 — 규격/비규격
 *   어느 쪽을 선택해도 이 두 입력값은 이미 최신 상태로 맞춰져 있으므로 그대로 읽기만 하면 됨)
 */

// 최소 구조의 PDF를 코드로 직접 생성 (CMYK 색상 사용 — 검정 K100%, 빨강 CMY 인쇄용 레드).
// PDF의 /MediaBox는 어떤 프로그램에서 열어도 정확히 그 크기로 문서가 만들어지는
// 명확한 규격이라, 일러스트레이터에서 열었을 때 A4 같은 엉뚱한 크기로 안 뜸.
function generateCutlinePDF(trimWmm, trimHmm, workWmm, workHmm) {
    const PT_PER_MM = 72 / 25.4;
    const n = v => v.toFixed(2);

    const cutWpt = workWmm * PT_PER_MM;
    const cutHpt = workHmm * PT_PER_MM;
    const trimWpt = trimWmm * PT_PER_MM;
    const trimHpt = trimHmm * PT_PER_MM;
    // 작업사이즈가 재단사이즈보다 큰 만큼을 좌우/상하로 절반씩 나눠 빨간선을 정중앙에 둠
    const marginXpt = Math.max(0, (workWmm - trimWmm) / 2) * PT_PER_MM;
    const marginYpt = Math.max(0, (workHmm - trimHmm) / 2) * PT_PER_MM;

    const contentStream =
`0 0 0 1 K
1 w
${n(0.5)} ${n(0.5)} ${n(cutWpt - 1)} ${n(cutHpt - 1)} re
S
0 1 1 0 K
1 w
${n(marginXpt)} ${n(marginYpt)} ${n(trimWpt)} ${n(trimHpt)} re
S
`;

    const objects = [
        `1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n`,
        `2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n`,
        `3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${n(cutWpt)} ${n(cutHpt)}] /Contents 4 0 R /Resources << >> >>\nendobj\n`,
        `4 0 obj\n<< /Length ${contentStream.length} >>\nstream\n${contentStream}endstream\nendobj\n`
    ];

    // 아래 전부 순수 ASCII만 써야 함 — xref 오프셋을 JS 문자열 .length로 계산하는데,
    // 멀티바이트 문자가 섞이면 실제 파일 바이트 위치와 어긋나서 PDF가 깨짐.
    let body = `%PDF-1.4\n%CutlineTemplateID: ECOGR-01MY-DIELINE-V1\n%CutlineTemplateSize: ${trimWmm}x${trimHmm}mm(trim) ${workWmm}x${workHmm}mm(work)\n%CutlineColorMode: CMYK\n`;
    const offsets = [];
    for (const obj of objects) {
        offsets.push(body.length);
        body += obj;
    }
    const xrefStart = body.length;
    let xref = `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
    for (const off of offsets) {
        xref += `${String(off).padStart(10, '0')} 00000 n \n`;
    }
    const trailer = `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`;

    return body + xref + trailer;
}

function downloadCutlinePDF() {
    const trimW = parseFloat(document.getElementById('widthInput')?.value) || 0;
    const trimH = parseFloat(document.getElementById('heightInput')?.value) || 0;
    let workW = parseFloat(document.getElementById('workWidthInput')?.value) || 0;
    let workH = parseFloat(document.getElementById('workHeightInput')?.value) || 0;

    if (trimW <= 0 || trimH <= 0) {
        alert('사이즈를 먼저 선택/입력해주세요.');
        return;
    }
    // 작업사이즈 입력칸이 아직 안 채워졌거나 재단사이즈보다 작게 들어있는 등
    // 예외적인 상황을 대비해, 못 미더우면 재단사이즈를 그대로 씀(도련 없이)
    if (workW < trimW) workW = trimW;
    if (workH < trimH) workH = trimH;

    const pdfText = generateCutlinePDF(trimW, trimH, workW, workH);
    const blob = new Blob([pdfText], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `cutline_${trimW}x${trimH}mm.pdf`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

document.addEventListener('DOMContentLoaded', () => {
    const btn = document.getElementById('printCutlineBtn');
    if (btn) {
        btn.addEventListener('click', downloadCutlinePDF);
    }
});
