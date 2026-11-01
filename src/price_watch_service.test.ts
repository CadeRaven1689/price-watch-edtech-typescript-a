import { strict as assert } from "node:assert";
import { chooseReviewAction } from "./price_watch_service.ts";

const nearDeadline = new Date(Date.now() + 2 * 86400000);
assert.equal(chooseReviewAction("TypeScript", ["TypeScript for educators"], nearDeadline), "review");
assert.equal(chooseReviewAction("TypeScript", ["Python basics"], nearDeadline), "wait");
console.log("business decision test passed");
