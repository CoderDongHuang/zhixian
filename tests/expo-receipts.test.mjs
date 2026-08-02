import test from "node:test";
import assert from "node:assert/strict";
import { classifyExpoReceipt } from "../lib/expo-receipts.mjs";

test("Expo receipt confirms delivery", () => assert.deepEqual(classifyExpoReceipt({ status: "ok" }), { state: "delivered", code: "DELIVERED", message: null }));
test("Expo receipt expires unregistered devices", () => assert.equal(classifyExpoReceipt({ status: "error", message: "gone", details: { error: "DeviceNotRegistered" } }).state, "expired"));
test("Expo receipt keeps missing receipts pending", () => assert.equal(classifyExpoReceipt(undefined).state, "pending"));
