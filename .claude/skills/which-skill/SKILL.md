---
name: which-skill
description: Bản đồ quyết định "khi nào dùng skill nào" cho repo dona-province-dashboard-fe (DONA Province Dashboard). Dùng khi bạn (hoặc người dùng) phân vân nên gọi skill nào cho một việc thiết kế / sinh ảnh / dựng UI / form / route / table / sync backend. Khi người dùng hỏi "có skill nào cho việc X không", "nên dùng skill nào", "design lại trang này dùng gì", hãy đọc skill này TRƯỚC rồi mới chọn. Bao trùm bộ taste-skill (12 skill thiết kế/ảnh) + các skill kỹ thuật của project (zod-form, tanstack-*, repository-pattern, ts-rest-contract, sync-*).
---

# which-skill — Khi nào dùng skill nào

Mục đích: tránh chọn nhầm hoặc bỏ sót skill. Đọc bảng theo **ý định (intent)**, không theo tên skill.

## Cách dùng nhanh

1. Xác định bạn đang làm **loại việc gì** (5 nhóm bên dưới).
2. Vào đúng nhóm, đọc cột "Khi nào" → khớp với yêu cầu thật.
3. Gọi skill bằng tên ở cột "Skill".
4. Nếu nhiều skill cùng khớp, xem mục **Ưu tiên & kết hợp** ở cuối.

Quy ước phân biệt quan trọng:
- **"Sinh ảnh thiết kế" (imagegen / image)** = tạo ra *file ảnh* để tham khảo/duyệt — KHÔNG viết code.
- **"Dựng UI / code"** = viết React/Tailwind thật trong repo.
- **"Taste / design system"** = bộ quy tắc thẩm mỹ áp lên việc code, không tự sinh ảnh.

---

## NHÓM 1 — Sinh ẢNH thiết kế (chỉ ra file ảnh, không code)

| Khi nào | Skill |
|---|---|
| Cần ảnh concept **web/landing**: mỗi section một ảnh ngang để dev/coding-model dựng lại | `imagegen-frontend-web` |
| Cần ảnh concept **app mobile** (iOS/Android), nhiều màn trong khung điện thoại | `imagegen-frontend-mobile` |
| Cần **brand kit / logo system / identity deck / brand guidelines board** | `brandkit` |
| Có **ảnh/screenshot** rồi, muốn vừa sinh ảnh thiết kế vừa **code ra website khớp ảnh** | `image-to-code` |

> Phân biệt: `imagegen-*` chỉ ra ảnh. `image-to-code` ra ảnh **rồi code**. Nếu user đưa screenshot và nói "làm thành web chạy được" → `image-to-code`.

---

## NHÓM 2 — TASTE / Design system (quy tắc thẩm mỹ áp lên code)

| Khi nào | Skill |
|---|---|
| Làm **landing page / portfolio / redesign** chống "giao diện AI mẫu" (anti-slop), tự suy ra hướng design | `design-taste-frontend` |
| Muốn web trông **"đắt tiền", chuẩn agency cao cấp** (font, spacing, shadow, card, animation) | `high-end-visual-design` |
| Cần **GSAP motion nâng cao** (pin, stack, scrub ScrollTrigger), bố cục editorial random hoá, bento gapless | `gpt-taste` |
| Sinh file **DESIGN.md** ngữ nghĩa cho **Google Stitch** | `stitch-design-taste` |

---

## NHÓM 3 — Phong cách UI cụ thể (chọn 1 theo "mood")

| Khi nào | Skill |
|---|---|
| Muốn **tối giản, editorial, monochrome ấm**, không gradient/shadow nặng | `minimalist-ui` |
| Muốn **brutalist công nghiệp**: grid cứng, type tương phản cực mạnh, cảm giác blueprint/terminal | `industrial-brutalist-ui` |

> Đây là các "preset phong cách". Chọn đúng 1 theo gu mong muốn; đừng gọi cùng lúc 2 preset xung khắc.

---

## NHÓM 4 — Nâng cấp / chất lượng đầu ra

| Khi nào | Skill |
|---|---|
| **Redesign / nâng cấp web hoặc app đã có sẵn** lên chất lượng premium, audit trước rồi sửa, không phá chức năng | `redesign-existing-projects` |
| Output bị **cắt ngắn / chèn placeholder** ("// ... rest of code"); cần code đầy đủ không lược | `full-output-enforcement` |

> `design-taste-frontend` cũng làm redesign nhưng thiên landing/portfolio. Với **app/web đang chạy cần giữ chức năng** → `redesign-existing-projects`.

---

## NHÓM 5 — Kỹ thuật repo dona-province-dashboard-fe (convention của codebase này)

> Repo còn là skeleton: hạ tầng mà `zod-form`, `zod-form-trigger-dialog`, `tanstack-table`, `ui-preview-route` dựa vào vẫn nằm ở ELP-fe — mỗi skill đó có note "Not ported yet" liệt kê file cần port trước.

Các skill này đã tự kích hoạt theo mô tả, nhưng đây là bản đồ nhanh:

| Khi nào | Skill |
|---|---|
| Tạo **form** (create/edit/modal/drawer) từ Zod schema + displayOptions | `zod-form` |
| Tạo nút **"Tạo X" / "Cập nhật X"** mở dialog form tại chỗ (thay trang `/new`, `/edit`) | `zod-form-trigger-dialog` |
| Trang **data-table**: list phân trang, search/filter, sort, row action, bulk select | `tanstack-table` |
| Tạo/sửa **route**, loader, guard, search params, navigation (file-based routing) | `tanstack-router` |
| Cần **type từ router** (NavigateOptions, route paths, params...) | `use-router-types` |
| Tầng **data-fetching**: repository module, loader, invalidate query, mapToDTO | `repository-pattern` |
| Tạo/sửa **ts-rest contract** trong `packages/zod-schemas/src/api-contract/` | `ts-rest-contract` |
| Muốn **xem nhanh một mảnh UI** trong app (preview route, không cần login/Playwright) | `ui-preview-route` |

### Sync khi BACKEND đổi (chạy theo thứ tự)

`check-backend` → `sync-prisma-schema` → `sync-entity-schemas` → `sync-contract-from-backend`. Mỗi bước feed bước sau; chỉ chạy bước cần thiết (xem CLAUDE.md mục "Sync workflows").

---

## Ưu tiên & kết hợp (khi nhiều skill cùng khớp)

- **Ảnh trước, code sau**: dùng `imagegen-frontend-web` để duyệt concept → rồi `image-to-code` hoặc dựng tay với một skill taste.
- **Taste + phong cách**: 1 skill taste (NHÓM 2) đặt "chuẩn chất lượng" + tối đa 1 preset phong cách (NHÓM 3). Không trộn 2 preset.
- **Redesign app đang chạy**: `redesign-existing-projects` (audit-first) làm chủ; có thể mượn nguyên tắc từ `high-end-visual-design`.
- **Code dài hay bị cắt**: bật kèm `full-output-enforcement` cùng bất kỳ skill code/taste nào.
- **Việc trong repo này**: ưu tiên NHÓM 5 (đúng convention dự án) hơn các skill taste chung chung. Skill taste để định hướng thẩm mỹ; skill NHÓM 5 để code đúng cấu trúc (route/form/table/repo).

## Mặc định khi không chắc

- Yêu cầu mơ hồ kiểu "làm trang đẹp" → hỏi 1 câu: **sinh ảnh concept** hay **code thật**? rồi rẽ NHÓM 1 vs NHÓM 2/3/5.
- Việc đụng tới API/route/form/table của repo này → luôn ưu tiên NHÓM 5.
