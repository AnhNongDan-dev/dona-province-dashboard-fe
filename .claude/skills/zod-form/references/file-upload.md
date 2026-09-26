# ZodForm — File Upload

File upload is the most complex ZodForm flow. Two fields, two APIs, partial-failure handling, and (for edit) diffing against existing state. **Always extract the logic into a named helper** — keeping it inside `contractAPI` makes routes unreadable and non-reusable.

## The three file fields

| Field | Schema helper | Renders | Value type |
|---|---|---|---|
| Upload-only (create) | `commonZod.uploadFiles` | `FileUploadField` (drag-and-drop) | `File[]` |
| Existing files (edit) | `commonZod.previewFiles` | `FilePreviewField` (list + download + soft-delete) | `Attachment[]` |
| Both (edit with additions) | Both, on different keys | Both fields stacked | — |

`Attachment` shape (from `packages/zod-schemas/src/common.ts`):
```ts
type Attachment = {
  id: number;
  fileName: string;
  fileSize: number;
  contentType: string;
  downloadUrl: string;
}
```

## Pattern A — Create with file upload (single shot)

The simplest shape. One `uploadFiles` field. Steps:

1. Submit fields → backend creates the record and returns **presigned S3 URLs** per file in the response.
2. Upload each file's bytes to its presigned URL in parallel.
3. Show success (or partial failure) toast.

```ts
schema: widgetContract.create.body
  .omit({ attachments: true })
  .extend({ attachments: commonZod.uploadFiles.min(1).max(5) }),

contractAPI: async (body) => {
  const { attachments, ...baseData } = body;

  // 1. Create record — send metadata only
  const res = await clientAPI.Widget.create({
    body: {
      ...baseData,
      attachments: attachments.map((f) => ({
        fileName: f.name,
        fileSize: f.size,
        contentType: f.type,
      })),
    },
  });
  if (!res.success) return res;

  // 2. Upload bytes to S3 using presigned URLs from response
  await uploadFilesToS3Parallel(res.data.attachments, attachments);

  return res;
},
```

`uploadFilesToS3Parallel` is at `apps/frontend/src/utils/s3-upload.ts`. It takes `(attachmentsWithPresignedUrls, fileObjects)` and returns `Array<{ success: boolean; ... }>`.

## Pattern B — Edit with existing-files preview + new uploads

