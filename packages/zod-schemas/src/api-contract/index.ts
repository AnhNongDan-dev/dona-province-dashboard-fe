import { initContract } from "@ts-rest/core";
import { centralAuthContract } from "./central-auth.contract";

const c = initContract();

// Add domain contracts here: `Xxx: xxxContract` (see skill ts-rest-contract).
export const appContract = c.router({
  CentralAuth: centralAuthContract,
});
