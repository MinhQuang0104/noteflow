# Story 1.6 — Hướng dẫn bàn giao kế hoạch theo V4 upgrade

> Đã thay thế chỉ dẫn V3 của bản 2026-09-30 trước đó. File này là hướng dẫn
> đọc; Runner dùng bộ Story/Plan canonical bên dưới. Không chạy
> story-development, Orca hoặc generic executing-plans từ tài liệu này.

**Story:** [_bmad-output/implementation-artifacts/1-6-giai-quyet-xung-dot-noi-dung-giua-hai-thiet-bi.md](../../../_bmad-output/implementation-artifacts/1-6-giai-quyet-xung-dot-noi-dung-giua-hai-thiet-bi.md)

**Plan canonical:** [_bmad-output/implementation-artifacts/story-1-6-plan.md](../../../_bmad-output/implementation-artifacts/story-1-6-plan.md)

## Kết quả kiểm tra và sửa cấu trúc

Bản cũ chỉ là execution plan ở docs/superpowers/plans và mặc định lane V3.
V4 validator tìm đúng canonical path nên trả PLAN_MISSING. Đổi tên file đơn
thuần chưa đủ: schema-v2 cần Story có marked blocks, normative digest,
Task-to-slice mapping, lifecycle và next_action hợp lệ.

Bộ mới tách rõ:

- Story giữ product intent, 4 AC từ Epic, 8 Tasks, exact file boundaries,
  dependencies, readiness và risk/invariants.
- Plan schema-v2 giữ Story/Epic digests, sprint key, 5 slices A–E, task refs,
  consumers/check obligations và action start_story.
- Planning approval còn PENDING; không tạo approval, checkpoint hoặc receipts
  giả. Story/sprint vẫn backlog; product checks chưa chạy.

Scope đề xuất giữ journal làm resource nghiệm thu, gồm hai lựa chọn local/server,
resolution an toàn, dialog accessible và hội tụ hai thiết bị. Không mở rộng
Notes, Done/undo hoặc conflict metadata challenge. Mọi chi tiết sản phẩm phải
đọc ở Story canonical; tài liệu này không tạo nguồn requirements thứ hai.

## Các slices

| Slice | Story tasks | Nội dung |
| --- | --- | --- |
| A | T-1 | Server contract, no-mutation, resolution/replay, PostgreSQL contention |
| B | T-2, T-3 | Draft resolution state, exact retry, revision/auth/epoch fencing |
| C | T-4, T-5 | Dialog so sánh và journal editor integration |
| D | T-6 | Journal polling/refetch/ACK convergence |
| E | T-7, T-8 | E2E hai thiết bị, accessibility, full gates |

Risk HIGH áp dụng cho cả Story. Mỗi invocation chỉ một action; implement
persist verify_slice cho cùng slice rồi dừng; verify không fix code.
MEDIUM/HIGH review vẫn bắt buộc, finalization dừng ở Human Gate. V4 upgrade
không bật review_slice, automatic approval hoặc fallback V3.

## Verification commands dự kiến

Tất cả product checks dưới đây là NOT_RUN. Dùng dependencies và toolchain của
checkout thực thi: Node >=24.12.0 <25, PHP ^8.4, PostgreSQL testing database.

| Slice | Cwd | Focused command |
| --- | --- | --- |
| A | backend | php artisan test tests/Feature/ChallengeJournalTest.php tests/Feature/ChallengeJournalApiTest.php tests/Feature/JournalConflictConcurrencyTest.php tests/Contract/ChallengeContractTest.php |
| B | frontend | npm run test:unit -- --run src/stores/__tests__/journalDrafts.spec.ts src/api/__tests__/challenges.spec.ts |
| C | frontend | npm run test:unit -- --run src/components/__tests__/ContentConflictDialog.spec.ts src/views/__tests__/journal.spec.ts src/views/__tests__/journal-draft-lifecycle.spec.ts |
| D | frontend | npm run test:unit -- --run src/stores/__tests__/sync.spec.ts src/stores/__tests__/journalDrafts.spec.ts |
| E | tests/e2e | npm test -- content-conflict.spec.ts --workers=1 |

