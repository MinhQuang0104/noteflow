# WS-I — Tài liệu, Git và vệ sinh repo

[F] `git -c core.quotepath=false ls-files` tại audit HEAD có 635 files: 634 baseline + AUDIT-PLAN.md. B14 git diff --check main exit 0; git ls-files -i -c --exclude-standard exit 0, rỗng; scan file size >=1MiB exit 0, không có. File lớn nhất composer.lock 386759 bytes. Log trong logs/B14-*.log, source-before.json.

[F] `git ls-files .gitattributes tests/e2e/test-results frontend/src/api/schema.generated.ts` exit 0 chỉ có generated TS. Root .gitattributes không tồn tại; frontend/.gitattributes:1 là text=auto eol=lf. `git ls-files --eol` cho OpenAPI, receipt E-review và v4-slice-transaction là i/lf,w/crlf; generated TS i/lf,w/lf. `git config --show-origin --get core.autocrlf` exit 0: true từ Git system config. [I] CRLF là exposure môi trường cần negative tests; không tự suy rằng F-08 còn mở khi canonical-blob fixes đã được tích hợp.

[F] Generated schema được chủ ý track: README.md:89 và frontend/scripts/generate-openapi-types.mjs:8 mô tả ownership/output. Test-results, report, node_modules, vendor, runtime bị ignore (.gitignore:2-50); không có test-results tracked. Logs audit bị generic *.log ignore nên Lead sẽ stage đúng audit logs bằng force, không đưa npm caches vào commit.

[F] `git branch -a` exit 0 liệt kê audit, main, bốn chore/agent-architecture-v3-* và remote feature/story-1-2, feature/story-1-3, main. `git worktree list` exit 0 chỉ canonical main và worktree audit. [I] Branch không gắn worktree không đủ bằng chứng là mồ côi; không xóa hoặc thay đổi branch nào.

[F] `git log --merges --oneline -15` exit 0: các merge Story/V4 (e6783cb, fe2f791, dabaf16, 7b4842b, f583066) và các resolution 1.5 được ghi lịch sử. [I] Commit messages alone không chứng minh Human Gate; WS-H đối chiếu receipts, không suy approval từ merge message.

[F] README capability section lỗi thời (I-01); sprint timestamp lỗi thời (I-02). [F] 13 plan lịch sử trong docs/superpowers/plans được inventory. Một số retained checklists vẫn chưa tick, gồm recovery/debug 1.6 và independent acceptance 09/28. [I] Checklist lịch sử không thay thế canonical Story/Plan/receipt; trạng thái fix cụ thể ở prior-findings-status.md. [H] Task nào còn cần human không được suy chỉ từ checkbox.

[I] Sức khoẻ 🟡: Git hygiene baseline sạch, generated files có ownership; onboarding/timestamp cần sửa, historical plans cần disposition rõ. Không có merge/push/delete trong audit.

## Findings theo template

```json
[
  {
    "id": "I-01",
    "workstream": "I",
    "title": "README vẫn mô tả dự án chưa có domain Challenge/Today",
    "severity": "MEDIUM",
    "classification": "VALID",
    "verification": "CONFIRMED",
    "evidence": [
      {
        "kind": "F",
        "ref": "README.md:150",
        "note": "Tài liệu hiện nói foundation chưa có Challenge/Today/domain behavior."
      },
      {
        "kind": "F",
        "ref": "backend/routes/api.php:21",
        "note": "Routes sản phẩm Challenge/Journal tồn tại."
      },
      {
        "kind": "F",
        "ref": "frontend/src/views/TodayView.vue:1",
        "note": "Today view đã có product behavior."
      }
    ],
    "failure_scenario": "Người onboarding dùng README để xác định phạm vi hiện tại → bỏ qua module và quality gates sản phẩm đã tồn tại.",
    "affected_paths": [
      "README.md"
    ],
    "related_prior_finding": null,
    "proposed_fix": "Cập nhật current-capabilities section và liên kết tới sprint/architecture; giữ lịch sử Story 1.1 trong tài liệu riêng.",
    "proposed_lane": "bugfix thường",
    "risk_of_fix": "LOW"
  },
  {
    "id": "I-02",
    "workstream": "I",
    "title": "Timestamp sprint-status cũ hơn các lifecycle commit đã ghi nhận",
    "severity": "LOW",
    "classification": "VALID",
    "verification": "CONFIRMED",
    "evidence": [
      {
        "kind": "F",
        "ref": "_bmad-output/implementation-artifacts/sprint-status.yaml:32",
        "note": "last_updated vẫn 2026-09-19, trong khi Story 1.5/1.6 đã done ở 43-44."
      },
      {
        "kind": "F",
        "ref": "30778c7",
        "note": "Story 1.6 completion commit tồn tại tháng 10; timestamp metadata không phản ánh lifecycle hiện tại."
      }
    ],
    "failure_scenario": "Dùng last_updated để đánh giá freshness hoặc chọn tài liệu tiến độ → kết luận sprint chưa được cập nhật sau 19/09 dù trạng thái đã đổi.",
    "affected_paths": [
      "_bmad-output/implementation-artifacts/sprint-status.yaml"
    ],
    "related_prior_finding": null,
    "proposed_fix": "Cập nhật timestamp qua workflow lifecycle được chọn ở lần sửa sau; không sửa state trong audit.",
    "proposed_lane": "V4 migration",
    "risk_of_fix": "LOW"
  }
]
```
