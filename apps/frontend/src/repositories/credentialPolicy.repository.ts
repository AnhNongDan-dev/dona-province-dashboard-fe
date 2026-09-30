import { credentialPolicySchema } from "@repo/zod-schemas/src/entity/central-auth-schema";
import { clientAPI } from "@/config/clientAPI.config";
import { createQueryRepository } from "./-factory";

// Chính sách username / password công khai (trang Bảo mật, quên mật khẩu). Gần như không đổi →
// cache mặc định.
const mapToDTO = (data: unknown) => credentialPolicySchema.parse(data);
export type CredentialPolicyDTO = ReturnType<typeof mapToDTO>;

export const credentialPolicyRepository = createQueryRepository<CredentialPolicyDTO>({
  queryKey: () => ["credential-policy"],
  queryFn: async () => {
    const res = await clientAPI.CentralAuth.getCredentialPolicy();
    if (res.success) return mapToDTO(res.data);
    throw Error(res.message, { cause: res });
  },
  // Không tải được luật → rules rỗng: FE bỏ phần kiểm trước, BE vẫn kiểm khi gửi.
  defaultData: {
    password: { minLength: 0, maxLength: 0, rules: [] },
    username: {
      minLength: 0,
      maxLength: 0,
      allowedChars: "",
      mustStartWithLetter: false,
      pattern: "",
    },
  },
});
