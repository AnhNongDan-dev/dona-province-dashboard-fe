import { initContract } from "@ts-rest/core";
import { centralAuthContract } from "./central-auth.contract";
import { connectionContract } from "./connection.contract";
import { linkTransactionContract } from "./link-transaction.contract";

const c = initContract();

// Add domain contracts here: `Xxx: xxxContract` (see skill ts-rest-contract).
export const appContract = c.router({
  CentralAuth: centralAuthContract,
  LinkTransaction: linkTransactionContract,
  Connection: connectionContract,
});
