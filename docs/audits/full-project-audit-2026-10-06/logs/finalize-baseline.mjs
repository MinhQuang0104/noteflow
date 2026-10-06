import fs from 'node:fs'
import path from 'node:path'
const out = path.join(process.cwd(), 'docs/audits/full-project-audit-2026-10-06')
const logs = path.join(out, 'logs')
const checks = [
 ['B1','PASS',['B1'],'533 tests: 532 passed, 0 failed, 1 skipped (Windows symlink unavailable). Full suite; source equals 98def53, checkout HEAD03dbd098.'],
 ['B2','NOT_RUN/ENV',['B2','B2-retry1'],'Bundled Python3.12.14; pytest chưa cài.'],
 ['B3','NOT_RUN/ENV',['B3','B3-retry1'],'vue-tsc thiếu.'],
 ['B4','NOT_RUN/ENV',['B4','B4-retry1'],'run-s thiếu; oxlint/eslint chưa chạy.'],
 ['B5','NOT_RUN/ENV',['B5','B5-retry1'],'Vitest chưa có. npx install disabled; EACCES/ENOTCACHED; không có test/coverage.'],
 ['B6','NOT_RUN/ENV',['B6','B6-retry1'],'Vite thiếu; không sinh build.'],
 ['B7','NOT_RUN/ENV',['B7','B7-retry1'],'redocly thiếu.'],
 ['B8','NOT_RUN/ENV + READ_ONLY_CONFLICT',['B8-check','B8-check-retry1'],'check thiếu yaml; proof không gọi vì sửa tracked OpenAPI (prove-contract-drift.mjs:15,25).'],
 ['B9','NOT_RUN/ENV',['B9','B9-retry2-correct-cwd'],'vendor/autoload.php thiếu; chưa có Pest nào chạy. FindingF-00 HIGH theo rubric plan.'],
 ['B10','NOT_RUN/ENV',['B10','B10-retry2-correct-cwd'],'vendor/bin/phpstan thiếu.'],
 ['B11','NOT_RUN/ENV',['B11','B11-retry2-correct-cwd'],'vendor/bin/pint thiếu.'],
 ['B12','PASS',['B12'],'Runner tương ứng là node --test; 6/6 helpers passed, không DB/network.'],
 ['B13','NOT_RUN/ENV (PARTIAL)',['B13-frontend','B13-frontend-retry1','B13-e2e','B13-backend','B13-backend-locked-correct-cwd','B13-backend-locked-retry1'],'FE advisory endpoint bị EACCES; E2E --omit=dev exit0 chỉ scope production dependencies (0 packages); composer audit exit0 SKIPPED vì không installed packages; supplement --locked bị curl7 exit100. Không kết luận dependencies an toàn.'],
 ['B14','PASS',['B14-diff','B14-ignore','B14-large-repeat'],'Diff whitespace sạch; tracked-ignore rỗng; 635 tracked paths, không file >=1MiB. Size-repeat có thời gian đo thật; B14-large cũ seconds0 nghĩa là không đo, không dùng làm timing.'],
 ['B15','NOT_RUN/WORKTREE_GUARD',[],'Không gọi verify-local.ps1 trong audit hoặc canonical; Assert-CanonicalCheckout:39–60 / call:225. Không vượt guard.'],
]
const records = checks.map(([id,status,ids,note])=>({id,status,note,attempts:ids.map(x=>JSON.parse(fs.readFileSync(path.join(logs,x+'.meta.json'),'utf8').replace(/^\uFEFF/,'')))}))
fs.writeFileSync(path.join(out,'baseline-status.json'),JSON.stringify(records,null,2)+'\n')
let doc='# Phase1 — Baseline deterministic checks\n\n[F] Tất cả attempt hợp lệ chạy tại worktree audit với cwd dưới đây. Exit code là exit thật của lệnh, không chuyển lỗi khởi động thành test FAIL/PASS. [I] NOT_RUN/ENV mô tả check chưa thực thi đến runner vì dependency/mạng; điều này không chứng minh code sản phẩm fail.\n\n'
doc+='[F] Không cài dependency hoặc copy .env vì user giới hạn mọi ghi vào audit output. npm/composer/pytest cache được định tuyến vào logs; npx --no-install (retry offline) giữ nguyên ý định chạy Vitest mà không cài thêm. B8 proof có xung đột read-only, B15 có guard đã quy định.\n\n'
doc+='| Check | Trạng thái | Exit thực tế | Giới hạn / kết quả |\n|---|---|---|---|\n'
for(const r of records)doc+='| '+r.id+' | '+r.status+' | '+(r.attempts.map(a=>a.id+': '+a.exit_code).join('; ')||'— (không gọi)')+' | '+r.note+' |\n'
doc+='\n[F] Audit runner từng tính sai cwd cho B9-retry1/B10-retry1/B11-retry1/B13-backend-locked (frontend/backend không tồn tại). Các log được giữ để minh bạch, **không** dùng làm evidence backend. Sau đó chạy lại với absolute backend cwd; bảng và chi tiết chỉ dùng attempt hợp lệ. Không coi lỗi runner của audit là finding sản phẩm.\n\n'
doc+='[F] Python có sẵn qua bundled runtime; pytest không có. Host PHP8.5.9 khác runtime PHP8.4 được tài liệu yêu cầu; backend checks chưa khởi động nên không giả định đã kiểm PHP8.4. B1 skip duy nhất: symlink creation unavailable (B1.log:431).\n\n'
for(const r of records){
 doc+='## '+r.id+'\n\n'
 if(!r.attempts.length){doc+='[F] '+r.note+' Không có exit code/thời lượng cho lệnh không gọi.\n\n';continue}
 for(const a of r.attempts){
  const log=fs.readFileSync(path.join(logs,a.log),'utf8').replace(/^\uFEFF/,'')
  const tail=log.trimEnd().split(/\r?\n/).slice(-30).join('\n')
  doc+='[F] '+a.id+': command '+JSON.stringify(a.command)+'; cwd '+JSON.stringify(a.cwd)+'; startedUTC '+a.started_utc+'; elapsed '+a.seconds.toFixed(3)+'s; exit '+a.exit_code+'. Full log: [logs/'+a.log+'](logs/'+a.log+').\n\n\x60\x60\x60text\n'+tail+'\n\x60\x60\x60\n\n'
 }
}
doc+='## Phần không thực thi\n\n[F] B8-proof: NOT_RUN/READ_ONLY_CONFLICT; script cố tình thay OpenAPI rồi phục hồi để chứng minh drift. Không có exit code. [F] B15: NOT_RUN/WORKTREE_GUARD; không gọi canonical dưới danh nghĩa audit. Người dùng tự chạy canonical tại code tương đương, ghi SHA và log, rồi đính kèm phụ lục trong lượt review sau.\n\n[I] B1/B12/B14 PASS chỉ bao phủ đúng lệnh và phạm vi đã chạy; không thay thế frontend/backend/full-stack/AT gates.\n'
fs.writeFileSync(path.join(out,'01-baseline-checks.md'),doc)
fs.writeFileSync(path.join(logs,'B8-proof.log'),'[F] NOT_RUN/READ_ONLY_CONFLICT. No command executed, exit code not applicable. Source: frontend/scripts/prove-contract-drift.mjs:15 and25 write/restore contracts/openapi.yaml.\n')
fs.writeFileSync(path.join(logs,'B15.log'),'[F] NOT_RUN/WORKTREE_GUARD. No command executed, exit code not applicable. Source: scripts/verify-local.ps1:39-60 and225. User prohibits canonical full-stack execution during audit.\n')
console.log(JSON.stringify({generated:'01-baseline-checks.md',checks:records.length,pass:records.filter(r=>r.status==='PASS').map(r=>r.id),only_audit_writes:true}))
