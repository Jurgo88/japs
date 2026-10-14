import { NonRetryableError } from "cloudflare:workflows";
import { WorkflowEntrypoint, type WorkflowEvent, type WorkflowStep, type WorkflowStepConfig } from "cloudflare:workers";
import { Store } from "./db.ts";
import type { Env, ProjectJobParams } from "./env.ts";
import { runDiscovery, runProject } from "./pipeline.ts";
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
          return await runDiscovery(user(), { env: this.env, fetch });
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
  }
}

export class ProjectWorkflow extends WorkflowEntrypoint<Env, ProjectJobParams> {
  async run(event: WorkflowEvent<ProjectJobParams>, step: WorkflowStep) {
    const { userId, jobId, key } = event.payload;
    const user = () => new Store(this.env.DB).forUser(userId);
    try {
      const result = await step.do(`facts and texts: ${key}`.slice(0, 256), RETRY, async () => {
        try {
          return await runProject(user(), key, { env: this.env, fetch });
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