Full frontend gates: npm run contract:validate; contract:check; contract:proof;
lint; type-check; test:unit -- --run; build-only (mỗi script một command
npm run riêng). Full backend: composer validate --strict, php vendor/bin/pint
--test, composer analyse, php artisan test. Full browser: npm test -- --workers=1.
Manual screen-reader evidence vẫn bắt buộc cho AC-4; không suy ra PASS từ
jsdom hoặc accessibility tree. Windows có thể dùng npm.cmd.

Registry journal-frontend hiện chưa phủ tất cả paths của Story. Canonical
aggregate phải nhận mọi changed path; dùng focused CheckSpecs và HIGH-risk
review cho phần còn lại, giữ nguyên INCOMPLETE/ERROR/FAIL nếu tool trả vậy.
Không sửa feature maps/recipes để biến thiếu evidence thành PASS.

## Trước khi giao lại cho Luna Max

1. Review bộ Story/Plan mới và ghi planning approval đúng nội dung/digest khi
   có quyết định thực; đánh giá readiness trước khi đổi execution ready-for-dev.
2. Đưa artifacts đã commit vào checkout thực thi sạch. Worktree
   .worktrees/story-1-6 đang tồn tại ở c332823 nhưng chưa nhận các file mới
   từ main. Không dùng uncommitted main files làm authority cho worker branch.
3. Giữ mọi thay đổi sẵn có trên main; không stash/reset/clean hoặc gộp
   README, local runtime, E2E helper changes vào commit planning.
4. Trong checkout đã sẵn sàng, chạy read-only check-story-plan và start-story
   check với HEAD thực tế. Start chỉ khi có explicit authorization, check READY
   và fingerprint khớp. Approval plan không tự cấp quyền start/apply.
5. Sau start_story, dừng ở successor implement_slice:A. Mỗi lần tiếp theo đọc
   Plan và xử lý đúng một action, không chạy trọn A–E từ prompt "triển khai plan".

Nguồn gate: [.agents/skills/v4-story-runner/actions/start-story.md](../../../.agents/skills/v4-story-runner/actions/start-story.md),
[artifact contract](../../../.agents/docs/v4-artifact-contract.md).
Hai yêu cầu quan trọng: “The caller must record the actual human planning decision”
và “The gate must confirm committed schema-v2 Story/Plan/sprint artifacts”.

Đây là chỉnh sửa tài liệu planning; không start Story, sửa product code,
đổi sprint, tạo runtime hay chạy product tests.

## Kết quả kiểm tra artifact ngày 2026-09-30

- Story contract hợp lệ, bốn AC khớp nguyên văn Epic, tám task đều được map
  vào slices, bảy dependency sprint keys đều done. Không có execution evidence
  hoặc approval được dựng sẵn.
- check-story-plan: READY, current_slice A, next_action start_story:story,
  lifecycle và execution vẫn backlog. READY ở đây là artifact validation.
- start-story check tại main cbc559f: BLOCKED với
  FRESH_LIFECYCLE_REQUIRED, BLOCKERS_OR_QUESTIONS_PRESENT,
  PLANNING_APPROVAL_REQUIRED, READINESS_REQUIRED, DIRTY_WORKTREE,
  ARTIFACTS_NOT_COMMITTED. Đây là các preconditions thật cần hoàn tất, không
  phải lý do để bỏ gate hoặc sửa validator.
- Inventory ban đầu báo warning LF/CRLF ở tài liệu đã sửa; ba tài liệu đã
  được chuẩn hóa CRLF theo checkout. Kiểm tra lại không còn
  GIT_INVENTORY_INCOMPLETE.
- Main đã nhận riêng commits 5f8d2b8/cbc559f trong khi kiểm tra; runtime
  và E2E harness không còn là untracked baseline, nhưng worktree story-1-6
  vẫn ở c332823. Cần pin baseline phù hợp trong checkout thực thi.
