import { ErrorCode } from "@repo/zod-schemas/src/api/error.schema";
import type { ErrorResponse } from "@repo/zod-schemas/src/api/response";
import { LinkAction } from "@repo/zod-schemas/src/entity/link-transaction-schema";
import {
  MergeKeep,
  MergeState,
  type MergeTransaction,
  mergeTransactionSchema,
} from "@repo/zod-schemas/src/entity/merge-transaction-schema";
import { createFileRoute } from "@tanstack/react-router";
import { type FormEvent, useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Spinner } from "@/components/ui/spinner";
import { clientAPI } from "@/config/clientAPI.config";
import { queryClient } from "@/config/query-client.config";
import { formatSeconds, useCountdown, useSecondsUntil } from "@/hooks/use-countdown";
import { errorMessage, errorParam } from "@/lib/api-error";
import { loadSession } from "@/lib/central-session";
import {
  accountLine,
  contactText,
  ErrorAlert,
  failureMessage,
  IdentityColumn,
  MergeShell,
  StepCard,
} from "./-components/merge-parts";

// S14 — gộp tài khoản (D22). Tài khoản đang đăng nhập (target) được giữ lại; tài khoản đăng nhập
// ở bước 2 (source) ngừng dùng. Dựng theo state + allowedActions; không cache (mỗi bước là một
// thao tác trên giao dịch). Trang nằm ngoài layout ứng dụng để lỗi phiên xử lý tại chỗ.
type TxResult = { ok: true; tx: MergeTransaction } | { ok: false; error: ErrorResponse };

async function fetchTx(txId: string): Promise<TxResult> {
  const res = await clientAPI.MergeTransaction.getMergeTransaction({ params: { txId } });
  return res.success
    ? { ok: true, tx: mergeTransactionSchema.parse(res.data) }
    : { ok: false, error: res };
}

// Giao dịch đã đổi trạng thái phía BE → đọc lại thay vì đoán.
const RELOAD_CODES: string[] = [
  ErrorCode.MergeTxInvalidState,
  ErrorCode.MergeTxNotFound,
  ErrorCode.MergeTxExpired,
  ErrorCode.MergeConflictUnresolved,
  ErrorCode.MergeRequiresAdmin,
  ErrorCode.SessionExpired,
  ErrorCode.SessionChanged,
];

export const Route = createFileRoute("/merge/$txId")({
  loader: ({ params }) => fetchTx(params.txId),
  staleTime: 0,
  gcTime: 0,
  component: MergePage,
});

type Step = {
  tx: MergeTransaction;
  setTx: (data: unknown) => void;
  reload: () => Promise<void>;
  fail: (res: ErrorResponse) => string;
  can: (a: LinkAction) => boolean;
  cancel: () => Promise<void>;
};

function MergePage() {
  const { txId } = Route.useParams();
  const [result, setResult] = useState<TxResult>(Route.useLoaderData());
  const reload = useCallback(async () => setResult(await fetchTx(txId)), [txId]);

  if (!result.ok) {
    const gone = ([ErrorCode.MergeTxNotFound, ErrorCode.MergeTxExpired] as string[]).includes(
      result.error.errorCode,
    );
    return (
      <MergeShell>
        <StepCard
          title={gone ? "Phiên gộp tài khoản đã hết hạn" : "Không tải được phiên gộp tài khoản"}
          description={
            gone
              ? "Việc gộp chỉ làm được trên đúng trình duyệt đã bắt đầu và trong 10 phút. Hãy bắt đầu lại từ trang Bảo mật."
              : errorMessage(result.error)
          }
        >
          {!gone && <Button onClick={() => void reload()}>Thử lại</Button>}
          <BackButton href="/account/security" />
        </StepCard>
      </MergeShell>
    );
  }

  const tx = result.tx;
  const step: Step = {
    tx,
    setTx: (data) => setResult({ ok: true, tx: mergeTransactionSchema.parse(data) }),
    reload,
    fail: (res) => {
      if (
        res.errorCode === ErrorCode.SessionExpired ||
        res.errorCode === ErrorCode.SessionChanged
      ) {
        // Bộ xử lý phiên chung bỏ qua 2 mã này ở trang giao dịch → tự đọc lại D1.
        void loadSession().catch(() => null);
      }
      if (RELOAD_CODES.includes(res.errorCode)) void reload();
      return errorMessage(res);
    },
    can: (a) => tx.allowedActions.includes(a),
    cancel: async () => {
      const res = await clientAPI.MergeTransaction.cancelMergeTransaction({ params: { txId } });
      if (res.success) setResult({ ok: true, tx: mergeTransactionSchema.parse(res.data) });
      else toast.error(step.fail(res));
    },
  };

  return (
    <MergeShell>
      {tx.state === MergeState.AWAITING_CENTRAL_LOGIN ? (
        <SourceLoginStep step={step} />
      ) : tx.state === MergeState.CENTRAL_VERIFIED ? (
        <ConfirmStep step={step} />
      ) : tx.state === MergeState.COMPLETED ? (
        <CompletedStep tx={tx} />
      ) : (
        <EndedStep tx={tx} />
      )}
    </MergeShell>
  );
}

