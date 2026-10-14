import { NonRetryableError } from "cloudflare:workflows";
import { WorkflowEntrypoint, type WorkflowEvent, type WorkflowStep, type WorkflowStepConfig } from "cloudflare:workers";
import { Store } from "./db.ts";
import type { ScreenshotTarget } from "@japs/core";
import { browserCapture } from "./browser.ts";
import type { Env, ProjectJobParams, ShotJobParams } from "./env.ts";
import { runDiscovery, runProject } from "./pipeline.ts";
import { BROWSER_LIMIT_MESSAGE, BrowserLimitError, planScreenshots, shootProject } from "./screenshots.ts";
import { ConnectionError } from "./tokens.ts";

/**
 * Background jobs (#32, ADR 0009). The free plan allows 50 external subrequests per instance,
 * so discovery runs once per user and every project gets its own instance (~15 requests).
 * The logic lives in pipeline.ts; these classes only sequence steps and report progress.
 */

const message = (err: unknown) => (err instanceof Error ? err.message : String(err));
const RETRY = {
  retries: { limit: 2, delay: "10 seconds", backoff: "exponential" },
  timeout: "5 minutes",
} satisfies WorkflowStepConfig;

export class SyncWorkflow extends WorkflowEntrypoint<Env, { userId: string; jobId: string }> {
  async run(event: WorkflowEvent<{ userId: string; jobId: string }>, step: WorkflowStep) {
    const { userId, jobId } = event.payload;
    const user = () => new Store(this.env.DB).forUser(userId);

    let found: { projects: number; refresh: string[] };
    try {
      found = await step.do("discover", RETRY, async () => {
        try {
          return await runDiscovery(user(), { env: this.env, fetch: (input, init) => fetch(input, init) });
        } catch (err) {
          // Missing connections won't fix themselves on retry.
          if (err instanceof ConnectionError) throw new NonRetryableError(err.message);
          throw err;
        }
      });
    } catch (err) {
      await step.do("fail", async () => user().failJob(jobId, `Import failed: ${message(err)}`));
      return;
    }

    const keys = found.refresh;
    await step.do("plan", async () => {
      await user().planJob(
        jobId,
        keys.length,
        keys.length
          ? `Found ${found.projects} projects; updating ${keys.length} in your portfolio…`
          : `Found ${found.projects} projects. Pick the ones for your portfolio, then generate their texts.`,
      );
    });

    // createBatch takes up to 100 instances at a time.
    for (let i = 0; i < keys.length; i += 100) {
      const chunk = keys.slice(i, i + 100);
      await step.do(`start projects ${i + 1}-${i + chunk.length}`, async () => {
        await this.env.PROJECT_JOBS!.createBatch(chunk.map((key) => ({ params: { userId, jobId, key } })));
      });
    }
    // Sites redeployed since their last shot get a new one; fresh shots are skipped in the plan.
    if (keys.length && this.env.SHOT_JOBS) {
      await step.do("start screenshots", async () => {
        await this.env.SHOT_JOBS!.create({ params: { userId, keys } });
      });
    }
  }
}

/** Browser Run on the free plan: one new browser per 20 s and 10 minutes a day (#33). */
const SHOT_RETRY = {
  retries: { limit: 3, delay: "30 seconds", backoff: "linear" },
  timeout: "2 minutes",
} satisfies WorkflowStepConfig;

/**
 * Screenshots for one user, one project at a time, paced to the browser limits. A site that
 * fails is skipped; when the day's browser time is used up, the rest waits for the next run.
 */
export class ScreenshotWorkflow extends WorkflowEntrypoint<Env, ShotJobParams> {
  async run(event: WorkflowEvent<ShotJobParams>, step: WorkflowStep) {
    const { userId, keys } = event.payload;
    const user = () => new Store(this.env.DB).forUser(userId);
    const { BROWSER, SHOTS } = this.env;
    if (!BROWSER || !SHOTS) return;

    const targets: ScreenshotTarget[] = await step.do("plan", async () => planScreenshots(user(), keys));
    for (const [i, target] of targets.entries()) {
      if (i > 0) await step.sleep(`pace ${i}`, "20 seconds");
      try {
        await step.do(`shot ${i + 1}: ${target.key}`.slice(0, 256), SHOT_RETRY, async () => {
          try {
            const shots = await shootProject(user(), userId, SHOTS, target, browserCapture(BROWSER), new Date());
            return shots.length;
          } catch (err) {
            if (err instanceof BrowserLimitError) throw new NonRetryableError(BROWSER_LIMIT_MESSAGE);
            throw err;
          }
        });
      } catch (err) {
        if (message(err) === BROWSER_LIMIT_MESSAGE) {
          console.warn(`screenshots for ${userId}: ${BROWSER_LIMIT_MESSAGE}`);
          return;
        }
        console.warn(`screenshot ${target.key} failed: ${message(err)}`);
      }
    }
  }
}

export class ProjectWorkflow extends WorkflowEntrypoint<Env, ProjectJobParams> {
  async run(event: WorkflowEvent<ProjectJobParams>, step: WorkflowStep) {
    const { userId, jobId, key } = event.payload;
    const user = () => new Store(this.env.DB).forUser(userId);
    try {
      const result = await step.do(`facts and texts: ${key}`.slice(0, 256), RETRY, async () => {
        try {
          return await runProject(user(), key, { env: this.env, fetch: (input, init) => fetch(input, init) });
        } catch (err) {
          if (err instanceof ConnectionError) throw new NonRetryableError(err.message);
          throw err;
        }
      });
      await step.do("report", async () => {
        const problem = result.warnings.find((w) => w.startsWith(key));
        await user().reportJobProject(jobId, problem ? { ok: false, problem } : { ok: true });
      });
    } catch (err) {
      await step.do("report failure", async () => user().reportJobProject(jobId, { ok: false, problem: `${key}: ${message(err)}` }));
    }
  }
}
