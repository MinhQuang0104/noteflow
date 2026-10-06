# WS-G — Hạ tầng local và deploy

[F] Baseline nguồn `98def5358983072216a28754e87b1cd5f884d258`; checkout audit `03dbd098`. Review tĩnh: compose.local.yaml, deploy/local/Dockerfile + entrypoint.sh, deploy/nginx/noteflow.conf, deploy/README.md, scripts/local.ps1, scripts/verify-local.ps1, docs/development/local-runtime.md, backend/.env.example. Không vận hành Docker hoặc database.

| Boundary | Kết quả audit |
|---|---|
| Host bind | [F] compose.local.yaml:59,135 bind 127.0.0.1:8000/8001; postgres không publish port. Backend serve 0.0.0.0 bên trong container tại 26,101. |
| Dev/test isolation | [F] Compose networks/volumes riêng; scripts/local.ps1:258 xác minh APP_ENV/DB_HOST/DB_PORT/DB_DATABASE/DB_URL cho test; :246 kiểm dev identity. [I] Configuration hỗ trợ isolation, không phải kết quả chạy workload thật. |
| Credentials | [F] scripts/local.ps1:154,182 tạo/giữ local env với random secrets; README.md:48 có published local/manual-test credential. Chỉ ghi loại/vị trí; không chép giá trị. [H] Production reuse chưa được chứng minh. |
| Debug/session | [F] compose.local.yaml:35 APP_DEBUG=true cho local; :110 false cho testing; cookie Secure=false ở HTTP local. README.md:40 yêu cầu HTTPS/Secure cookie cho production. Không suy local debug thành production leak. |
| Secrets/config | [F] .env bị ignore (.gitignore:24); local.ps1:193 dừng nếu env thiếu thay vì tạo password mới. [I] Bảo vệ connection tới local DB sẵn có. |
| Canonical guard | [F] local.ps1:43-69 và verify-local.ps1:39-60 từ chối linked worktree; verify-local.ps1:225 gọi guard. B15 NOT_RUN/WORKTREE_GUARD; không bypass. |
| Lock/migrations | [F] local.ps1:236 dùng exclusive FileShare.None; :368 liệt kê mutating actions; :378/:413 dùng migrate --force thay vì migrate:fresh với dev. Test migration ở :297 thuộc test profile. |
| Routing | [F] nginx config:11-19 chuyển backend paths trước SPA fallback (:22); :7 deny dotpaths; root chỉ frontend dist (:5). |
| Image identity | [F] Tags chưa digest pinned (G-02). Apt package versions cũng lấy tại build (Dockerfile:5). |
| TLS/security headers | [F] Nginx listen HTTP :2; docs cho TLS ở upstream (:9). Header policy chưa khai báo tại template (G-01). |
| Docs/script | [F] Runbook local-runtime.md:15-17 yêu cầu canonical; :88 test profile; :106 diagnostics; khớp guards và actions trong scripts. |

[I] Sức khoẻ 🟡: local safety boundaries rõ; production boundary chưa được deploy/verify trong audit. B15 và Docker full stack NOT_RUN. Finding G-01 cần quyết định owner, G-02 nợ reproducibility thấp.

## Findings theo template

```json
[
  {
    "id": "G-01",
    "workstream": "G",
    "title": "Chưa xác định nơi chịu trách nhiệm header bảo mật tại production edge",
    "severity": "MEDIUM",
    "classification": "NEEDS_HUMAN_DECISION",
    "verification": "CONFIRMED",
    "evidence": [
      {
        "kind": "F",
        "ref": "deploy/nginx/noteflow.conf:1",
        "note": "Server template 24 dòng không khai báo CSP/frame-ancestors, X-Frame-Options hay HSTS."
      },
      {
        "kind": "F",
        "ref": "deploy/README.md:9",
        "note": "TLS có thể terminate tại Nginx hoặc upstream; chưa mô tả header policy hay acceptance check tại boundary đó."
      },
      {
        "kind": "H",
        "ref": "production edge chưa được cung cấp",
        "note": "Edge bên ngoài có thể đã cấu hình headers; chưa xác minh deployment thật."
      }
    ],
    "failure_scenario": "Dùng riêng template để triển khai → thiếu chính sách frame/CSP và TLS headers tại boundary được kiểm soát trong repo; ảnh hưởng deployment thật phụ thuộc edge chưa biết.",
    "affected_paths": [
      "deploy/nginx/noteflow.conf",
      "deploy/README.md"
    ],
    "related_prior_finding": null,
    "proposed_fix": "Owner xác định boundary chịu trách nhiệm TLS/header; ghi policy và kiểm response tại edge đó. Không thêm HSTS vào local HTTP một cách mặc định.",
    "proposed_lane": "human decision",
    "risk_of_fix": "MEDIUM"
  },
  {
    "id": "G-02",
    "workstream": "G",
    "title": "Docker base image và runtime tags chưa được pin bằng digest",
    "severity": "LOW",
    "classification": "VALID",
    "verification": "CONFIRMED",
    "evidence": [
      {
        "kind": "F",
        "ref": "deploy/local/Dockerfile:1",
        "note": "PHP base dùng tag release line; composer stage dùng major tag ở dòng 3."
      },
      {
        "kind": "F",
        "ref": "compose.local.yaml:5",
        "note": "PostgreSQL dùng major tag; backend dùng dev tag (25); test profile tương tự (79,100)."
      }
    ],
    "failure_scenario": "Hai lần pull/build cùng source ở thời điểm khác nhau → có thể dùng image bytes khác dù source/lockfile không đổi.",
    "affected_paths": [
      "deploy/local/Dockerfile",
      "compose.local.yaml"
    ],
    "related_prior_finding": null,
    "proposed_fix": "Khi cần release reproducible, lưu resolved digest và quy trình cập nhật; vẫn giữ lockfile/check-platform-reqs.",
    "proposed_lane": "bugfix thường",
    "risk_of_fix": "LOW"
  }
]
```