function BackButton({ href, label = "Về Bảo mật" }: { href: string; label?: string }) {
  return (
    <Button asChild variant="outline">
      <a href={href}>{label}</a>
    </Button>
  );
}

/** Đồng hồ hạn giao dịch; hết giờ thì đọc lại (BE là bên quyết hết hạn). */
function useTxCountdown({ tx, reload }: Step) {
  const left = useSecondsUntil(tx.expiresAt);
  useEffect(() => {
    if (left === 0) void reload();
  }, [left, reload]);
  return left;
}

function SourceLoginStep({ step }: { step: Step }) {
  const { tx } = step;
  const left = useTxCountdown(step);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const lock = useCountdown();

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const data = new FormData(form);
    const loginId = String(data.get("loginId") ?? "").trim();
    const password = String(data.get("password") ?? "");
    if (!loginId || !password) return setError("Vui lòng nhập đủ định danh và mật khẩu");

    setPending(true);
    setError(null);
    // Chỉ xác thực tài khoản thứ hai — phiên giữ nguyên, không đọc lại D1, không báo các tab khác.
    const res = await clientAPI.MergeTransaction.centralLoginMergeTransaction({
      params: { txId: tx.txId },
      body: { loginId, password },
    });
    setPending(false);
    if (res.success) return step.setTx(res.data);

    const passwordInput = form.elements.namedItem("password");
    if (passwordInput instanceof HTMLInputElement) passwordInput.value = "";
    if (res.errorCode === ErrorCode.RateLimited) {
      lock.start(errorParam(res, "retryAfterSeconds", "number") ?? 60);
    }
    setError(step.fail(res));
  }

  return (
    <StepCard
      title="Đăng nhập tài khoản SSO muốn gộp vào"
      description={
        <>
          Tài khoản đang đăng nhập (<strong>{tx.target.displayName}</strong> ·{" "}
          {tx.target.maskedLoginId}) sẽ được <strong>giữ lại</strong>. Tài khoản bạn đăng nhập dưới
          đây sẽ <strong>ngừng dùng</strong> sau khi gộp.
        </>
      }
      secondsLeft={left}
    >
      <p className="text-sm text-muted-foreground">
        Máy dùng chung: chỉ gộp các tài khoản đều là của chính bạn.
      </p>
      <ErrorAlert
        message={
          error &&
          (lock.secondsLeft > 0
            ? `${error} Thử lại sau ${formatSeconds(lock.secondsLeft)}.`
            : error)
        }
      />
      <form onSubmit={onSubmit} noValidate>
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="loginId">Tên đăng nhập, email hoặc số điện thoại</FieldLabel>
            <Input id="loginId" name="loginId" autoComplete="off" autoFocus />
          </Field>
          <Field>
            <FieldLabel htmlFor="password">Mật khẩu của tài khoản đó</FieldLabel>
            <Input id="password" name="password" type="password" autoComplete="off" />
          </Field>
          <Button
            type="submit"
            disabled={pending || lock.secondsLeft > 0 || !step.can(LinkAction.CENTRAL_LOGIN)}
          >
            {pending && <Spinner />}
            Tiếp tục
          </Button>
        </FieldGroup>
      </form>
      {step.can(LinkAction.CANCEL) && (
        <Button variant="outline" onClick={() => void step.cancel()}>
          Hủy
        </Button>
      )}
    </StepCard>
  );
}

