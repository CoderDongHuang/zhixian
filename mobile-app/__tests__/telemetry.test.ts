import { initializeSentry, sentryOptions } from "../src/sentry-config";

test("Sentry initializes once with privacy-safe defaults", () => {
  const init = jest.fn();
  initializeSentry(init);
  initializeSentry(init);

  expect(init).toHaveBeenCalledTimes(1);
  const options = init.mock.calls[0][0];
  expect(options).toBe(sentryOptions);
  expect(options.sendDefaultPii).toBe(false);
  expect(options).not.toHaveProperty("replaysSessionSampleRate");
  expect(options).not.toHaveProperty("replaysOnErrorSampleRate");
  expect(options).not.toHaveProperty("integrations");
});
