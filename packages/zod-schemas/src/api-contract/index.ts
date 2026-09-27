import { initContract } from "@ts-rest/core";
import { accountCenterContract } from "./account-center.contract";
import { centralAuthContract } from "./central-auth.contract";
import { connectionContract } from "./connection.contract";
import { linkTransactionContract } from "./link-transaction.contract";
import { passwordResetContract } from "./password-reset.contract";

const c = initContract();

// Add domain contracts here: `Xxx: xxxContract` (see skill ts-rest-contract).
export const appContract = c.router({
  CentralAuth: centralAuthContract,
  LinkTransaction: linkTransactionContract,
  Connection: connectionContract,
  AccountCenter: accountCenterContract,
  PasswordReset: passwordResetContract,
});