function ConfirmStep({ step }: { step: Step }) {
  const { tx } = step;
  const left = useTxCountdown(step);
  const conflicts = tx.conflicts ?? [];
  const blocked = conflicts.filter((c) => !c.resolvable);
  const [keep, setKeep] = useState<Record<string, MergeKeep>>({});
  const [acknowledged, setAcknowledged] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const source = tx.source;
  if (!source) return null; // CENTRAL_VERIFIED luôn có source

  const allChosen = conflicts.every((c) => !c.resolvable || keep[c.providerCode]);

  async function confirm() {
    setPending(true);
    setError(null);
    const res = await clientAPI.MergeTransaction.confirmMergeTransaction({
      params: { txId: tx.txId },
      body: {
        acknowledged: true,
        conflictResolutions: Object.entries(keep).map(([providerCode, k]) => ({
          providerCode,
          keep: k,
        })),
      },
    });
    setPending(false);
    if (res.success) {
      step.setTx(res.data);
      // Liên kết + kênh liên lạc của tài khoản giữ lại đã đổi.
      void queryClient.invalidateQueries({ queryKey: ["me"] });
      return;
    }
    setError(step.fail(res));
  }

  return (
    <StepCard
      title="Xác nhận gộp tài khoản"
      description="Kiểm tra kỹ trước khi gộp — việc này không tự hoàn tác được."
      secondsLeft={left}
    >
      <div className="grid gap-4 md:grid-cols-2">
        <IdentityColumn
          heading="Giữ lại — tài khoản đang đăng nhập"
          tone="keep"
          identity={tx.target}
        />
        <IdentityColumn heading="Ngừng dùng — tài khoản sẽ gộp vào" tone="drop" identity={source} />
      </div>

      <div className="text-sm">
        <div className="font-medium">Sau khi gộp</div>
        <ul className="mt-1 list-disc space-y-1 pl-5 text-muted-foreground">
          <li>
            Tài khoản <strong>{source.maskedLoginId}</strong> không đăng nhập được nữa; mọi phiên
            của nó bị đăng xuất.
          </li>
          <li>Các hệ thống đã liên kết của nó chuyển sang tài khoản đang đăng nhập.</li>
          {tx.contactChanges?.moved.map((c) => (
            <li key={`m-${c.channel}`}>
              {contactText(c)} <strong>sẽ chuyển sang</strong> tài khoản này (dùng để đăng nhập và
              lấy lại mật khẩu).
            </li>
          ))}
          {tx.contactChanges?.dropped.map((c) => (
            <li key={`d-${c.channel}`}>
              {contactText(c)} <strong>sẽ không còn dùng được</strong> (tài khoản này đã có{" "}
              {c.channel === "SMS" ? "số điện thoại" : "email"} riêng).
            </li>
          ))}
        </ul>
      </div>

      {conflicts
        .filter((c) => c.resolvable)
        .map((c) => (
          <div key={c.providerCode} className="rounded-md border p-3 text-sm">
            <div className="font-medium">
              Cả hai tài khoản đều liên kết {c.providerName} — chọn account giữ lại
            </div>
            <RadioGroup
              className="mt-2"
              value={keep[c.providerCode] ?? ""}
              onValueChange={(v) => setKeep((k) => ({ ...k, [c.providerCode]: v as MergeKeep }))}
            >
              <div className="flex items-start gap-2">
                <RadioGroupItem value={MergeKeep.TARGET} id={`${c.providerCode}-t`} />
                <Label htmlFor={`${c.providerCode}-t`} className="font-normal">
                  Giữ {accountLine(c.targetAccount)} (của tài khoản giữ lại)
                </Label>
              </div>
              <div className="flex items-start gap-2">
                <RadioGroupItem value={MergeKeep.SOURCE} id={`${c.providerCode}-s`} />
                <Label htmlFor={`${c.providerCode}-s`} className="font-normal">
                  Giữ {accountLine(c.sourceAccount)} (của tài khoản ngừng dùng)
                </Label>
              </div>
            </RadioGroup>
            {keep[c.providerCode] && (
              <p className="mt-2 text-muted-foreground">
                Account{" "}
                {accountLine(
                  keep[c.providerCode] === MergeKeep.TARGET ? c.sourceAccount : c.targetAccount,
                )}{" "}
                sẽ bị hủy liên kết.
                {keep[c.providerCode] === MergeKeep.SOURCE &&
                  ` Bạn sẽ bị đăng xuất khỏi ${c.providerName} trên mọi thiết bị.`}
              </p>
            )}
          </div>
        ))}

      <ErrorAlert message={error} />

      {blocked.length > 0 || !step.can(LinkAction.CONFIRM) ? (
        <ErrorAlert
          message={`Không thể tự gộp: ${blocked.map((c) => c.providerName).join(", ")} chỉ còn đăng nhập bằng SSO và hai tài khoản đang liên kết hai account khác nhau. Liên hệ quản trị để được hỗ trợ.`}
        />
      ) : (
        <>
          <Field orientation="horizontal">
            <Checkbox
              id="ack"
              checked={acknowledged}
              onCheckedChange={(v) => setAcknowledged(v === true)}
            />
            <FieldLabel htmlFor="ack" className="font-normal">
              Tôi hiểu tài khoản {source.maskedLoginId} sẽ ngừng dùng và không đăng nhập được nữa
            </FieldLabel>
          </Field>
          {(!allChosen || !acknowledged) && (
            <p className="text-sm text-muted-foreground">
              {!allChosen
                ? "Chọn account giữ lại cho mọi hệ thống bị trùng ở trên để tiếp tục."
                : "Đánh dấu ô xác nhận để tiếp tục."}
            </p>
          )}
          <Button
            variant="destructive"
            disabled={!acknowledged || !allChosen || pending}
            onClick={() => void confirm()}
          >
            {pending && <Spinner />}
            Gộp tài khoản
          </Button>
        </>
      )}
      {step.can(LinkAction.CANCEL) && (
        <Button variant="outline" onClick={() => void step.cancel()}>
          Hủy
        </Button>
      )}
    </StepCard>
  );
}

