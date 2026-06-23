import { Queue, Worker, Job } from "bullmq";
import IORedis, { Redis, Cluster } from "ioredis";
import { ConnectionOptions } from "bullmq";
import { QueueName, JobPayload } from "@monet/job-contracts/src/queues";

const connection = new IORedis({
  host: "127.0.0.1",
  port: 6379,
  maxRetriesPerRequest: null,
}) as ConnectionOptions;

const queues = new Map<QueueName, Queue>();

export function getQueue(name: QueueName): Queue {
  if (!queues.has(name)) {
    queues.set(
      name,
      new Queue(name, {
        connection,
        defaultJobOptions: {
          attempts: 3,
          backoff: { type: "exponential", delay: 2000 },
          removeOnComplete: true,
          removeOnFail: false,
        },
      })
    );
  }

  return queues.get(name)!;
}

export async function enqueueJob<T extends QueueName>(
  name: T,
  payload: JobPayload<T>
) {
  const queue = getQueue(name);

  return queue.add(name, payload, {
    timestamp: Date.now(),
  });
}

// Worker helper
export function createWorker<T extends QueueName>(
  name: T,
  processor: (job: Job<JobPayload<T>>) => Promise<void>
) {
  return new Worker(
    name,
    async (job) => {
      try {
        await processor(job as Job<JobPayload<T>>);
      } catch (err) {
        console.error(`[Worker:${name}] Error`, err);
        throw err;
      }
    },
    { connection }
  );
}