Two file fields: `existingFiles` (what's already on the server, user can delete) and `newFiles` (what the user is adding now). Cap `newFiles` by remaining slots.

```ts
schema: widgetContract.update.body
  .omit({ attachments: true })
  .extend({
    existingFiles: commonZod.previewFiles,
    newFiles: commonZod.uploadFiles.max(Math.min(10 - widget.attachments.length, 10)),
  })
  .superRefine(({ existingFiles, newFiles }, ctx) => {
    if (existingFiles.length + newFiles.length === 0) {
      ctx.addIssue({
        code: 'custom',
        message: 'Phải có ít nhất 1 tập tin đính kèm',
        path: ['existingFiles'],
      });
    }
  }),

defaultValues: {
  id: widget.id,
  name: widget.name,
  existingFiles: widget.attachments,  // seed with the current list
  newFiles: [],
},

displayOptions: {
  id:            { hidden: true },
  existingFiles: { label: 'Tập tin hiện tại', colSpan: 6,
                   hidden: widget.attachments.length === 0 },
  newFiles:      { label: 'Tải lên mới',      colSpan: 6 },
},
```

### The diff — existing vs. deleted

`FilePreviewField` implements soft-delete with undo. When the user deletes a file, it's **removed from `existingFiles`** in form state. That means you can diff against the initial attachments to know what was deleted:

```ts
contractAPI: async (body) => {
  const { existingFiles, newFiles, ...baseData } = body;

  // What's no longer in existingFiles was deleted
  const currentIds = new Set(existingFiles.map((f) => f.id));
  const deletedAttachments = widget.attachments
    .filter((f) => !currentIds.has(f.id))
    .map((f) => ({
      fileName: f.fileName,
      fileSize: f.fileSize,
      contentType: f.contentType,
      isDeleted: true,
    }));

  // Build the full attachments payload: new + deleted
  const attachmentsPayload = [
    ...newFiles.map((f) => ({
      fileName: f.name,
      fileSize: f.size,
      contentType: f.type,
      isDeleted: false,
    })),
    ...deletedAttachments,
  ];

  // Single API call; response has presigned URLs for the new ones
  const res = await clientAPI.Widget.update({
    params: { widgetId: widget.id },
    body: { ...baseData, attachments: attachmentsPayload },
  });
  if (!res.success) return res;

  if (newFiles.length > 0) {
    await uploadFilesToS3Parallel(res.data.attachments, newFiles);
  }
  return res;
},
```

## Pattern C — Extract to a named helper (recommended for anything non-trivial)

Rule of thumb: if `contractAPI` grows past ~20 lines or you need the same flow in multiple routes (create + edit + partial-edit), extract it.

**Naming convention**: `{domain}-attachments.helper.ts`, colocated with the routes, exports a single function named `handle{Domain}Attachments`.

Template (based on `apps/frontend/src/routes/app/dossiers/-dossier-attachments.helper.ts`):

```ts
// routes/app/widgets/-widget-attachments.helper.ts
import { ErrorCode, StatusCode } from '@repo/zod-schemas/src/api/error.schema';
import type { IResponse } from "@repo/zod-schemas/src/api/response";
import { clientAPI } from '@/config/clientAPI.config';
import { uploadFilesToS3Parallel } from '@/utils/s3-upload';

interface HandleWidgetAttachmentsParams {
  widgetId: number;
  newFiles: File[];
  deletedAttachmentIds?: number[];
}

/**
 * Upload new files + mark deleted ones. Atomic from the caller's POV.
 * Returns IResponse so callers can surface the error normally.
 */
export async function handleWidgetAttachments({
  widgetId,
  newFiles,
  deletedAttachmentIds = [],
}: HandleWidgetAttachmentsParams): Promise<IResponse<undefined>> {
  if (newFiles.length === 0 && deletedAttachmentIds.length === 0) {
    return { success: true, data: undefined };
  }

  const attachments = [
    ...newFiles.map((f) => ({
      fileName: f.name, fileSize: f.size, contentType: f.type, isDeleted: false,
    })),
    ...deletedAttachmentIds.map((id) => ({ id, isDeleted: true })),
  ];

  const res = await clientAPI.Widget.updateFiles({
    params: { widgetId: String(widgetId) },
    body: { attachments },
  });
  if (!res.success) return res;

  if (newFiles.length > 0) {
    const results = await uploadFilesToS3Parallel(res.data, newFiles);
    const allSuccessful = results.every((r) => r.success);
    if (!allSuccessful) {
      const failed = results
        .map((r, i) => (!r.success ? newFiles[i].name : null))
        .filter(Boolean);

      // Roll back: mark the failed uploads as deleted so the server cleans up
      await clientAPI.Widget.updateFiles({
        params: { widgetId: String(widgetId) },
        body: {
          attachments: newFiles.map((f) => ({
            fileName: f.name, fileSize: f.size, contentType: f.type, isDeleted: true,
          })),
        },
      });

      return {
        success: false,
        statusCode: StatusCode.BadRequest,
        errorCode: ErrorCode.BadRequest,
        message: `Upload thất bại: ${failed.join(', ')}`,
      };
    }
  }
  return { success: true, data: undefined };
}
```

Then `contractAPI` is short:

```ts
contractAPI: async (body) => {
  const { existingFiles, newFiles, ...baseData } = body;
  const deletedIds = widget.attachments
    .filter((f) => !existingFiles.some((e) => e.id === f.id))
    .map((f) => f.id);

  const updateRes = await clientAPI.Widget.update({
    params: { widgetId: widget.id },
    body: baseData,
  });
  if (!updateRes.success) return updateRes;

  const filesRes = await handleWidgetAttachments({
    widgetId: widget.id,
    newFiles,
    deletedAttachmentIds: deletedIds,
  });
  if (!filesRes.success) {
    // Widget was updated but files failed — route user to the file-edit page
    setTimeout(() => navigate({ to: '/app/widgets/$id/edit-files', params: { id: String(widget.id) } }), 100);
    return filesRes;
  }
  return updateRes;
},
```

## Cap the new-files count by remaining slots

When a resource has a max-files limit, compute the cap at schema construction, not inside the field:

```ts
newFiles: commonZod.uploadFiles.max(Math.min(10 - widget.attachments.length, 10)),
```

- The `Math.min(…, 10)` guards against negatives (edge case: somehow server has more than the limit).
- The `FileUploadField` shows the remaining-slots count in its helper text once you set `.max(N)`.

## Naming fields for auto-detection (fallback)

If for some reason you don't use `commonZod.uploadFiles` / `commonZod.previewFiles`, you can rely on **name-based detection** (rows 11-12 of the detection table):

- Name contains `existingfiles`, `existingattachments`, `previewfiles` → `FilePreviewField`
- Name contains `attachment`, `file`, `uploadfiles` → `FileUploadField`

But prefer the description-based helpers — they're less fragile to name changes.

## `FilePreviewField` — what the user can do

- See each file with name + size + type icon
- Click to download (uses `attachment.downloadUrl` from the server)
- Click the X to soft-delete (removes from form state; shows an undo toast)
- Can be toggled read-only via `displayOption.readonly: true` (hides the delete button)

**`onFileDownload` is not a thing** — do not pass it. Download is internal.

## Pitfalls

- **Forgetting `defaultValues.existingFiles`** — the field renders as "(no files)" even though the resource has attachments. Always seed with `widget.attachments`.
- **Mixing file fields with `.superRefine` at the root** — when you `.omit({ attachments: true }).extend({...})`, the `.superRefine` must come **after** the extend (schemas compose left-to-right; refines attach to what came before).
- **Sending a `File` object to a JSON API** — won't work. Always map to `{ fileName, fileSize, contentType }` metadata first; the actual bytes go to S3 separately.
- **Partial-failure recovery** — if the record was created/updated but some file bytes failed, the user should **not** see a flat error. Either: (a) retry-and-mark-deleted the failed ones automatically (Pattern C), or (b) navigate the user to the file-edit page with a toast explaining what failed.