function CompletedStep({ tx }: { tx: MergeTransaction }) {
  return (
    <StepCard title="Đã gộp tài khoản">
      <p className="text-sm">
        Đã gộp tài khoản <strong>{tx.source?.maskedLoginId}</strong> vào tài khoản này. Từ nay bạn
        chỉ cần dùng tài khoản <strong>{tx.target.maskedLoginId}</strong>.
      </p>
      <BackButton href={tx.returnUrl} />
    </StepCard>
  );
}

function EndedStep({ tx }: { tx: MergeTransaction }) {
  const title =
    tx.state === MergeState.CANCELLED
      ? "Đã hủy gộp tài khoản"
      : tx.state === MergeState.EXPIRED
        ? "Phiên gộp tài khoản đã hết hạn"
        : "Không thể gộp tài khoản";
  return (
    <StepCard title={title}>
      {tx.state === MergeState.FAILED && <ErrorAlert message={failureMessage(tx.failureCode)} />}
      {tx.state === MergeState.EXPIRED && (
        <p className="text-sm text-muted-foreground">
          Việc gộp phải hoàn tất trong 10 phút. Hãy bắt đầu lại từ trang Bảo mật.
        </p>
      )}
      <BackButton href={tx.returnUrl} />
    </StepCard>
  );
}
